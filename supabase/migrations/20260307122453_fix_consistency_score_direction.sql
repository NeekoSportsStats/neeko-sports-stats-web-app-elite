/*
  # Fix 1 — Correct consistency_score direction in v_neeko_player_projection

  ## Problem
  consistency_score was calculated as:
    PERCENT_RANK() OVER (ORDER BY volatility_last_15 ASC)
  
  This gave the HIGHEST score to the most volatile (inconsistent) players,
  which then inflated their projection_final by up to +12.5% via the
  consistency_multiplier. The column name implies the opposite.

  ## Fix
  Change ORDER BY volatility_last_15 ASC → DESC so that:
  - Low volatility (consistent players) → high consistency_score → positive multiplier
  - High volatility (inconsistent players) → low consistency_score → negative multiplier

  The downstream multiplier formula is unchanged:
    CLAMP(1 + (consistency_score - 50) / 400, 0.875, 1.125)

  ## Impact
  - Consistent players now correctly receive up to +12.5% boost
  - Volatile players now correctly receive up to -12.5% dampening
  - captain_score, captain_rating, and neeko_rating all downstream-benefit from correct signal
*/

CREATE OR REPLACE VIEW afl.v_neeko_player_projection AS
 WITH schedule AS (
         SELECT v_team_schedule_2026.round_number,
            v_team_schedule_2026.match_id,
            v_team_schedule_2026.match_date,
            v_team_schedule_2026.venue,
            v_team_schedule_2026.home_team,
            v_team_schedule_2026.away_team
           FROM afl.v_team_schedule_2026
          WHERE v_team_schedule_2026.match_date > now()
        ), next_round_num AS (
         SELECT min(schedule.round_number) AS rn
           FROM schedule
        ), next_fixtures AS (
         SELECT s.round_number,
            s.match_id,
            s.match_date,
            s.venue,
            s.home_team,
            s.away_team
           FROM schedule s
             JOIN next_round_num nr ON s.round_number = nr.rn
        ), fixture_rows AS (
         SELECT next_fixtures.round_number,
            next_fixtures.match_date,
            next_fixtures.venue,
            next_fixtures.home_team AS team,
            next_fixtures.away_team AS opponent,
            true AS is_home
           FROM next_fixtures
        UNION ALL
         SELECT next_fixtures.round_number,
            next_fixtures.match_date,
            next_fixtures.venue,
            next_fixtures.away_team AS team,
            next_fixtures.home_team AS opponent,
            false AS is_home
           FROM next_fixtures
        ), baseline_2025 AS (
         SELECT v_neeko_player_recent_games.player_id,
            count(*) AS games_played_2025,
            round(avg(v_neeko_player_recent_games.fantasy_points), 2) AS baseline_avg_2025
           FROM afl.v_neeko_player_recent_games
          WHERE v_neeko_player_recent_games.season = 2025
          GROUP BY v_neeko_player_recent_games.player_id
        ), games_2026 AS (
         SELECT v_neeko_player_recent_games.player_id,
            count(*) AS games_played_2026,
            round(avg(v_neeko_player_recent_games.fantasy_points), 2) AS season_avg_2026
           FROM afl.v_neeko_player_recent_games
          WHERE v_neeko_player_recent_games.season = 2026
          GROUP BY v_neeko_player_recent_games.player_id
        ), rolling AS (
         SELECT v_neeko_player_recent_games.player_id,
            round(avg(
                CASE
                    WHEN v_neeko_player_recent_games.row_num <= 3 THEN v_neeko_player_recent_games.normalized_score
                    ELSE NULL::numeric
                END), 2) AS avg_last_3,
            round(avg(
                CASE
                    WHEN v_neeko_player_recent_games.row_num <= 5 THEN v_neeko_player_recent_games.normalized_score
                    ELSE NULL::numeric
                END), 2) AS avg_last_5,
            round(avg(
                CASE
                    WHEN v_neeko_player_recent_games.row_num <= 10 THEN v_neeko_player_recent_games.normalized_score
                    ELSE NULL::numeric
                END), 2) AS avg_last_10,
            round(avg(
                CASE
                    WHEN v_neeko_player_recent_games.row_num <= 15 THEN v_neeko_player_recent_games.normalized_score
                    ELSE NULL::numeric
                END), 2) AS avg_last_15,
            round(stddev_pop(
                CASE
                    WHEN v_neeko_player_recent_games.row_num <= 15 THEN v_neeko_player_recent_games.normalized_score
                    ELSE NULL::numeric
                END), 2) AS volatility_last_15,
            round(percentile_cont(0.10::double precision) WITHIN GROUP (ORDER BY (
                CASE
                    WHEN v_neeko_player_recent_games.row_num <= 15 THEN v_neeko_player_recent_games.fantasy_points::double precision
                    ELSE NULL::double precision
                END))::numeric, 1) AS floor_estimate,
            round(percentile_cont(0.90::double precision) WITHIN GROUP (ORDER BY (
                CASE
                    WHEN v_neeko_player_recent_games.row_num <= 15 THEN v_neeko_player_recent_games.fantasy_points::double precision
                    ELSE NULL::double precision
                END))::numeric, 1) AS ceiling_estimate,
            round(count(*) FILTER (WHERE v_neeko_player_recent_games.row_num <= 15 AND v_neeko_player_recent_games.fantasy_points >= 100)::numeric / NULLIF(count(*) FILTER (WHERE v_neeko_player_recent_games.row_num <= 15), 0)::numeric, 3) AS prob_100_plus,
            round(count(*) FILTER (WHERE v_neeko_player_recent_games.row_num <= 15 AND v_neeko_player_recent_games.fantasy_points >= 120)::numeric / NULLIF(count(*) FILTER (WHERE v_neeko_player_recent_games.row_num <= 15), 0)::numeric, 3) AS prob_120_plus,
            round(NULLIF(sum(
                CASE
                    WHEN v_neeko_player_recent_games.row_num <= 15 THEN v_neeko_player_recent_games.normalized_score *
                    CASE v_neeko_player_recent_games.row_num
                        WHEN 1 THEN 1.00
                        WHEN 2 THEN 0.90
                        WHEN 3 THEN 0.80
                        WHEN 4 THEN 0.70
                        WHEN 5 THEN 0.60
                        WHEN 6 THEN 0.50
                        WHEN 7 THEN 0.40
                        WHEN 8 THEN 0.35
                        WHEN 9 THEN 0.30
                        WHEN 10 THEN 0.25
                        ELSE 0.15
                    END
                    ELSE NULL::numeric
                END), 0::numeric) / NULLIF(sum(
                CASE
                    WHEN v_neeko_player_recent_games.row_num <= 15 AND v_neeko_player_recent_games.normalized_score IS NOT NULL THEN
                    CASE v_neeko_player_recent_games.row_num
                        WHEN 1 THEN 1.00
                        WHEN 2 THEN 0.90
                        WHEN 3 THEN 0.80
                        WHEN 4 THEN 0.70
                        WHEN 5 THEN 0.60
                        WHEN 6 THEN 0.50
                        WHEN 7 THEN 0.40
                        WHEN 8 THEN 0.35
                        WHEN 9 THEN 0.30
                        WHEN 10 THEN 0.25
                        ELSE 0.15
                    END
                    ELSE NULL::numeric
                END), 0::numeric), 2) AS weighted_recent_avg
           FROM afl.v_neeko_player_recent_games
          GROUP BY v_neeko_player_recent_games.player_id
        ), player_stats AS (
         SELECT p.player_id,
            p.player_name,
            p.team,
            COALESCE(b_1.games_played_2025, 0::bigint) AS games_played_2025,
            COALESCE(b_1.baseline_avg_2025, 0::numeric) AS baseline_avg_2025,
            COALESCE(g.games_played_2026, 0::bigint) AS games_played_2026,
            r.avg_last_3,
            r.avg_last_5,
            r.avg_last_10,
            r.avg_last_15,
            r.volatility_last_15,
            r.floor_estimate,
            r.ceiling_estimate,
            COALESCE(r.prob_100_plus, 0::numeric) AS prob_100_plus,
            COALESCE(r.prob_120_plus, 0::numeric) AS prob_120_plus,
            r.weighted_recent_avg,
            round(COALESCE(r.avg_last_3, 0::numeric) - COALESCE(r.avg_last_10, 0::numeric), 2) AS trend_3_vs_10,
                CASE
                    WHEN COALESCE(g.games_played_2026, 0::bigint) > 0 THEN COALESCE(g.season_avg_2026, b_1.baseline_avg_2025, 0::numeric)
                    ELSE COALESCE(b_1.baseline_avg_2025, 0::numeric)
                END AS season_avg_current
           FROM afl.players p
             LEFT JOIN baseline_2025 b_1 ON b_1.player_id = p.player_id
             LEFT JOIN games_2026 g ON g.player_id = p.player_id
             LEFT JOIN rolling r ON r.player_id = p.player_id
        ), projections AS (
         SELECT ps.player_id,
            ps.player_name,
            ps.team,
            ps.games_played_2025,
            ps.baseline_avg_2025,
            ps.games_played_2026,
            ps.avg_last_3,
            ps.avg_last_5,
            ps.avg_last_10,
            ps.avg_last_15,
            ps.volatility_last_15,
            ps.floor_estimate,
            ps.ceiling_estimate,
            ps.prob_100_plus,
            ps.prob_120_plus,
            ps.weighted_recent_avg,
            ps.trend_3_vs_10,
            ps.season_avg_current,
            round(0.40 * COALESCE(ps.avg_last_5, ps.season_avg_current) + 0.30 * COALESCE(ps.weighted_recent_avg, ps.season_avg_current) + 0.20 * COALESCE(ps.avg_last_15, ps.season_avg_current) + 0.10 * ps.season_avg_current, 2) AS rolling_projection,
                CASE
                    WHEN ps.games_played_2026 = 0 THEN 'PRESEASON_2025_BASELINE'::text
                    WHEN ps.games_played_2026 >= 1 AND ps.games_played_2026 <= 5 THEN 'EARLY_2026_BLENDED'::text
                    WHEN ps.games_played_2026 >= 6 AND ps.games_played_2026 <= 10 THEN 'MID_2026_BLENDED'::text
                    ELSE 'FULL_2026_ROLLING'::text
                END AS season_context
           FROM player_stats ps
        ), blended AS (
         SELECT pr.player_id,
            pr.player_name,
            pr.team,
            pr.games_played_2025,
            pr.baseline_avg_2025,
            pr.games_played_2026,
            pr.avg_last_3,
            pr.avg_last_5,
            pr.avg_last_10,
            pr.avg_last_15,
            pr.volatility_last_15,
            pr.floor_estimate,
            pr.ceiling_estimate,
            pr.prob_100_plus,
            pr.prob_120_plus,
            pr.weighted_recent_avg,
            pr.trend_3_vs_10,
            pr.season_avg_current,
            pr.rolling_projection,
            pr.season_context,
            round(
                CASE pr.season_context
                    WHEN 'PRESEASON_2025_BASELINE'::text THEN pr.baseline_avg_2025
                    WHEN 'EARLY_2026_BLENDED'::text THEN 0.70 * pr.rolling_projection + 0.30 * pr.baseline_avg_2025
                    WHEN 'MID_2026_BLENDED'::text THEN 0.85 * pr.rolling_projection + 0.15 * pr.baseline_avg_2025
                    ELSE pr.rolling_projection
                END, 2) AS final_projection
           FROM projections pr
        )
 SELECT b.player_id,
    b.player_name,
    b.team,
    f.opponent,
    f.venue,
    f.is_home,
    f.match_date,
    COALESCE(f.round_number, ( SELECT next_round_num.rn
           FROM next_round_num)) AS target_round_number,
    b.season_context,
    b.games_played_2025,
    b.baseline_avg_2025,
    b.games_played_2026,
    b.season_avg_current,
    b.avg_last_5,
    b.avg_last_15,
    b.volatility_last_15,
    b.floor_estimate,
    b.ceiling_estimate,
    b.prob_100_plus,
    b.prob_120_plus,
    b.trend_3_vs_10,
    b.rolling_projection,
    b.final_projection,
    -- FIX: ORDER BY DESC so low volatility = high consistency_score (consistent players rewarded)
    round(100.0::double precision * percent_rank() OVER (ORDER BY b.volatility_last_15 DESC)) AS consistency_score,
    b.weighted_recent_avg
   FROM blended b
     LEFT JOIN fixture_rows f ON f.team = b.team;
