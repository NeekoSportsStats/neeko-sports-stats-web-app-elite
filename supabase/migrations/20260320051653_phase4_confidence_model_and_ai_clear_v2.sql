/*
  # Phase 4: Confidence Model Fix + admin.clear_ai_text() v2

  GET DIAGNOSTICS must use a temp variable per UPDATE.
*/

-- ─── Confidence Model Function ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION afl.compute_player_confidence(
  p_games_played   integer,
  p_consistency    numeric,
  p_matchup_rating numeric,
  p_ceiling        numeric,
  p_floor          numeric,
  p_projection     numeric,
  p_price          integer
) RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_sample   numeric;
  v_role     numeric;
  v_matchup  numeric;
  v_spread   numeric;
  v_complete numeric;
  v_raw      numeric;
  v_scaled   numeric;
BEGIN
  v_sample := CASE
    WHEN p_games_played IS NULL OR p_games_played = 0 THEN 10
    WHEN p_games_played >= 15 THEN 100
    WHEN p_games_played >= 10 THEN 80
    WHEN p_games_played >= 6  THEN 60
    WHEN p_games_played >= 3  THEN 40
    ELSE 20
  END;

  v_role := GREATEST(0, LEAST(100, COALESCE(p_consistency, 50)));

  v_matchup := GREATEST(0, LEAST(100, COALESCE(p_matchup_rating, 5) * 10));

  v_spread := CASE
    WHEN p_projection IS NULL OR p_projection = 0 THEN 30
    WHEN (COALESCE(p_ceiling, p_projection) - COALESCE(p_floor, p_projection)) / GREATEST(p_projection, 1) < 0.25 THEN 90
    WHEN (COALESCE(p_ceiling, p_projection) - COALESCE(p_floor, p_projection)) / GREATEST(p_projection, 1) < 0.40 THEN 75
    WHEN (COALESCE(p_ceiling, p_projection) - COALESCE(p_floor, p_projection)) / GREATEST(p_projection, 1) < 0.60 THEN 58
    ELSE 40
  END;

  v_complete := CASE WHEN p_price IS NOT NULL AND p_price > 0 THEN 100 ELSE 50 END;

  v_raw := 0.28 * v_sample + 0.22 * v_role + 0.20 * v_matchup + 0.18 * v_spread + 0.12 * v_complete;

  v_scaled := 40 + (50 * (v_raw / 100.0) * (2 - v_raw / 100.0));

  RETURN ROUND(GREATEST(40, LEAST(92, v_scaled)))::integer;
END;
$$;

GRANT EXECUTE ON FUNCTION afl.compute_player_confidence(integer, numeric, numeric, numeric, numeric, numeric, integer) TO service_role;

-- ─── admin.clear_ai_text() ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin.clear_ai_text(p_scope text DEFAULT 'all')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl, admin
AS $$
DECLARE
  v_cache_short    integer := 0;
  v_cache_extended integer := 0;
  v_recos          integer := 0;
  v_analysis       integer := 0;
  v_tmp            integer;
BEGIN
  p_scope := lower(trim(p_scope));

  IF p_scope NOT IN ('short', 'extended', 'all') THEN
    RAISE EXCEPTION 'Invalid scope: %. Use short, extended, or all.', p_scope;
  END IF;

  IF p_scope IN ('short', 'all') THEN
    UPDATE afl.player_rankings_cache
    SET recommendation_why = NULL, recommendation_short = NULL, ai_updated_at = now()
    WHERE recommendation_why IS NOT NULL OR recommendation_short IS NOT NULL;
    GET DIAGNOSTICS v_tmp = ROW_COUNT;
    v_cache_short := v_tmp;

    UPDATE public.ai_rankings_player_recos
    SET recommendation_label = NULL, recommendation_short = NULL,
        recommendation_long = NULL, recommendation_color = NULL,
        input_hash = NULL, updated_at = now()
    WHERE recommendation_label IS NOT NULL;
    GET DIAGNOSTICS v_tmp = ROW_COUNT;
    v_recos := v_tmp;
  END IF;

  IF p_scope IN ('extended', 'all') THEN
    UPDATE afl.player_rankings_cache
    SET summary = NULL, analysis = NULL, ai_summary = NULL, ai_updated_at = now()
    WHERE summary IS NOT NULL OR analysis IS NOT NULL OR ai_summary IS NOT NULL;
    GET DIAGNOSTICS v_tmp = ROW_COUNT;
    v_cache_extended := v_tmp;

    UPDATE public.ai_player_analysis
    SET analysis = '', updated_at = now()
    WHERE analysis IS NOT NULL AND analysis <> '';
    GET DIAGNOSTICS v_tmp = ROW_COUNT;
    v_analysis := v_tmp;
  END IF;

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES (
    'clear_ai_text',
    'admin.clear_ai_text',
    'warn',
    'AI text cleared — scope=' || p_scope || ' total=' || (v_cache_short + v_cache_extended + v_recos + v_analysis),
    jsonb_build_object(
      'scope', p_scope,
      'cache_short', v_cache_short,
      'cache_extended', v_cache_extended,
      'reco_rows', v_recos,
      'analysis_rows', v_analysis
    )
  );

  RETURN jsonb_build_object(
    'success',       true,
    'scope',         p_scope,
    'rows_affected', v_cache_short + v_cache_extended + v_recos + v_analysis,
    'cache_short',   v_cache_short,
    'cache_extended', v_cache_extended,
    'reco_rows',     v_recos,
    'analysis_rows', v_analysis
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin.clear_ai_text(text) TO service_role;
