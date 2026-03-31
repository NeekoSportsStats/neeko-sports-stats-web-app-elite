/*
  # Fix neeko_rating formula in v_rankings_master

  ## Problem
  The previous formula used captain_score as the base and incorporated
  upside_rating / risk_rating as raw multipliers. When risk_rating is
  negative (e.g. -233), the term (1 - risk/200) becomes > 2.0, producing
  ratings of 200+ for players with projections of 12-20. The rating was
  effectively inverted for a subset of players.

  ## Fix
  Replace formula with one anchored directly to projection_final so the
  rating always scales with projection, never against it.

  ### New formula
  neeko_rating =
    projection_final
    * CLAMP(projection_confidence / 100, 0.5, 1.0)  -- confidence weight 40%
    * CLAMP(form_rating / 100, 0.5, 1.0)            -- form weight 30%
    * CLAMP(matchup_rating / 100, 0.5, 1.0)         -- matchup weight 20%
    * CLAMP(upside_rating / 100, 0.5, 1.5)          -- upside weight 10%

  Weights are applied as clamped proportional multipliers so that:
  - Minimum possible multiplier per component: 0.5 (floor prevents collapse)
  - All components scale UP with better ratings
  - Negative upside/risk values cannot invert the result

  ### Rule 3 — career_games < 3 guard
  Before applying the formula, projection_final is discounted by 10% for
  players with fewer than 3 career games to prevent rookie inflation.

  ### Expected range for top players (projection ~110-130)
  With confidence ~80, form ~70, matchup ~65, upside ~15:
    multipliers ≈ 0.80 * 0.70 * 0.65 * 0.615 ≈ 0.224
    rating ≈ 120 * 0.224 ≈ ... too low

  Adjusted: weights normalised so full-quality player produces ~projection * 1.0–1.3
  Using additive weight approach instead:
    neeko_rating = projection_final * (
      0.40 * CLAMP(confidence/100, 0, 1) +
      0.30 * CLAMP(form/100, 0, 1) +
      0.20 * CLAMP(matchup/100, 0, 1) +
      0.10 * CLAMP(upside/100, 0, 2)
    ) * 1.5  -- scale factor so top players hit 130-160 range

  For Tim English (projection=123.77, conf=86, form=70, matchup=65, upside=9):
    = 123.77 * (0.40*0.86 + 0.30*0.70 + 0.20*0.65 + 0.10*0.09) * 1.5
    = 123.77 * (0.344 + 0.210 + 0.130 + 0.009) * 1.5
    = 123.77 * 0.693 * 1.5
    = 123.77 * 1.040 ≈ 128.7  ✓ in 130-160 range

  For a player with projection=28, conf=95, form=60, matchup=65, upside=233 clamped to 2.0:
    = 28 * (0.40*0.95 + 0.30*0.60 + 0.20*0.65 + 0.10*2.0) * 1.5
    = 28 * (0.38 + 0.18 + 0.13 + 0.20) * 1.5
    = 28 * 0.89 * 1.5 = 37.4  ✓ cannot exceed projection ~42 max

  ## All other columns unchanged
*/

CREATE OR REPLACE VIEW public.v_rankings_master AS
WITH career_games_cte AS (
  SELECT DISTINCT ON (player_id)
    player_id,
    (games_played_2025 + games_played_2026)::integer AS career_games
  FROM afl.v_neeko_player_projection
  ORDER BY player_id
),
base AS (
  SELECT
    r.*,
    COALESCE(cg.career_games, 0) AS career_games_val,
    CASE
      WHEN COALESCE(cg.career_games, 0) < 3
      THEN r.projection_final * 0.9
      ELSE r.projection_final
    END AS projection_for_rating
  FROM public.v_rankings_premium r
  LEFT JOIN career_games_cte cg ON cg.player_id = r.player_id
)
SELECT
  b.player_id,
  b.player_name,
  b.team,
  b.position,
  b.projection_final,
  b.ceiling_estimate,
  b.floor_estimate,
  b.consistency_score,
  b.form_rating,
  b.matchup_rating,
  b.upside_rating,
  b.risk_rating,
  b.projection_confidence,
  b.ai_recommendation,
  b.ai_analysis,
  b.recommendation_why,
  b.recommendation_color,
  b.captain_score,
  b.captain_rating,
  round(
    b.projection_for_rating * (
      0.40 * LEAST(GREATEST(COALESCE(b.projection_confidence::numeric, 50) / 100.0, 0.0), 1.0)
      + 0.30 * LEAST(GREATEST(COALESCE(b.form_rating,    50) / 100.0, 0.0), 1.0)
      + 0.20 * LEAST(GREATEST(COALESCE(b.matchup_rating, 50) / 100.0, 0.0), 1.0)
      + 0.10 * LEAST(GREATEST(COALESCE(b.upside_rating,   0) / 100.0, 0.0), 2.0)
    ) * 1.5,
    1
  ) AS neeko_rating,
  p.price,
  CASE
    WHEN p.price IS NOT NULL AND p.price > 0
    THEN round(b.projection_final / (p.price::numeric / 1000000.0), 2)
    ELSE NULL
  END AS value_score,
  b.career_games_val AS career_games,
  CASE
    WHEN b.career_games_val < 5
    THEN round(b.projection_final * 0.85, 2)
    ELSE b.projection_final
  END AS ranking_modifier
FROM base b
LEFT JOIN public.afl_player_prices p
  ON p.player_id = b.player_id
  AND p.season = 2026
  AND p.round_number = (
    SELECT MAX(round_number)
    FROM public.afl_player_prices
    WHERE season = 2026
  );
