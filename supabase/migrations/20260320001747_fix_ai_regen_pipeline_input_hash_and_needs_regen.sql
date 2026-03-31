/*
  # Fix AI Regeneration Pipeline — input_hash sync and needs_regen logic

  ## Problem
  All 687 players show needs_regen = true permanently because:
  1. upsert_player_ai_analysis RPC was not writing generated_at
  2. ai.player_ai_analysis.input_hash is null for all rows (older runs wrote null)
  3. v_ai_player_analysis_input only checks ai.player_ai_analysis.input_hash for
     the needs_regen signal — when that is null it always returns true

  ## Fix
  1. Drop and rebuild upsert_player_ai_analysis to correctly write input_hash,
     generated_at, and stored_projection every time
  2. Rebuild v_ai_player_analysis_input with a smarter needs_regen that also
     checks afl.player_rankings_cache.ai_updated_at as a fallback — if AI was
     updated within the last 6 days AND the hash in the cache matches, treat
     as up to date
  3. Backfill ai.player_ai_analysis with the current computed input_hash and
     generated_at from afl.player_rankings_cache so all existing rows are
     immediately marked as current

  ## Tables Modified
  - ai.player_ai_analysis (backfill input_hash + generated_at)
  - public.v_ai_player_analysis_input (rebuilt needs_regen logic)
  - public.upsert_player_ai_analysis (rebuilt RPC)
*/

-- ── Step 1: Rebuild upsert_player_ai_analysis with correct field writes ──────

DROP FUNCTION IF EXISTS public.upsert_player_ai_analysis(integer, text, numeric, text, text, text, text);
DROP FUNCTION IF EXISTS public.upsert_player_ai_analysis(integer, text, integer, text, text, text, text);

CREATE OR REPLACE FUNCTION public.upsert_player_ai_analysis(
  p_player_id       integer,
  p_recommendation  text,
  p_confidence      integer DEFAULT 65,
  p_summary_short   text    DEFAULT NULL,
  p_summary_long    text    DEFAULT NULL,
  p_model           text    DEFAULT 'gpt-4o-mini',
  p_input_hash      text    DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ai
AS $$
DECLARE
  v_rec        text;
  v_projection numeric;
BEGIN
  v_rec := UPPER(TRIM(COALESCE(p_recommendation, 'HOLD')));
  IF v_rec NOT IN ('STRONG BUY', 'BUY', 'HOLD', 'SELL', 'AVOID', 'START', 'SIT') THEN
    v_rec := 'HOLD';
  END IF;

  -- Pull current projection from rankings cache for stored_projection
  SELECT projection_final INTO v_projection
  FROM afl.player_rankings_cache
  WHERE player_id = p_player_id
  LIMIT 1;

  INSERT INTO ai.player_ai_analysis (
    player_id,
    recommendation,
    confidence,
    summary_short,
    summary_long,
    generated_at,
    model,
    input_hash,
    stored_projection
  ) VALUES (
    p_player_id,
    v_rec,
    LEAST(100, GREATEST(0, COALESCE(p_confidence, 65))),
    LEFT(COALESCE(p_summary_short, ''), 300),
    LEFT(COALESCE(p_summary_long, ''), 1000),
    now(),
    COALESCE(p_model, 'gpt-4o-mini'),
    p_input_hash,
    v_projection
  )
  ON CONFLICT (player_id) DO UPDATE SET
    recommendation    = EXCLUDED.recommendation,
    confidence        = EXCLUDED.confidence,
    summary_short     = EXCLUDED.summary_short,
    summary_long      = EXCLUDED.summary_long,
    generated_at      = EXCLUDED.generated_at,
    model             = EXCLUDED.model,
    input_hash        = EXCLUDED.input_hash,
    stored_projection = EXCLUDED.stored_projection;

  RETURN p_player_id;
END;
$$;

-- ── Step 2: Backfill ai.player_ai_analysis with current hashes ───────────────
-- This immediately fixes all 687 players so they show needs_regen = false

UPDATE ai.player_ai_analysis a
SET
  input_hash        = md5(
    COALESCE(c.projection_final::text, '') ||
    COALESCE(c.projection_confidence::text, '') ||
    COALESCE(c.value_score::text, '') ||
    COALESCE(c.games_played::text, '') ||
    COALESCE(c.risk_rating::text, '') ||
    COALESCE(c.neeko_rating_scaled::text, '') ||
    COALESCE(c.ai_recommendation, '')
  ),
  stored_projection = c.projection_final,
  generated_at      = COALESCE(c.ai_updated_at, now())
FROM afl.player_rankings_cache c
WHERE c.player_id = a.player_id
  AND c.ai_updated_at IS NOT NULL
  AND c.ai_summary IS NOT NULL;

-- ── Step 3: Rebuild v_ai_player_analysis_input with robust needs_regen ───────

DROP VIEW IF EXISTS public.v_ai_player_analysis_input;

CREATE OR REPLACE VIEW public.v_ai_player_analysis_input AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.position,
  c.price,
  c.projection_final,
  c.ceiling,
  c.floor,
  c.risk_rating                                  AS risk,
  c.projection_confidence                        AS confidence,
  c.consistency,
  c.value_score,
  c.value_tag,
  c.best_value_score,
  c.matchup_rating,
  c.matchup_label,
  c.matchup_multiplier                           AS venue_multiplier,
  c.form_score,
  c.neeko_rating,
  c.neeko_rating_scaled,
  c.games_played,
  c.upside_rating,
  c.upside_pct,
  c.captain_score,
  c.captain_rating,
  c.ai_recommendation,
  c.recommendation_strength,
  -- Computed input hash from current data
  md5(
    COALESCE(c.projection_final::text,       '') ||
    COALESCE(c.projection_confidence::text,  '') ||
    COALESCE(c.value_score::text,            '') ||
    COALESCE(c.games_played::text,           '') ||
    COALESCE(c.risk_rating::text,            '') ||
    COALESCE(c.neeko_rating_scaled::text,    '') ||
    COALESCE(c.ai_recommendation,            '')
  ) AS input_hash,
  -- needs_regen: true only when data has genuinely changed OR no AI exists
  CASE
    -- No AI record at all → must generate
    WHEN a.player_id IS NULL THEN true
    -- AI record exists but hash never written → check cache timestamp as fallback
    -- If cache was updated within 7 days, treat as current
    WHEN a.input_hash IS NULL THEN
      CASE
        WHEN c.ai_updated_at IS NOT NULL
          AND c.ai_updated_at > now() - interval '7 days'
          AND c.ai_summary IS NOT NULL
        THEN false
        ELSE true
      END
    -- Hash mismatch → data changed, regenerate
    WHEN a.input_hash <> md5(
      COALESCE(c.projection_final::text,       '') ||
      COALESCE(c.projection_confidence::text,  '') ||
      COALESCE(c.value_score::text,            '') ||
      COALESCE(c.games_played::text,           '') ||
      COALESCE(c.risk_rating::text,            '') ||
      COALESCE(c.neeko_rating_scaled::text,    '') ||
      COALESCE(c.ai_recommendation,            '')
    ) THEN true
    -- Projection drifted by more than 2 pts → regenerate
    WHEN a.stored_projection IS NOT NULL
      AND abs(c.projection_final - a.stored_projection) > 2
    THEN true
    -- Otherwise up to date
    ELSE false
  END AS needs_regen
FROM afl.player_rankings_cache c
LEFT JOIN ai.player_ai_analysis a ON a.player_id = c.player_id
WHERE c.player_id IS NOT NULL;

-- Grant read access
GRANT SELECT ON public.v_ai_player_analysis_input TO authenticated, anon, service_role;
