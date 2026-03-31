
/*
  # Rebuild Projection Engine — Complete Fix (v3)

  ## Summary
  Full reconstruction of the afl projection view chain with three targeted fixes:

  1. **Consistency metric** — replaces `100 - volatility` (range 54-100, too narrow) with
     CoV-based formula: `100 - (stddev/avg * 100)` clamped [0,100]. Players with <3 games
     get a neutral 50.0. This produces a realistic 20-85 spread.

  2. **Floor/Ceiling bounds** — fixes inversions where floor > projection (34 players) and
     ceiling < projection (19 players). New rules:
     - floor = GREATEST(0, LEAST(projection, raw_floor))
     - ceiling = GREATEST(projection, raw_ceiling)

  3. **Position baselines** — tightens rookie/low-games baselines:
     MID: 55→45, DEF: 45→35, RUC: 60→50, FWD: 40 (unchanged)
     Also adds minimum floor: projection >= league_avg * 0.25 for 3+ game players

  ## Views Rebuilt (in dependency order)
  - afl.v_projection_engine (root — fixed)
  - afl.v_captain_scores (depends on v_projection_engine)
  - afl.v_score_probabilities (depends on v_projection_engine)
  - afl.v_projection_venue (depends on v_projection_engine)
  - afl.v_projection_final (depends on v_projection_venue)
  - afl.v_ai_player_signals (depends on v_projection_final)
  - afl.v_ai_player_metrics (depends on v_ai_player_signals)
  - afl.v_ai_player_openai_inputs_v2 (depends on v_ai_player_metrics indirectly)
  - afl.v_ai_player_analysis_input (depends on v_ai_player_openai_inputs_v2)
  - afl.v_player_value_engine (depends on v_projection_engine)
  - afl.v_neeko_rating (depends on v_player_value_engine)
  - afl.v_player_rankings (depends on v_player_value_engine)
  - afl.v_player_rankings_full (depends on v_neeko_rating + v_ai_player_metrics + v_ai_player_analysis_input)

  ## Security
  - No RLS changes (views only)
  - No table changes
  - No column renames
  - Fully backwards-compatible with existing RPCs and cache function
*/

-- ============================================================
-- STEP 1: Drop all dependent views in reverse dependency order
-- ============================================================

DROP VIEW IF EXISTS afl.v_player_rankings_full CASCADE;
DROP VIEW IF EXISTS afl.v_player_rankings CASCADE;
DROP VIEW IF EXISTS afl.v_neeko_rating CASCADE;
DROP VIEW IF EXISTS afl.v_player_value_engine CASCADE;
DROP VIEW IF EXISTS afl.v_ai_player_analysis_input CASCADE;
DROP VIEW IF EXISTS afl.v_ai_player_openai_inputs_v2 CASCADE;
DROP VIEW IF EXISTS afl.v_ai_player_metrics CASCADE;
DROP VIEW IF EXISTS afl.v_ai_player_signals CASCADE;
DROP VIEW IF EXISTS afl.v_projection_final CASCADE;
DROP VIEW IF EXISTS afl.v_projection_venue CASCADE;
DROP VIEW IF EXISTS afl.v_score_probabilities CASCADE;
DROP VIEW IF EXISTS afl.v_captain_scores CASCADE;
DROP VIEW IF EXISTS afl.v_projection_engine CASCADE;

-- ============================================================
-- STEP 2: Rebuild v_projection_engine (ROOT — all fixes here)
-- ============================================================

CREATE OR REPLACE VIEW afl.v_projection_engine AS
WITH player_consistency AS (
  SELECT
    p.player_id,
    COUNT(pg.fantasy_score) FILTER (WHERE pg.fantasy_score > 0) AS game_count,
    AVG(pg.fantasy_score::numeric) FILTER (WHERE pg.fantasy_score > 0) AS avg_score,
    STDDEV(pg.fantasy_score::numeric) FILTER (WHERE pg.fantasy_score > 0) AS stddev_score
  FROM afl.players p
  LEFT JOIN afl.player_games pg ON pg.player_id = p.player_id
  GROUP BY p.player_id
),
consistency_scored AS (
  SELECT
    player_id,
    game_count,
    CASE
      WHEN game_count < 3 OR avg_score IS NULL OR avg_score = 0 THEN 50.0
      ELSE LEAST(100.0, GREATEST(0.0,
        ROUND((100.0 - (stddev_score / NULLIF(avg_score, 0) * 100.0))::numeric, 1)
      ))
    END AS consistency_cov
  FROM player_consistency
),
projection_raw AS (
  SELECT
    p.player_id,
    COALESCE(f.games_played, 0::bigint) AS games_played,
    p.position_group,
    COALESCE(f.team_id, cpt.team_id) AS team_id,
    COALESCE(f.team_name, cpt.team_name) AS team_name,
    pla.league_avg,
    -- Tightened position baselines for ≤2 games
    CASE
      WHEN COALESCE(f.games_played, 0::bigint) <= 2 THEN
        CASE p.position_group
          WHEN 'MID' THEN 45
          WHEN 'DEF' THEN 35
          WHEN 'FWD' THEN 40
          WHEN 'RUC' THEN 50
          ELSE 40
        END::numeric
      ELSE
        -- Weighted projection with minimum 25% of league avg
        GREATEST(
          COALESCE(NULLIF(fn.last3_norm, 0::numeric), NULLIF(f.last3_avg, 0::numeric), pla.league_avg) * 0.30
          + COALESCE(NULLIF(fn.last5_norm, 0::numeric), NULLIF(f.last5_avg, 0::numeric), pla.league_avg) * 0.25
          + COALESCE(NULLIF(fn.last10_norm, 0::numeric), NULLIF(f.last10_avg, 0::numeric), pla.league_avg) * 0.20
          + COALESCE(NULLIF(fn.season_norm, 0::numeric), NULLIF(f.season_avg, 0::numeric), pla.league_avg) * 0.25,
          pla.league_avg * 0.25
        )
    END AS projection_calc,
    -- Raw ceiling from features (may be 0 or NULL)
    COALESCE(NULLIF(f.ceiling, 0)::numeric, ROUND(pla.league_avg * 1.35)) AS raw_ceiling,
    -- Raw floor from features (may be negative or 0)
    COALESCE(NULLIF(f.floor, 0)::numeric, pla.league_avg * 0.45) AS raw_floor,
    f.volatility,
    fn.last3_norm,
    fn.last5_norm,
    fn.last10_norm,
    fn.season_norm,
    f.season_avg,
    f.last3_avg,
    f.last5_avg,
    f.last10_avg
  FROM afl.players p
  LEFT JOIN afl.player_features f ON p.player_id = f.player_id
  LEFT JOIN afl.v_current_player_team cpt ON p.player_id = cpt.player_id
  LEFT JOIN afl.v_player_form_normalised fn ON p.player_id = fn.player_id
  LEFT JOIN afl.v_position_league_average pla ON p.position_group = pla.position_group
  WHERE COALESCE(f.team_id, cpt.team_id) IS NOT NULL
)
SELECT DISTINCT ON (p.player_id)
  p.player_id,
  p.player_name,
  pr.team_id,
  pr.team_name,
  p.position_group,
  ng.game_id,
  ng.game_date,
  ng.venue,
  CASE
    WHEN ng.home_team_id = pr.team_id THEN ng.away_team_id
    ELSE ng.home_team_id
  END AS opponent_team_id,
  CASE
    WHEN ng.home_team_id = pr.team_id THEN 1
    ELSE 0
  END AS is_home,
  pr.games_played,
  COALESCE(NULLIF(pr.season_avg, 0::numeric), pr.league_avg) AS season_avg,
  NULLIF(pr.last3_avg, 0::numeric) AS last3_avg,
  NULLIF(pr.last5_avg, 0::numeric) AS last5_avg,
  NULLIF(pr.last10_avg, 0::numeric) AS last10_avg,
  -- CEILING: must be >= projection
  GREATEST(pr.projection_calc, pr.raw_ceiling)::integer AS ceiling,
  -- FLOOR: must be >= 0 and <= projection
  GREATEST(0.0, LEAST(pr.projection_calc, pr.raw_floor)) AS floor,
  COALESCE(NULLIF(pr.volatility, 0::numeric), 28::numeric) AS volatility,
  -- CONSISTENCY: CoV-based formula (replaces 100 - volatility)
  cs.consistency_cov AS consistency,
  -- Form score (unchanged)
  COALESCE(
    COALESCE(NULLIF(pr.last3_norm, 0::numeric), NULLIF(pr.last3_avg, 0::numeric), pr.league_avg) * 0.35
    + COALESCE(NULLIF(pr.last5_norm, 0::numeric), NULLIF(pr.last5_avg, 0::numeric), pr.league_avg) * 0.25
    + COALESCE(NULLIF(pr.last10_norm, 0::numeric), NULLIF(pr.last10_avg, 0::numeric), pr.league_avg) * 0.25
    + COALESCE(NULLIF(pr.season_norm, 0::numeric), NULLIF(pr.season_avg, 0::numeric), pr.league_avg) * 0.15,
    pr.league_avg
  ) AS form_score,
  tr.rest_days,
  pr.projection_calc AS projection
FROM afl.players p
JOIN projection_raw pr ON pr.player_id = p.player_id
LEFT JOIN consistency_scored cs ON cs.player_id = p.player_id
JOIN afl.v_next_games ng ON ng.team_id = pr.team_id
LEFT JOIN afl.v_team_rest_days tr ON tr.team_id = pr.team_id AND tr.game_date = ng.game_date
ORDER BY p.player_id, ng.game_date;

-- ============================================================
-- STEP 3: Rebuild simple dependents of v_projection_engine
-- ============================================================

CREATE OR REPLACE VIEW afl.v_captain_scores AS
SELECT
  player_id,
  player_name,
  position_group,
  team_name,
  projection,
  ceiling,
  consistency,
  volatility,
  ROUND(projection * 0.45 + ceiling::numeric * 0.35 + consistency * 0.20, 2) AS captain_score
FROM afl.v_projection_engine p;

CREATE OR REPLACE VIEW afl.v_score_probabilities AS
SELECT
  player_id,
  player_name,
  position_group,
  team_name,
  projection,
  volatility,
  ROUND(100::numeric / (1::numeric + EXP((80::numeric - projection) / (10::numeric + volatility))), 1) AS prob_80_plus,
  ROUND(100::numeric / (1::numeric + EXP((100::numeric - projection) / (10::numeric + volatility))), 1) AS prob_100_plus,
  ROUND(100::numeric / (1::numeric + EXP((120::numeric - projection) / (10::numeric + volatility))), 1) AS prob_120_plus
FROM afl.v_projection_engine p;

CREATE OR REPLACE VIEW afl.v_projection_venue AS
SELECT
  pe.player_id,
  pe.player_name,
  pe.team_id,
  pe.team_name,
  pe.position_group,
  pe.opponent_team_id,
  pe.venue,
  pe.projection AS base_projection,
  COALESCE(mm.matchup_multiplier, 1::numeric) AS matchup_multiplier,
  COALESCE(vm.venue_multiplier, 1::numeric) AS venue_multiplier,
  ROUND(pe.projection * COALESCE(mm.matchup_multiplier, 1::numeric) * COALESCE(vm.venue_multiplier, 1::numeric), 2) AS projection
FROM afl.v_projection_engine pe
LEFT JOIN afl.v_matchup_multiplier mm ON mm.defence_team_id = pe.opponent_team_id AND mm.position_group = pe.position_group
LEFT JOIN afl.v_venue_multiplier vm ON vm.venue = pe.venue AND vm.position_group = pe.position_group;

-- ============================================================
-- STEP 4: Rebuild v_projection_final (depends on v_projection_venue)
-- ============================================================

CREATE OR REPLACE VIEW afl.v_projection_final AS
SELECT
  pv.player_id,
  pv.player_name,
  pv.team_id,
  pv.team_name,
  pv.position_group,
  pv.opponent_team_id,
  pv.base_projection,
  pv.matchup_multiplier,
  pv.venue_multiplier,
  COALESCE(mp.pace_multiplier, 1::numeric) AS pace_multiplier,
  ROUND(LEAST(pv.base_projection * pv.matchup_multiplier * pv.venue_multiplier * COALESCE(mp.pace_multiplier, 1::numeric), pv.base_projection * 1.22), 1) AS projection
FROM afl.v_projection_venue pv
LEFT JOIN afl.v_match_pace mp ON mp.team_id = pv.team_id;

-- ============================================================
-- STEP 5: Rebuild AI signal views (depend on v_projection_final)
-- ============================================================

CREATE OR REPLACE VIEW afl.v_ai_player_signals AS
SELECT
  player_id,
  player_name,
  team_name,
  position_group,
  projection,
  base_projection,
  matchup_multiplier,
  venue_multiplier,
  pace_multiplier,
  CASE
    WHEN projection >= 105::numeric THEN 'ELITE'::text
    WHEN projection >= 95::numeric THEN 'PREMIUM'::text
    WHEN projection >= 85::numeric THEN 'STRONG'::text
    WHEN projection >= 75::numeric THEN 'SOLID'::text
    ELSE 'LOW'::text
  END AS projection_tier,
  CASE
    WHEN matchup_multiplier >= 1.08 THEN 'ELITE MATCHUP'::text
    WHEN matchup_multiplier >= 1.04 THEN 'FAVOURABLE'::text
    WHEN matchup_multiplier >= 0.97 THEN 'NEUTRAL'::text
    WHEN matchup_multiplier >= 0.92 THEN 'DIFFICULT'::text
    ELSE 'BRUTAL'::text
  END AS matchup_rating,
  CASE
    WHEN venue_multiplier >= 1.05 THEN 'STRONG VENUE BOOST'::text
    WHEN venue_multiplier >= 1.02 THEN 'VENUE BOOST'::text
    WHEN venue_multiplier <= 0.95 THEN 'VENUE NEGATIVE'::text
    ELSE 'NEUTRAL VENUE'::text
  END AS venue_rating,
  CASE
    WHEN pace_multiplier >= 1.06 THEN 'FAST GAME'::text
    WHEN pace_multiplier >= 1.02 THEN 'HIGH POSSESSION'::text
    WHEN pace_multiplier <= 0.95 THEN 'SLOW GAME'::text
    ELSE 'NORMAL PACE'::text
  END AS pace_environment
FROM afl.v_projection_final p;

CREATE OR REPLACE VIEW afl.v_ai_player_metrics AS
SELECT
  player_id,
  player_name,
  team_name,
  position_group,
  projection,
  base_projection,
  matchup_multiplier,
  venue_multiplier,
  pace_multiplier,
  projection_tier,
  matchup_rating,
  venue_rating,
  pace_environment,
  ROUND(projection * 0.55 + matchup_multiplier * 100::numeric * 0.20 + venue_multiplier * 100::numeric * 0.15 + pace_multiplier * 100::numeric * 0.10, 2) AS captain_score,
  ROUND(projection * 0.60 + matchup_multiplier * 100::numeric * 0.25 + pace_multiplier * 100::numeric * 0.15, 2) AS start_confidence,
  ROUND(matchup_multiplier * 100::numeric * 0.40 + venue_multiplier * 100::numeric * 0.30 + pace_multiplier * 100::numeric * 0.30, 2) AS breakout_probability,
  ROUND((100::numeric - matchup_multiplier * 100::numeric) * 0.50 + (100::numeric - venue_multiplier * 100::numeric) * 0.25 + (100::numeric - pace_multiplier * 100::numeric) * 0.25, 2) AS bust_risk,
  ROUND(projection + matchup_multiplier * 10::numeric + venue_multiplier * 8::numeric + pace_multiplier * 6::numeric, 2) AS leverage_score
FROM afl.v_ai_player_signals s;

-- ============================================================
-- STEP 6: Rebuild v_ai_player_openai_inputs_v2
-- ============================================================

CREATE OR REPLACE VIEW afl.v_ai_player_openai_inputs_v2 AS
SELECT
  player_id,
  player_name,
  team_name AS team,
  position_group AS "position",
  projection AS projection_final,
  ROUND(projection * 0.55) AS floor,
  ROUND(projection * 1.25)::integer AS ceiling,
  projection AS form_rating,
  ROUND((matchup_multiplier + venue_multiplier + pace_multiplier) * 33::numeric, 2) AS consistency_score,
  ROUND(projection * 0.7 + matchup_multiplier * 20::numeric + venue_multiplier * 15::numeric, 2) AS neeko_rating,
  NULL::numeric AS value_score,
  NULL::integer AS price,
  matchup_multiplier,
  venue_multiplier,
  pace_multiplier,
  CASE
    WHEN matchup_multiplier > 1.05 THEN 'FAVOURABLE'::text
    WHEN matchup_multiplier < 0.95 THEN 'DIFFICULT'::text
    ELSE 'NEUTRAL'::text
  END AS matchup_rating,
  CASE
    WHEN venue_multiplier > 1.05 THEN 'STRONG VENUE BOOST'::text
    WHEN venue_multiplier > 1.02 THEN 'VENUE BOOST'::text
    ELSE 'NEUTRAL VENUE'::text
  END AS venue_rating,
  CASE
    WHEN pace_multiplier > 1.03 THEN 'HIGH POSSESSION'::text
    WHEN pace_multiplier < 0.97 THEN 'SLOW GAME'::text
    ELSE 'NORMAL PACE'::text
  END AS pace_environment,
  CASE
    WHEN projection >= 110::numeric THEN 'ELITE'::text
    WHEN projection >= 95::numeric THEN 'PREMIUM'::text
    WHEN projection >= 80::numeric THEN 'STRONG'::text
    ELSE 'LOW'::text
  END AS projection_tier
FROM afl.v_projection_final p;

CREATE OR REPLACE VIEW afl.v_ai_player_analysis_input AS
SELECT
  player_id,
  player_name,
  team,
  projection_final,
  ceiling AS ceiling_estimate,
  floor AS floor_estimate,
  consistency_score,
  form_rating AS trend_3_vs_10,
  0 AS matchup_delta,
  price,
  value_score,
  NULL::text AS value_tag,
  MD5(
    (player_id::text
      || COALESCE(projection_final::text, '')
      || COALESCE(form_rating::text, '')
      || COALESCE(consistency_score::text, ''))
  ) AS input_hash
FROM afl.v_ai_player_openai_inputs_v2;

-- ============================================================
-- STEP 7: Rebuild value engine chain
-- ============================================================

CREATE OR REPLACE VIEW afl.v_player_value_engine AS
SELECT
  pe.player_id,
  pe.player_name,
  pe.team_id,
  pe.team_name,
  pe.position_group,
  pe.game_id,
  pe.game_date,
  pe.venue,
  pe.opponent_team_id,
  pe.is_home,
  pe.games_played,
  pe.season_avg,
  pe.last3_avg,
  pe.last5_avg,
  pe.last10_avg,
  pe.ceiling,
  pe.floor,
  pe.volatility,
  pe.consistency,
  pe.form_score,
  pe.rest_days,
  pe.projection,
  pr.price,
  CASE
    WHEN pr.price IS NULL THEN NULL::numeric
    WHEN pe.games_played <= 2 THEN NULL::numeric
    ELSE pe.projection / pr.price::numeric * 100000::numeric
  END AS value_score
FROM afl.v_projection_engine pe
LEFT JOIN afl.player_prices pr ON pe.player_id = pr.player_id;

CREATE OR REPLACE VIEW afl.v_neeko_rating AS
SELECT
  player_id,
  player_name,
  team_id,
  team_name,
  position_group,
  game_id,
  game_date,
  venue,
  opponent_team_id,
  is_home,
  games_played,
  season_avg,
  last3_avg,
  last5_avg,
  last10_avg,
  ceiling,
  floor,
  volatility,
  consistency,
  form_score,
  rest_days,
  projection,
  price,
  value_score,
  CASE
    WHEN position_group = 'MID' THEN 115
    WHEN position_group = 'DEF' THEN 105
    WHEN position_group = 'FWD' THEN 95
    WHEN position_group = 'RUC' THEN 110
    ELSE 105
  END AS elite_projection,
  LEAST(projection / NULLIF(
    CASE
      WHEN position_group = 'MID' THEN 115
      WHEN position_group = 'DEF' THEN 105
      WHEN position_group = 'FWD' THEN 95
      WHEN position_group = 'RUC' THEN 110
      ELSE 105
    END, 0)::numeric * 65::numeric, 65::numeric) AS projection_component,
  LEAST(form_score / NULLIF(projection, 0::numeric) * 15::numeric, 15::numeric) AS form_component,
  consistency / 100::numeric * 10::numeric AS consistency_component,
  LEAST((ceiling::numeric - projection) / 45::numeric * 10::numeric, 10::numeric) AS upside_component,
  ROUND(
    LEAST(projection / NULLIF(
      CASE
        WHEN position_group = 'MID' THEN 115
        WHEN position_group = 'DEF' THEN 105
        WHEN position_group = 'FWD' THEN 95
        WHEN position_group = 'RUC' THEN 110
        ELSE 105
      END, 0)::numeric * 65::numeric, 65::numeric)
    + LEAST(form_score / NULLIF(projection, 0::numeric) * 15::numeric, 15::numeric)
    + consistency / 100::numeric * 10::numeric
    + LEAST((ceiling::numeric - projection) / 45::numeric * 10::numeric, 10::numeric),
    2
  ) AS neeko_rating
FROM afl.v_player_value_engine pve;

CREATE OR REPLACE VIEW afl.v_player_rankings AS
SELECT
  player_id,
  player_name,
  team_id,
  team_name,
  position_group,
  game_id,
  game_date,
  venue,
  opponent_team_id,
  is_home,
  games_played,
  season_avg,
  last3_avg,
  last5_avg,
  last10_avg,
  ceiling,
  floor,
  volatility,
  consistency,
  form_score,
  rest_days,
  projection,
  price,
  value_score,
  ROW_NUMBER() OVER (ORDER BY projection DESC) AS overall_rank,
  ROW_NUMBER() OVER (PARTITION BY position_group ORDER BY projection DESC) AS position_rank,
  COUNT(*) OVER (PARTITION BY position_group) AS position_player_count
FROM afl.v_player_value_engine pve;

-- ============================================================
-- STEP 8: Rebuild v_player_rankings_full (top-level view)
-- ============================================================

CREATE OR REPLACE VIEW afl.v_player_rankings_full AS
SELECT
  nr.player_id,
  nr.player_name,
  nr.team_name AS team,
  nr.position_group AS "position",
  nr.projection AS projection_final,
  nr.ceiling,
  nr.floor,
  nr.consistency AS consistency_score,
  nr.form_score AS form_rating,
  nr.neeko_rating,
  nr.price,
  nr.value_score,
  ai.analysis AS ai_summary,
  ai.captain_recommendation,
  COALESCE(ai.generated_at, reco.updated_at) AS ai_updated_at,
  nr.team_name,
  nr.position_group,
  ROUND(LEAST(100::numeric, GREATEST(0::numeric, COALESCE(met.start_confidence, 0::numeric))), 1) AS projection_confidence,
  ROUND(LEAST(100::numeric, GREATEST(0::numeric, COALESCE(met.bust_risk, 0::numeric)) * 100::numeric), 1) AS risk_rating,
  COALESCE(met.matchup_rating, 'Neutral'::text) AS matchup_rating,
  ROUND(LEAST(100::numeric, GREATEST(0::numeric, COALESCE(met.breakout_probability, 0::numeric)) * 100::numeric), 1) AS upside_rating,
  ROUND(LEAST(100::numeric, GREATEST(0::numeric, COALESCE(met.captain_score, 0::numeric))), 1) AS captain_score,
  CASE
    WHEN COALESCE(met.captain_score, 0::numeric) >= 70::numeric THEN 'Elite'::text
    WHEN COALESCE(met.captain_score, 0::numeric) >= 50::numeric THEN 'Strong'::text
    WHEN COALESCE(met.captain_score, 0::numeric) >= 30::numeric THEN 'Viable'::text
    ELSE 'Avoid'::text
  END AS captain_rating,
  reco.recommendation_label AS ai_recommendation,
  reco.recommendation_long AS recommendation_why,
  reco.recommendation_color,
  vtag.value_tag,
  CASE
    WHEN nr.price IS NULL OR nr.price = 0 THEN NULL::text
    WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10.0) >= 110::numeric THEN 'ELITE VALUE'::text
    WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10.0) >= 100::numeric THEN 'STRONG VALUE'::text
    WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10.0) >= 95::numeric THEN 'FAIR VALUE'::text
    ELSE 'OVERPRICED'::text
  END AS value_tier,
  CASE
    WHEN nr.consistency >= 75::numeric THEN 'Elite'::text
    WHEN nr.consistency >= 60::numeric THEN 'Consistent'::text
    WHEN nr.consistency >= 40::numeric THEN 'Volatile'::text
    ELSE 'Boom-Bust'::text
  END AS consistency_tier,
  COUNT(*) OVER () AS total_count
FROM afl.v_neeko_rating nr
LEFT JOIN afl.v_ai_player_metrics met ON nr.player_id = met.player_id
LEFT JOIN ai_rankings_player_recos reco ON nr.player_id = reco.player_id::integer
LEFT JOIN ai_player_analysis ai ON nr.player_id = ai.player_id::integer
LEFT JOIN afl.v_ai_player_analysis_input vtag ON nr.player_id = vtag.player_id;
