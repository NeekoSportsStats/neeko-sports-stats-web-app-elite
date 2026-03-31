/*
  # Add ranking_modifier to v_rankings_master — Rule 4

  ## Summary
  Rebuilds public.v_rankings_master to apply a ranking_modifier that
  discounts projection_final for low-career-games players, preventing
  them from inflating to unrealistic ranking positions.

  ## Rule 4 — Prevent rookie ranking inflation
  ranking_modifier applied to effective_projection (used for ordering):
    WHEN career_games < 5 → projection_final * 0.85
    ELSE                   → projection_final

  career_games = games_played_2025 + games_played_2026 from
  afl.v_neeko_player_projection (sourced per player via LEFT JOIN).

  ## New columns added
  - career_games (integer): total games 2025 + 2026
  - ranking_modifier (numeric): the 0.85-discounted or full projection value
    used for ranking order

  ## Existing columns
  All existing columns preserved with identical names and types.
  projection_final is NOT changed — it still reflects the true stabilised
  projection from v_neeko_player_projection_final. ranking_modifier is the
  separate ordering signal.
*/

CREATE OR REPLACE VIEW public.v_rankings_master AS
WITH career_games_cte AS (
  SELECT DISTINCT ON (player_id)
    player_id,
    (games_played_2025 + games_played_2026)::integer AS career_games
  FROM afl.v_neeko_player_projection
  ORDER BY player_id
)
SELECT
  r.player_id,
  r.player_name,
  r.team,
  r.position,
  r.projection_final,
  r.ceiling_estimate,
  r.floor_estimate,
  r.consistency_score,
  r.form_rating,
  r.matchup_rating,
  r.upside_rating,
  r.risk_rating,
  r.projection_confidence,
  r.ai_recommendation,
  r.ai_analysis,
  r.recommendation_why,
  r.recommendation_color,
  r.captain_score,
  r.captain_rating,
  round(
    COALESCE(r.captain_score, 0)
    * power(1.0 + COALESCE(r.upside_rating, 0) / 200.0, 0.60)
    * (1.0 - COALESCE(r.risk_rating, 0) / 200.0)
    * (1.0 + COALESCE(r.consistency_score::numeric, 0) / 200.0),
    1
  ) AS neeko_rating,
  p.price,
  CASE
    WHEN p.price IS NOT NULL AND p.price > 0
    THEN round(r.projection_final / (p.price::numeric / 1000000.0), 2)
    ELSE NULL
  END AS value_score,
  COALESCE(cg.career_games, 0)::integer AS career_games,
  CASE
    WHEN COALESCE(cg.career_games, 0) < 5
    THEN round(r.projection_final * 0.85, 2)
    ELSE r.projection_final
  END AS ranking_modifier
FROM public.v_rankings_premium r
LEFT JOIN public.afl_player_prices p
  ON p.player_id = r.player_id
  AND p.season = 2026
  AND p.round_number = (
    SELECT MAX(round_number)
    FROM public.afl_player_prices
    WHERE season = 2026
  )
LEFT JOIN career_games_cte cg ON cg.player_id = r.player_id;
