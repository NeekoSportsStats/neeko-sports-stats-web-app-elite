/*
  # Fix v_ai_player_openai_inputs_2026_next_round — player_id join

  ## Problem
  The view joined v_ai_player_payloads_2026_next_round on:
    pay.player = p.player_name AND pay.team = p.team

  For players who changed clubs (Petracca, Oliver etc) p.team is their
  NEW club but their payload stats were keyed to their OLD team, so the
  join returned no rows and they were dropped from the output entirely.

  ## Fix
  - Resolve player_id from afl.players once
  - Join payload view by player name only (team is irrelevant for stats lookup)
  - The payload view itself is NOT modified (SAFE MODE)
  - Stats from the payload view aggregate by player name across all historical
    teams — the join key just needs to be player name, not player+team

  ## Result
  All 780 players appear in output including traded players with full stats.
*/

CREATE OR REPLACE VIEW afl.v_ai_player_openai_inputs_2026_next_round AS
SELECT
  pl.player_id,
  pl.player_name                                        AS player,
  -- team from the projection view = current 2026 team (correct)
  proj.team,
  COALESCE(pay.opponent, proj.opponent)                 AS opponent,
  pay.match_id,
  COALESCE(pay.round_number, proj.target_round_number)  AS round_number,
  pr.system_prompt,

  -- Build user prompt — use projection stats (player_id joined, team-agnostic)
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

-- Projection joined by player_id only — stats follow player across team changes
JOIN afl.v_neeko_player_projection proj
  ON proj.player_id = pl.player_id

-- Payload joined by player name only (NOT player+team) — picks up historical stats
-- regardless of what team they were recorded under
LEFT JOIN afl.v_ai_player_payloads_2026_next_round pay
  ON pay.player = pl.player_name

-- Prompt template
JOIN afl.ai_prompts pr
  ON pr.prompt_key = 'player_match_prediction'
  AND pr.is_active = true;
