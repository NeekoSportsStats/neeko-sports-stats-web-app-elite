/*
  # Fix AI Rankings Pipeline — Indexes + View Rebuild

  ## Summary
  Fixes multiple issues in the AI rankings pipeline:

  1. **Adds missing indexes** on ai_player_analysis and ai_rankings_player_recos
     for fast player_id lookups during JOIN operations.

  2. **Rebuilds v_rankings_canonical** to:
     - Use player_id for ai_player_summaries join (not player_name — eliminates full table scan)
     - Use CASE WHEN instead of COALESCE for cleaner, faster AI override logic
     - Ensure all AI joins are LEFT JOIN (rankings never depend on AI rows)

  3. **Backfills recommendation_label, recommendation_short, recommendation_color**
     in ai_rankings_player_recos by extracting the label from recommendation_long text,
     which always begins with "Player is currently a BUY/SELL/HOLD/etc".

  ## Tables Modified
  - ai_rankings_player_recos — backfills 3 columns from existing text
  - v_rankings_canonical — rebuilt with player_id join + CASE WHEN logic

  ## New Indexes
  - idx_ai_player_analysis_player_id (public.ai_player_analysis)
  - idx_ai_rankings_recos_season (public.ai_rankings_player_recos)

  ## Security
  - No RLS changes — existing policies preserved
*/

-- ─── 1. Add fast-lookup indexes ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ai_player_analysis_player_id
  ON public.ai_player_analysis(player_id);

CREATE INDEX IF NOT EXISTS idx_ai_rankings_recos_season
  ON public.ai_rankings_player_recos(player_id, season);

-- ─── 2. Backfill recommendation_label from recommendation_long text ───────────
-- The AI always writes "PlayerName is currently a LABEL due to..."
-- Extract the label word that follows "currently a " or "currently an "

UPDATE public.ai_rankings_player_recos
SET
  recommendation_label = CASE
    WHEN recommendation_long ILIKE '%currently a BUY%'     OR recommendation_long ILIKE '%is a BUY%'     THEN 'BUY'
    WHEN recommendation_long ILIKE '%currently a SELL%'    OR recommendation_long ILIKE '%is a SELL%'    THEN 'SELL'
    WHEN recommendation_long ILIKE '%currently a HOLD%'    OR recommendation_long ILIKE '%is a HOLD%'    THEN 'HOLD'
    WHEN recommendation_long ILIKE '%currently a CAPTAIN%' OR recommendation_long ILIKE '%is a CAPTAIN%' THEN 'CAPTAIN'
    WHEN recommendation_long ILIKE '%currently an AVOID%'  OR recommendation_long ILIKE '%is an AVOID%'  THEN 'AVOID'
    WHEN recommendation_long ILIKE '%currently a START%'   OR recommendation_long ILIKE '%is a START%'   THEN 'START'
    WHEN recommendation_long ILIKE '%currently a SIT%'     OR recommendation_long ILIKE '%is a SIT%'     THEN 'SIT'
    WHEN recommendation_long ILIKE '%strong buy%'         OR recommendation_long ILIKE '%immediate buy%' THEN 'BUY'
    WHEN recommendation_long ILIKE '%sell%'                                                               THEN 'SELL'
    WHEN recommendation_long ILIKE '%captain%'                                                            THEN 'CAPTAIN'
    ELSE 'HOLD'
  END,
  recommendation_short = CASE
    WHEN recommendation_long ILIKE '%currently a BUY%'     OR recommendation_long ILIKE '%is a BUY%'     THEN 'Strong buy signal'
    WHEN recommendation_long ILIKE '%currently a SELL%'    OR recommendation_long ILIKE '%is a SELL%'    THEN 'Sell or avoid'
    WHEN recommendation_long ILIKE '%currently a HOLD%'    OR recommendation_long ILIKE '%is a HOLD%'    THEN 'Hold your position'
    WHEN recommendation_long ILIKE '%currently a CAPTAIN%' OR recommendation_long ILIKE '%is a CAPTAIN%' THEN 'Premium captain pick'
    WHEN recommendation_long ILIKE '%currently an AVOID%'  OR recommendation_long ILIKE '%is an AVOID%'  THEN 'Avoid this week'
    WHEN recommendation_long ILIKE '%currently a START%'   OR recommendation_long ILIKE '%is a START%'   THEN 'Start with confidence'
    WHEN recommendation_long ILIKE '%currently a SIT%'     OR recommendation_long ILIKE '%is a SIT%'     THEN 'Sit this round'
    WHEN recommendation_long ILIKE '%strong buy%'         OR recommendation_long ILIKE '%immediate buy%' THEN 'Strong buy signal'
    WHEN recommendation_long ILIKE '%sell%'                                                               THEN 'Consider selling'
    WHEN recommendation_long ILIKE '%captain%'                                                            THEN 'Premium captain pick'
    ELSE 'Monitor this week'
  END,
  recommendation_color = CASE
    WHEN recommendation_long ILIKE '%currently a BUY%'     OR recommendation_long ILIKE '%is a BUY%'     THEN 'green'
    WHEN recommendation_long ILIKE '%currently a SELL%'    OR recommendation_long ILIKE '%is a SELL%'    THEN 'red'
    WHEN recommendation_long ILIKE '%currently a HOLD%'    OR recommendation_long ILIKE '%is a HOLD%'    THEN 'yellow'
    WHEN recommendation_long ILIKE '%currently a CAPTAIN%' OR recommendation_long ILIKE '%is a CAPTAIN%' THEN 'gold'
    WHEN recommendation_long ILIKE '%currently an AVOID%'  OR recommendation_long ILIKE '%is an AVOID%'  THEN 'red'
    WHEN recommendation_long ILIKE '%currently a START%'   OR recommendation_long ILIKE '%is a START%'   THEN 'green'
    WHEN recommendation_long ILIKE '%currently a SIT%'     OR recommendation_long ILIKE '%is a SIT%'     THEN 'orange'
    WHEN recommendation_long ILIKE '%strong buy%'         OR recommendation_long ILIKE '%immediate buy%' THEN 'green'
    WHEN recommendation_long ILIKE '%sell%'                                                               THEN 'red'
    WHEN recommendation_long ILIKE '%captain%'                                                            THEN 'gold'
    ELSE 'yellow'
  END
WHERE season = 2026
  AND recommendation_long IS NOT NULL
  AND (recommendation_label IS NULL OR recommendation_short IS NULL OR recommendation_color IS NULL);

-- ─── 3. Rebuild v_rankings_canonical with player_id join ─────────────────────

DROP VIEW IF EXISTS public.v_rankings_canonical CASCADE;

CREATE VIEW public.v_rankings_canonical AS
SELECT
  r.player_id,
  r.player_name,
  r.team,
  r."position",
  r.projection_final,
  r.ceiling_estimate,
  r.floor_estimate,
  r.consistency_score,
  r.form_rating,
  r.matchup_rating,
  r.upside_rating,
  r.risk_rating,
  r.projection_confidence,
  r.captain_score,
  r.captain_rating,
  r.neeko_rating,
  r.price,
  r.value_score,
  r.value_tier,
  r.value_tag,
  r.price_tier,
  r.consistency_tier,
  COALESCE(a.recommendation_label, r.ai_recommendation) AS ai_recommendation,
  COALESCE(a.recommendation_short, r.recommendation_why) AS recommendation_why,
  COALESCE(a.recommendation_color, r.recommendation_color) AS recommendation_color,
  CASE
    WHEN a.recommendation_long IS NOT NULL THEN a.recommendation_long
    WHEN s.ai_summary IS NOT NULL          THEN s.ai_summary
    ELSE r.ai_analysis
  END AS ai_summary,
  CASE
    WHEN a.generated_at IS NOT NULL AND (s.updated_at IS NULL OR a.generated_at >= s.updated_at::timestamptz)
      THEN a.generated_at
    WHEN s.updated_at IS NOT NULL
      THEN s.updated_at::timestamptz
    ELSE NULL
  END AS ai_updated_at,
  r.data_updated_at
FROM v_rankings_with_value r
LEFT JOIN public.ai_rankings_player_recos a
  ON a.player_id = r.player_id AND a.season = 2026
LEFT JOIN afl.ai_player_summaries s
  ON s.player_id = r.player_id::integer;

GRANT SELECT ON public.v_rankings_canonical TO anon, authenticated;
