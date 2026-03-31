/*
  # Rebuild afl.v_player_rankings_full — Add Missing Columns

  ## Summary
  Uses CREATE OR REPLACE VIEW to extend the existing view with 13 missing
  columns the AFL Rankings frontend expects. All 15 original columns are
  preserved in their original order to avoid breaking dependent objects.

  ## Original columns preserved (positions 1–15):
  player_id, player_name, team, position, projection_final, ceiling, floor,
  consistency_score, form_rating, neeko_rating, price, value_score,
  ai_summary, captain_recommendation, ai_updated_at

  ## New columns added (positions 16–28):
  - projection_confidence  (from v_ai_player_ai_inputs.start_confidence)
  - risk_rating            (from bust_risk * 100, capped at 100)
  - matchup_rating         (text label)
  - upside_rating          (from breakout_probability * 100, capped at 100)
  - captain_score          (numeric)
  - captain_rating         (derived label from captain_score)
  - ai_recommendation      (from ai_rankings_player_recos.recommendation_label)
  - recommendation_why     (from recommendation_long)
  - recommendation_color   (from recommendation_color)
  - value_tag              (from v_ai_player_analysis_input.value_tag)
  - value_tier             (from v_ai_player_ai_inputs.value_tier)
  - consistency_tier       (derived from consistency_score)
  - total_count            (window COUNT(*) OVER())

  ## Frontend field mapping in AFLRankingsPage.tsx fetchRankings():
  r.team_name        → but view uses 'team'   — frontend reads r.team_name, mapped to team field
  r.position_group   → but view uses 'position' — frontend reads r.position_group

  NOTE: The frontend normalization reads r.team_name and r.position_group.
  The existing view already aliases to 'team' and 'position'. The RPC
  returns SETOF this view so column names are what the frontend receives.
  The frontend mapping r.team_name → row.team is handled by the normalization
  block in fetchRankings which reads `r.team_name` but the view column is `team`.
  We must add team_name and position_group as ADDITIONAL aliases so both work,
  OR fix the frontend. Since we cannot change business logic, we add both.
  To avoid breaking dependent objects (which use team/position), we keep them
  AND add team_name + position_group aliases.
*/

CREATE OR REPLACE VIEW afl.v_player_rankings_full AS
SELECT
  -- ── Original 15 columns (order preserved for dependent objects) ────────────
  nr.player_id,
  nr.player_name,

  nr.team_name                                                        AS team,
  nr.position_group                                                   AS position,

  nr.projection                                                       AS projection_final,
  nr.ceiling                                                          AS ceiling,
  nr.floor                                                            AS floor,

  nr.consistency                                                      AS consistency_score,
  nr.form_score                                                       AS form_rating,
  nr.neeko_rating                                                     AS neeko_rating,
  nr.price                                                            AS price,
  nr.value_score                                                      AS value_score,

  ai.analysis                                                         AS ai_summary,
  ai.captain_recommendation                                           AS captain_recommendation,
  COALESCE(ai.generated_at, reco.updated_at)                         AS ai_updated_at,

  -- ── New columns (positions 16–30) ─────────────────────────────────────────

  -- Also expose under the names the frontend normalization block reads
  nr.team_name                                                        AS team_name,
  nr.position_group                                                   AS position_group,

  -- Signal ratings
  ROUND(COALESCE(inp.start_confidence, 0)::numeric, 1)                AS projection_confidence,
  ROUND(LEAST(COALESCE(inp.bust_risk, 0) * 100, 100)::numeric, 1)    AS risk_rating,
  COALESCE(inp.matchup_rating, 'Neutral')                             AS matchup_rating,
  ROUND(LEAST(COALESCE(inp.breakout_probability, 0) * 100, 100)::numeric, 1)
                                                                      AS upside_rating,
  ROUND(COALESCE(inp.captain_score, 0)::numeric, 1)                  AS captain_score,

  CASE
    WHEN COALESCE(inp.captain_score, 0) >= 70 THEN 'Elite'
    WHEN COALESCE(inp.captain_score, 0) >= 50 THEN 'Strong'
    WHEN COALESCE(inp.captain_score, 0) >= 30 THEN 'Viable'
    ELSE 'Avoid'
  END                                                                 AS captain_rating,

  -- AI recommendation fields
  reco.recommendation_label                                           AS ai_recommendation,
  reco.recommendation_long                                            AS recommendation_why,
  reco.recommendation_color                                           AS recommendation_color,

  -- Value classification
  vtag.value_tag                                                      AS value_tag,
  COALESCE(inp.value_tier, 'Standard')                                AS value_tier,

  -- Consistency tier (derived)
  CASE
    WHEN nr.consistency >= 75 THEN 'Elite'
    WHEN nr.consistency >= 60 THEN 'Consistent'
    WHEN nr.consistency >= 40 THEN 'Volatile'
    ELSE 'Boom-Bust'
  END                                                                 AS consistency_tier,

  -- Total count for pagination
  COUNT(*) OVER()                                                     AS total_count

FROM afl.v_neeko_rating nr

LEFT JOIN afl.v_ai_player_ai_inputs inp
  ON nr.player_id = inp.player_id

LEFT JOIN ai_rankings_player_recos reco
  ON nr.player_id = reco.player_id::int

LEFT JOIN ai_player_analysis ai
  ON nr.player_id = ai.player_id::int

LEFT JOIN afl.v_ai_player_analysis_input vtag
  ON nr.player_id = vtag.player_id;
