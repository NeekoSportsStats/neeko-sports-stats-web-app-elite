/*
  # Rebuild Player OpenAI Input View — Drop & Recreate (v6)

  ## Problem
  Previous view had column order: match_id, round_number, player, team, opponent,
  player_id, season_context_label, final_openai_input.
  New view needs player_id as first column to match spec.
  PostgreSQL cannot rename view columns via CREATE OR REPLACE when the column
  names differ in position — must drop and recreate.

  ## Safe — No Data Loss
  This is a VIEW (not a table). No user data is stored in this object.
  Dropping and recreating it is safe — only the query definition changes.

  ## New View Features
  - Sources all 780 players from v_neeko_player_projection
  - Uses correct column names: final_projection, ceiling_estimate,
    floor_estimate, season_avg_current, avg_last_5, volatility_last_15
  - ALL tokens resolved inline via chained replace()
  - final_openai_input payload has nested prediction/form/volatility/role
    sub-objects for compatibility with existing edge function buildUserPrompt()
  - Exposes predicted_score column for Part 2 NULL verification query
*/

DROP VIEW IF EXISTS afl.v_ai_player_openai_inputs_2026_next_round;

CREATE VIEW afl.v_ai_player_openai_inputs_2026_next_round AS
SELECT
  p.player_id,
  p.player_name                                                     AS player,
  p.team,
  COALESCE(pay.opponent, p.opponent)                                AS opponent,
  pay.match_id,
  pay.round_number,
  pr.system_prompt,
  replace(replace(replace(replace(replace(replace(replace(replace(
    pr.user_prompt_template,
    '{player}',         p.player_name),
    '{team}',           p.team),
    '{opponent}',       COALESCE(pay.opponent, p.opponent, 'No fixture')),
    '{season_avg}',     COALESCE(ROUND(p.season_avg_current::numeric, 1)::text, 'N/A')),
    '{last_5_avg}',     COALESCE(ROUND(p.avg_last_5::numeric, 1)::text, 'N/A')),
    '{predicted_score}',COALESCE(ROUND(p.final_projection::numeric, 1)::text, '0.0')),
    '{ceiling}',        COALESCE(ROUND(p.ceiling_estimate::numeric, 1)::text, 'N/A')),
    '{floor}',          COALESCE(ROUND(p.floor_estimate::numeric, 1)::text, 'N/A'))
                                                                    AS user_prompt,
  jsonb_build_object(
    'system',   pr.system_prompt,
    'user',
      replace(replace(replace(replace(replace(replace(replace(replace(
        pr.user_prompt_template,
        '{player}',         p.player_name),
        '{team}',           p.team),
        '{opponent}',       COALESCE(pay.opponent, p.opponent, 'No fixture')),
        '{season_avg}',     COALESCE(ROUND(p.season_avg_current::numeric, 1)::text, 'N/A')),
        '{last_5_avg}',     COALESCE(ROUND(p.avg_last_5::numeric, 1)::text, 'N/A')),
        '{predicted_score}',COALESCE(ROUND(p.final_projection::numeric, 1)::text, '0.0')),
        '{ceiling}',        COALESCE(ROUND(p.ceiling_estimate::numeric, 1)::text, 'N/A')),
        '{floor}',          COALESCE(ROUND(p.floor_estimate::numeric, 1)::text, 'N/A')),
    'payload',  jsonb_build_object(
      'player',     p.player_name,
      'team',       p.team,
      'opponent',   COALESCE(pay.opponent, p.opponent),
      'prediction', jsonb_build_object(
        'predicted_score', p.final_projection,
        'ceiling',         p.ceiling_estimate,
        'floor',           p.floor_estimate,
        'stdev',           p.volatility_last_15,
        'trend_direction', CASE
          WHEN p.trend_3_vs_10 >  5 THEN 'up'
          WHEN p.trend_3_vs_10 < -5 THEN 'down'
          ELSE 'stable'
        END
      ),
      'form',       jsonb_build_object(
        'season_avg',  p.season_avg_current,
        'avg_last_5',  p.avg_last_5,
        'last_5_avg',  p.avg_last_5,
        'avg_last_15', p.avg_last_15
      ),
      'volatility', jsonb_build_object(
        'stdev',              p.volatility_last_15,
        'volatility_last_15', p.volatility_last_15,
        'ceiling',            p.ceiling_estimate,
        'floor',              p.floor_estimate
      ),
      'role',       jsonb_build_object(
        'consistency_score', ROUND(COALESCE(p.prob_100_plus, 0) * 10, 1)
      )
    ),
    'season_context', CASE p.season_context
      WHEN 'PRESEASON_2025_BASELINE' THEN 'Based on 2025 baseline (2026 pre-season)'
      WHEN 'EARLY_2026_BLENDED'      THEN 'Based on blended 2025/2026 form (early season)'
      WHEN 'MID_2026_BLENDED'        THEN 'Based on 2026 form with 2025 anchor (mid season)'
      WHEN 'FULL_2026_ROLLING'       THEN 'Based on 2026 rolling form'
      ELSE                                'Based on 2025 baseline (2026 pre-season)'
    END
  )                                                                 AS final_openai_input,
  CASE p.season_context
    WHEN 'PRESEASON_2025_BASELINE' THEN 'Based on 2025 baseline (2026 pre-season)'
    WHEN 'EARLY_2026_BLENDED'      THEN 'Based on blended 2025/2026 form (early season)'
    WHEN 'MID_2026_BLENDED'        THEN 'Based on 2026 form with 2025 anchor (mid season)'
    WHEN 'FULL_2026_ROLLING'       THEN 'Based on 2026 rolling form'
    ELSE                                'Based on 2025 baseline (2026 pre-season)'
  END                                                               AS season_context_label,
  p.final_projection                                                AS predicted_score
FROM afl.v_neeko_player_projection p
JOIN afl.v_ai_player_payloads_2026_next_round pay
  ON pay.player = p.player_name
 AND pay.team   = p.team
JOIN afl.ai_prompts pr
  ON pr.prompt_key = 'player_match_prediction'
 AND pr.is_active  = true;
