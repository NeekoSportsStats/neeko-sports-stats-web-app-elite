/*
  # Rebuild v_ai_player_openai_inputs_2026_next_round — Neeko Projection Engine v5

  ## Summary
  Replaces the prior view with one that:
  1. Sources projections from afl.v_neeko_player_projection (player_id keyed).
  2. Uses season_context-aware language in the prompt.
  3. Retains all original prompt-token replacements verbatim.
  4. Uses a helper function (fn_fill_player_prompt) to avoid deep nesting.

  ## Notes
  - DROP + CREATE required (column count change).
  - matchup_label derived from matchup_delta (team_defense_profile_2026 has no label col).
  - player_id and season_context_label appended at end.
*/

/* ── Helper function: fill 17-token prompt template ───────────────────── */

DROP FUNCTION IF EXISTS afl.fn_fill_player_prompt(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text);

CREATE OR REPLACE FUNCTION afl.fn_fill_player_prompt(
  template         text,
  p_player         text,
  p_expected       text,
  p_floor          text,
  p_ceiling        text,
  p_season_avg     text,
  p_last_3         text,
  p_last_5         text,
  p_volatility     text,
  p_risk_tier      text,
  p_consistency    text,
  p_matchup_delta  text,
  p_matchup_label  text,
  p_prob_100       text,
  p_prob_120       text,
  p_prob_140       text,
  p_games_played   text,
  p_trend          text
) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    replace(replace(replace(replace(replace(replace(replace(replace(replace(
    replace(replace(replace(replace(replace(replace(replace(replace(
      template,
      '{player}',            p_player),
      '{expected}',          p_expected),
      '{floor_fantasy}',     p_floor),
      '{ceiling_fantasy}',   p_ceiling),
      '{season_avg}',        p_season_avg),
      '{last_3_avg}',        p_last_3),
      '{last_5_avg}',        p_last_5),
      '{volatility}',        p_volatility),
      '{risk_tier}',         p_risk_tier),
      '{consistency_score}', p_consistency),
      '{matchup_delta}',     p_matchup_delta),
      '{matchup_label}',     p_matchup_label),
      '{prob_100_plus}',     p_prob_100),
      '{prob_120_plus}',     p_prob_120),
      '{prob_140_plus}',     p_prob_140),
      '{games_played}',      p_games_played),
      '{trend_direction}',   p_trend)
$$;

GRANT EXECUTE ON FUNCTION afl.fn_fill_player_prompt(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text)
  TO authenticated, anon;


/* ── Main view ────────────────────────────────────────────────────────── */

DROP VIEW IF EXISTS afl.v_ai_player_openai_inputs_2026_next_round;

CREATE VIEW afl.v_ai_player_openai_inputs_2026_next_round AS

WITH proj AS (
  SELECT
    np.player_id,
    np.player_name,
    np.team,
    np.opponent,
    np.target_round_number                                     AS round_number,
    np.season_context,
    np.final_projection                                        AS expected_fantasy,
    np.floor_estimate                                          AS floor_fantasy,
    np.ceiling_estimate                                        AS ceiling_fantasy,
    np.season_avg_current,
    np.avg_last_5,
    np.avg_last_15,
    np.volatility_last_15,
    np.prob_100_plus,
    np.prob_120_plus,
    np.trend_3_vs_10,
    (np.games_played_2025 + np.games_played_2026)              AS games_played_total,
    CASE np.season_context
      WHEN 'PRESEASON_2025_BASELINE' THEN 'Based on 2025 baseline (2026 pre-season)'
      WHEN 'EARLY_2026_BLENDED'      THEN 'Based on blended 2025/2026 form (early season)'
      WHEN 'MID_2026_BLENDED'        THEN 'Based on 2026 form with 2025 anchor (mid season)'
      WHEN 'FULL_2026_ROLLING'       THEN 'Based on 2026 rolling form'
      ELSE                                'Based on 2025 baseline (2026 pre-season)'
    END                                                        AS season_context_label,
    CASE
      WHEN np.volatility_last_15 IS NULL THEN 'Unknown'
      WHEN np.volatility_last_15 < 15    THEN 'Low'
      WHEN np.volatility_last_15 < 25    THEN 'Medium'
      WHEN np.volatility_last_15 < 35    THEN 'High'
      ELSE                                    'Very High'
    END                                                        AS risk_tier,
    COALESCE(def.matchup_delta, 0)                             AS matchup_delta,
    CASE
      WHEN COALESCE(def.matchup_delta, 0) >  5 THEN 'Favourable'
      WHEN COALESCE(def.matchup_delta, 0) < -5 THEN 'Tough'
      ELSE                                          'Neutral'
    END                                                        AS matchup_label,
    CASE
      WHEN np.trend_3_vs_10 >  5 THEN 'up'
      WHEN np.trend_3_vs_10 < -5 THEN 'down'
      ELSE                            'stable'
    END                                                        AS trend_direction,
    ROUND((
      np.avg_last_5 * 0.6 +
      COALESCE(np.avg_last_15, np.season_avg_current) * 0.4
    )::numeric, 1)                                             AS last_3_avg_est
  FROM afl.v_neeko_player_projection np
  LEFT JOIN afl.team_defense_profile_2026 def ON def.team = np.opponent
)

SELECT
  pay.match_id,
  proj.round_number,
  proj.player_name                                             AS player,
  proj.team,
  proj.opponent,
  jsonb_build_object(
    'system',         pr.system_prompt,
    'user',           afl.fn_fill_player_prompt(
                        pr.user_prompt_template,
                        COALESCE(proj.player_name,                        ''),
                        COALESCE(round(proj.expected_fantasy,   1)::text,  'N/A'),
                        COALESCE(round(proj.floor_fantasy,      1)::text,  'N/A'),
                        COALESCE(round(proj.ceiling_fantasy,    1)::text,  'N/A'),
                        COALESCE(round(proj.season_avg_current, 1)::text,  'N/A'),
                        COALESCE(round(proj.last_3_avg_est,     1)::text,  'N/A'),
                        COALESCE(round(proj.avg_last_5,         1)::text,  'N/A'),
                        COALESCE(round(proj.volatility_last_15, 2)::text,  'N/A'),
                        COALESCE(proj.risk_tier,                           'N/A'),
                        COALESCE(round(proj.prob_100_plus * 10, 1)::text,  'N/A'),
                        COALESCE(round(proj.matchup_delta,      2)::text,  'N/A'),
                        COALESCE(proj.matchup_label,                       'N/A'),
                        COALESCE(round(proj.prob_100_plus * 100, 1)::text || '%', 'N/A'),
                        COALESCE(round(proj.prob_120_plus * 100, 1)::text || '%', 'N/A'),
                        'N/A',
                        COALESCE(proj.games_played_total::text,            'N/A'),
                        COALESCE(proj.trend_direction,                     'N/A')
                      ),
    'payload',        pay.payload,
    'season_context', proj.season_context_label
  )                                                            AS final_openai_input,
  proj.player_id,
  proj.season_context_label
FROM proj
JOIN afl.v_ai_player_payloads_2026_next_round pay
  ON pay.player = proj.player_name
 AND pay.team   = proj.team
JOIN afl.ai_prompts pr
  ON pr.prompt_key = 'player_round_summary'
 AND pr.is_active  = true;

GRANT SELECT ON afl.v_ai_player_openai_inputs_2026_next_round TO authenticated, anon;
