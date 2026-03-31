/*
  # Fix Player OpenAI Input View — Double-Brace Placeholder Replacement

  ## Problem
  The active `player_round_summary` prompt uses `{{double_brace}}` placeholders,
  but the view calls `fn_fill_player_prompt()` which only replaces `{single_brace}`
  tokens. Result: all `{{predicted_score}}`, `{{ceiling}}`, `{{floor}}`, `{{stdev}}`,
  `{{team}}`, `{{opponent}}`, `{{season_context_label}}` placeholders pass through
  unreplaced to GPT-4o.

  Additionally, 316 players (rookies / no 2025 history) have NULL form stats in
  the payload because `player_stats` CTE only draws from `v_player_round_canonical_2025`.
  These players get `final_projection = 0` and null ceiling/floor from
  `v_neeko_player_projection`.

  ## Fix
  Rebuild `v_ai_player_openai_inputs_2026_next_round` to:
  1. JOIN `v_neeko_player_projection` for every player (already done in existing view
     via the `proj` CTE)
  2. Replace `fn_fill_player_prompt()` call with a direct chained `replace()` that
     handles ALL `{{...}}` tokens from the active prompt template
  3. Use `v_neeko_player_projection` values (final_projection, ceiling_estimate,
     floor_estimate, season_avg_current, avg_last_5, volatility_last_15) so rookies
     get real values where available, and 'N/A' only when truly unknown

  ## Changed Objects
  - `afl.v_ai_player_openai_inputs_2026_next_round` (rebuilt)
*/

CREATE OR REPLACE VIEW afl.v_ai_player_openai_inputs_2026_next_round AS
WITH proj AS (
  SELECT
    np.player_id,
    np.player_name,
    np.team,
    np.opponent,
    np.target_round_number                                        AS round_number,
    np.season_context,
    np.final_projection                                           AS expected_fantasy,
    np.floor_estimate                                             AS floor_fantasy,
    np.ceiling_estimate                                           AS ceiling_fantasy,
    np.season_avg_current,
    np.avg_last_5,
    np.avg_last_15,
    np.volatility_last_15,
    np.prob_100_plus,
    np.prob_120_plus,
    np.trend_3_vs_10,
    np.games_played_2025 + np.games_played_2026                  AS games_played_total,
    CASE np.season_context
      WHEN 'PRESEASON_2025_BASELINE' THEN 'Based on 2025 baseline (2026 pre-season)'
      WHEN 'EARLY_2026_BLENDED'      THEN 'Based on blended 2025/2026 form (early season)'
      WHEN 'MID_2026_BLENDED'        THEN 'Based on 2026 form with 2025 anchor (mid season)'
      WHEN 'FULL_2026_ROLLING'       THEN 'Based on 2026 rolling form'
      ELSE                                'Based on 2025 baseline (2026 pre-season)'
    END                                                           AS season_context_label,
    CASE
      WHEN np.volatility_last_15 IS NULL        THEN 'Unknown'
      WHEN np.volatility_last_15 < 15           THEN 'Low'
      WHEN np.volatility_last_15 < 25           THEN 'Medium'
      WHEN np.volatility_last_15 < 35           THEN 'High'
      ELSE                                           'Very High'
    END                                                           AS risk_tier,
    COALESCE(def.matchup_delta, 0)                                AS matchup_delta,
    CASE
      WHEN COALESCE(def.matchup_delta, 0) >  5  THEN 'Favourable'
      WHEN COALESCE(def.matchup_delta, 0) < -5  THEN 'Tough'
      ELSE                                            'Neutral'
    END                                                           AS matchup_label,
    CASE
      WHEN np.trend_3_vs_10 >  5  THEN 'up'
      WHEN np.trend_3_vs_10 < -5  THEN 'down'
      ELSE                              'stable'
    END                                                           AS trend_direction,
    round(np.avg_last_5 * 0.6 + COALESCE(np.avg_last_15, np.season_avg_current) * 0.4, 1)
                                                                  AS last_3_avg_est
  FROM afl.v_neeko_player_projection np
  LEFT JOIN afl.team_defense_profile_2026 def ON def.team = np.opponent
),
filled AS (
  SELECT
    pay.match_id,
    proj.round_number,
    proj.player_name                                              AS player,
    proj.team,
    proj.opponent,
    proj.player_id,
    proj.season_context_label,
    -- resolve display values (never NULL sent to GPT)
    COALESCE(round(proj.expected_fantasy, 1)::text,    'N/A')    AS v_expected,
    COALESCE(round(proj.floor_fantasy,    1)::text,    'N/A')    AS v_floor,
    COALESCE(round(proj.ceiling_fantasy,  1)::text,    'N/A')    AS v_ceiling,
    COALESCE(round(proj.season_avg_current, 1)::text,  'N/A')    AS v_season_avg,
    COALESCE(round(proj.last_3_avg_est,   1)::text,    'N/A')    AS v_last_3,
    COALESCE(round(proj.avg_last_5,       1)::text,    'N/A')    AS v_last_5,
    COALESCE(round(proj.volatility_last_15, 2)::text,  'N/A')    AS v_stdev,
    COALESCE(proj.risk_tier,                           'N/A')    AS v_risk_tier,
    COALESCE(round(proj.prob_100_plus * 100, 1)::text || '%', 'N/A') AS v_prob_100,
    COALESCE(round(proj.prob_120_plus * 100, 1)::text || '%', 'N/A') AS v_prob_120,
    COALESCE(round(proj.matchup_delta, 2)::text,       'N/A')    AS v_matchup_delta,
    COALESCE(proj.matchup_label,                       'N/A')    AS v_matchup_label,
    COALESCE(proj.games_played_total::text,            'N/A')    AS v_games_played,
    COALESCE(proj.trend_direction,                     'N/A')    AS v_trend,
    COALESCE(round(proj.prob_100_plus * 10, 1)::text,  'N/A')    AS v_consistency,
    COALESCE(proj.team,                                'N/A')    AS v_team,
    COALESCE(proj.opponent,                            'No fixture') AS v_opponent,
    pr.system_prompt,
    pr.user_prompt_template,
    pay.payload
  FROM proj
  JOIN afl.v_ai_player_payloads_2026_next_round pay
    ON pay.player = proj.player_name
   AND pay.team   = proj.team
  JOIN afl.ai_prompts pr
    ON pr.prompt_key = 'player_round_summary'
   AND pr.is_active  = true
)
SELECT
  match_id,
  round_number,
  player,
  team,
  opponent,
  jsonb_build_object(
    'system',  system_prompt,
    'user',
      replace(replace(replace(replace(replace(replace(replace(
      replace(replace(replace(replace(replace(replace(replace(
        user_prompt_template,
        '{{player}}',               player),
        '{{team}}',                 v_team),
        '{{opponent}}',             v_opponent),
        '{{season_context_label}}', season_context_label),
        '{{season_avg}}',           v_season_avg),
        '{{last_5_avg}}',           v_last_5),
        '{{predicted_score}}',      v_expected),
        '{{ceiling}}',              v_ceiling),
        '{{floor}}',                v_floor),
        '{{stdev}}',                v_stdev),
        '{{consistency_score}}',    v_consistency),
        '{{trend_direction}}',      v_trend),
        '{{risk_tier}}',            v_risk_tier),
        '{{matchup_label}}',        v_matchup_label),
    'payload',  payload,
    'season_context', season_context_label
  )                                                               AS final_openai_input,
  player_id,
  season_context_label
FROM filled;
