/*
  # Fix Match + Player Input Views — Opening Round Scope + Player Deduplication

  ## Changes

  ### 1. v_ai_match_openai_inputs_2026_next_round
  Problem: returns 6 matches (includes a Round 1 game).
  Fix: add WHERE p.round_number = 0 so only Opening Round (round_number = 0) matches are returned.
  Structure unchanged — only a filter is added at the outer SELECT level.

  ### 2. v_ai_player_openai_inputs_2026_next_round
  Problem: returns 782 rows due to 2 players appearing twice (LEFT JOIN on player name
  can match multiple payload rows when a player has entries across teams in the payload view).
  Fix: wrap in DISTINCT ON (player_id) ordered by player_id, match_id NULLS LAST
  so each player_id appears exactly once with the most-relevant payload row.

  ### 3. DELETE stray non-opening-round match predictions
  Remove the Round 1 row(s) already written to ai_match_predictions to align
  the output table with the new input scope (round_number = 0 only).

  ## Expected results after migration
  - SELECT COUNT(*) FROM afl.v_ai_match_openai_inputs_2026_next_round  → 5
  - SELECT COUNT(*) FROM afl.v_ai_player_openai_inputs_2026_next_round → 780
  - SELECT COUNT(*) FROM afl.ai_match_predictions WHERE season = 2026 AND round_number = 0 → <=6 (will be re-run)
*/

-- =========================================================
-- 1. MATCH INPUT VIEW — restrict to Opening Round only
-- =========================================================
CREATE OR REPLACE VIEW afl.v_ai_match_openai_inputs_2026_next_round AS
SELECT
  p.season,
  p.round_number,
  p.match_id,
  p.home_team,
  p.away_team,
  jsonb_build_object(
    'system',  pr.system_prompt,
    'user',
      replace(replace(replace(replace(replace(replace(replace(
      replace(replace(replace(replace(replace(replace(replace(
      replace(replace(replace(replace(replace(replace(replace(
        pr.user_prompt_template,
        '{{home_team}}',             COALESCE((p.payload->'home_team'->>'name'), p.home_team)),
        '{{away_team}}',             COALESCE((p.payload->'away_team'->>'name'), p.away_team)),
        '{{venue}}',                 COALESCE((p.payload->'match'->>'venue'), 'N/A')),
        '{{home_predicted_score}}',  COALESCE((p.payload->'home_team'->>'predicted_score'), 'N/A')),
        '{{home_season_avg}}',       COALESCE((p.payload->'home_team'->>'form'),            'N/A')),
        '{{home_last_5_avg}}',       COALESCE((p.payload->'home_team'->>'form'),            'N/A')),
        '{{home_floor}}',            COALESCE((p.payload->'home_team'->>'defense'),         'N/A')),
        '{{home_ceiling}}',          COALESCE((p.payload->'home_team'->>'volatility'),      'N/A')),
        '{{home_stdev}}',            COALESCE((p.payload->'home_team'->>'volatility'),      'N/A')),
        '{{home_confidence}}',       COALESCE((p.payload->'home_team'->>'confidence'),      'N/A')),
        '{{home_days_rest}}',        COALESCE((p.payload->'home_team'->>'days_rest'),       'N/A')),
        '{{home_ground_advantage}}', COALESCE((p.payload->'home_team'->>'home_ground_advantage'), 'N/A')),
        '{{away_predicted_score}}',  COALESCE((p.payload->'away_team'->>'predicted_score'), 'N/A')),
        '{{away_season_avg}}',       COALESCE((p.payload->'away_team'->>'form'),            'N/A')),
        '{{away_last_5_avg}}',       COALESCE((p.payload->'away_team'->>'form'),            'N/A')),
        '{{away_floor}}',            COALESCE((p.payload->'away_team'->>'defense'),         'N/A')),
        '{{away_ceiling}}',          COALESCE((p.payload->'away_team'->>'volatility'),      'N/A')),
        '{{away_stdev}}',            COALESCE((p.payload->'away_team'->>'volatility'),      'N/A')),
        '{{away_confidence}}',       COALESCE((p.payload->'away_team'->>'confidence'),      'N/A')),
        '{{away_days_rest}}',        COALESCE((p.payload->'away_team'->>'days_rest'),       'N/A')),
        '{{predicted_margin}}',      COALESCE((p.payload->'predictions'->>'margin'),        'N/A')),
    'payload',  p.payload
  ) AS final_openai_input
FROM afl.v_ai_match_payloads_2026_next_round p
JOIN afl.ai_prompts pr
  ON pr.prompt_key = 'match_prediction'
 AND pr.is_active  = true
WHERE p.round_number = 0;


-- =========================================================
-- 2. PLAYER INPUT VIEW — deduplicate to 1 row per player_id
-- =========================================================
CREATE OR REPLACE VIEW afl.v_ai_player_openai_inputs_2026_next_round AS
SELECT DISTINCT ON (pl.player_id)
  pl.player_id,
  pl.player_name                                        AS player,
  proj.team,
  COALESCE(pay.opponent, proj.opponent)                 AS opponent,
  pay.match_id,
  COALESCE(pay.round_number, proj.target_round_number)  AS round_number,
  pr.system_prompt,

  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    pr.user_prompt_template,
    '{player}',         pl.player_name),
    '{team}',           proj.team),
    '{opponent}',       COALESCE(pay.opponent, proj.opponent, 'No fixture')),
    '{season_avg}',     COALESCE(ROUND(proj.season_avg_current, 1)::text, 'N/A')),
    '{last_5_avg}',     COALESCE(ROUND(proj.avg_last_5, 1)::text, 'N/A')),
    '{predicted_score}',COALESCE(ROUND(proj.final_projection, 1)::text, '0.0')),
    '{ceiling}',        COALESCE(ROUND(proj.ceiling_estimate, 1)::text, 'N/A')),
    '{floor}',          COALESCE(ROUND(proj.floor_estimate, 1)::text, 'N/A'))
                                                        AS user_prompt,

  jsonb_build_object(
    'system',  pr.system_prompt,
    'user',
      REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        pr.user_prompt_template,
        '{player}',         pl.player_name),
        '{team}',           proj.team),
        '{opponent}',       COALESCE(pay.opponent, proj.opponent, 'No fixture')),
        '{season_avg}',     COALESCE(ROUND(proj.season_avg_current, 1)::text, 'N/A')),
        '{last_5_avg}',     COALESCE(ROUND(proj.avg_last_5, 1)::text, 'N/A')),
        '{predicted_score}',COALESCE(ROUND(proj.final_projection, 1)::text, '0.0')),
        '{ceiling}',        COALESCE(ROUND(proj.ceiling_estimate, 1)::text, 'N/A')),
        '{floor}',          COALESCE(ROUND(proj.floor_estimate, 1)::text, 'N/A')),
    'payload', jsonb_build_object(
      'player',     pl.player_name,
      'team',       proj.team,
      'opponent',   COALESCE(pay.opponent, proj.opponent),
      'prediction', jsonb_build_object(
        'predicted_score', proj.final_projection,
        'ceiling',         proj.ceiling_estimate,
        'floor',           proj.floor_estimate,
        'stdev',           proj.volatility_last_15,
        'trend_direction',
          CASE
            WHEN proj.trend_3_vs_10 >  5 THEN 'up'
            WHEN proj.trend_3_vs_10 < -5 THEN 'down'
            ELSE 'stable'
          END
      ),
      'form', jsonb_build_object(
        'season_avg',   proj.season_avg_current,
        'avg_last_5',   proj.avg_last_5,
        'last_5_avg',   proj.avg_last_5,
        'avg_last_15',  proj.avg_last_15
      ),
      'volatility', jsonb_build_object(
        'stdev',              proj.volatility_last_15,
        'volatility_last_15', proj.volatility_last_15,
        'ceiling',            proj.ceiling_estimate,
        'floor',              proj.floor_estimate
      ),
      'role', jsonb_build_object(
        'consistency_score', ROUND(COALESCE(proj.prob_100_plus, 0) * 10, 1)
      )
    ),
    'season_context',
      CASE proj.season_context
        WHEN 'PRESEASON_2025_BASELINE' THEN 'Based on 2025 baseline (2026 pre-season)'
        WHEN 'EARLY_2026_BLENDED'      THEN 'Based on blended 2025/2026 form (early season)'
        WHEN 'MID_2026_BLENDED'        THEN 'Based on 2026 form with 2025 anchor (mid season)'
        WHEN 'FULL_2026_ROLLING'       THEN 'Based on 2026 rolling form'
        ELSE 'Based on 2025 baseline (2026 pre-season)'
      END
  )                                                     AS final_openai_input,

  CASE proj.season_context
    WHEN 'PRESEASON_2025_BASELINE' THEN 'Based on 2025 baseline (2026 pre-season)'
    WHEN 'EARLY_2026_BLENDED'      THEN 'Based on blended 2025/2026 form (early season)'
    WHEN 'MID_2026_BLENDED'        THEN 'Based on 2026 form with 2025 anchor (mid season)'
    WHEN 'FULL_2026_ROLLING'       THEN 'Based on 2026 rolling form'
    ELSE 'Based on 2025 baseline (2026 pre-season)'
  END                                                   AS season_context_label,

  proj.final_projection                                 AS predicted_score

FROM afl.players pl

JOIN afl.v_neeko_player_projection proj
  ON proj.player_id = pl.player_id

LEFT JOIN afl.v_ai_player_payloads_2026_next_round pay
  ON pay.player = pl.player_name

JOIN afl.ai_prompts pr
  ON pr.prompt_key = 'player_match_prediction'
  AND pr.is_active = true

ORDER BY pl.player_id, pay.match_id NULLS LAST;


-- =========================================================
-- 3. REMOVE stray non-opening-round match predictions
-- =========================================================
DELETE FROM afl.ai_match_predictions
WHERE season = 2026
  AND round_number <> 0;
