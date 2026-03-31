/*
  # Fix 2 — Unify value_tier logic across the system

  ## Problem
  value_tier was computed two different ways:
  1. v_rankings_with_value used fixed absolute thresholds (>= 85 = ELITE, >= 70 = GOOD)
  2. get_rankings_free / get_rankings_premium recomputed using PERCENT_RANK() into 4 tiers

  This caused different results in admin/marketing tools vs the rankings page.

  ## Fix
  Rebuild v_rankings_with_value to use a canonical percentile-rank system:
    value_percentile = PERCENT_RANK() OVER (ORDER BY value_score ASC)
    ELITE VALUE  → top 10% (percentile >= 0.90)
    GOOD VALUE   → next 20% (percentile >= 0.70)
    FAIR VALUE   → next 30% (percentile >= 0.40)
    POOR VALUE   → bottom 40%

  Then simplify get_rankings_free and get_rankings_premium to read value_tier and
  value_tag directly from v_rankings_canonical instead of recomputing them.

  ## Views/functions modified
  - public.v_rankings_with_value (rebuilt with percentile-rank tiers)
  - public.get_rankings_free (removes internal tier computation)
  - public.get_rankings_premium (removes internal tier computation)
*/

-- Step 1: Rebuild v_rankings_with_value with unified percentile-rank value tiers
CREATE OR REPLACE VIEW public.v_rankings_with_value AS
WITH base AS (
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
        r.ai_recommendation,
        r.ai_analysis,
        r.recommendation_why,
        r.recommendation_color,
        r.captain_score,
        r.captain_rating,
        r.neeko_rating,
        p.price,
        CASE
            WHEN p.price > 0 THEN round(r.projection_final / (p.price::numeric / 1000000.0), 2)
            ELSE NULL::numeric
        END AS value_score,
        CASE
            WHEN p.price >= 900000 THEN 'Premium'::text
            WHEN p.price >= 700000 THEN 'Expensive'::text
            WHEN p.price >= 500000 THEN 'Mid'::text
            WHEN p.price >= 300000 THEN 'Cheap'::text
            ELSE 'Rookie'::text
        END AS price_tier,
        CASE
            WHEN r.consistency_score >= 80::double precision THEN 'ELITE'::text
            WHEN r.consistency_score >= 60::double precision THEN 'GOOD'::text
            ELSE 'POOR'::text
        END AS consistency_tier,
        ar.updated_at AS data_updated_at
    FROM v_rankings_master r
    LEFT JOIN afl_player_prices p
        ON p.player_id = r.player_id
        AND p.season = 2026
        AND p.round_number = (
            SELECT max(afl_player_prices.round_number)
            FROM afl_player_prices
            WHERE afl_player_prices.season = 2026
        )
    LEFT JOIN ai_rankings_player_recos ar
        ON ar.player_id = r.player_id
        AND ar.season = 2026
),
with_percentile AS (
    SELECT
        *,
        PERCENT_RANK() OVER (ORDER BY value_score ASC NULLS FIRST) AS value_percentile
    FROM base
)
SELECT
    player_id,
    player_name,
    team,
    "position",
    projection_final,
    ceiling_estimate,
    floor_estimate,
    consistency_score,
    form_rating,
    matchup_rating,
    upside_rating,
    risk_rating,
    projection_confidence,
    ai_recommendation,
    ai_analysis,
    recommendation_why,
    recommendation_color,
    captain_score,
    captain_rating,
    neeko_rating,
    price,
    value_score,
    price_tier,
    -- Canonical percentile-rank value tier (replaces fixed-threshold logic)
    CASE
        WHEN value_score IS NULL THEN NULL
        WHEN value_percentile >= 0.90 THEN 'ELITE'::text
        WHEN value_percentile >= 0.70 THEN 'GOOD'::text
        WHEN value_percentile >= 0.40 THEN 'FAIR'::text
        ELSE 'POOR'::text
    END AS value_tier,
    CASE
        WHEN value_score IS NULL THEN NULL
        WHEN value_percentile >= 0.90 THEN 'ELITE VALUE'::text
        WHEN value_percentile >= 0.70 THEN 'GOOD VALUE'::text
        WHEN value_percentile >= 0.40 THEN 'FAIR VALUE'::text
        ELSE 'POOR VALUE'::text
    END AS value_tag,
    consistency_tier,
    data_updated_at
FROM with_percentile;


-- Step 2: Simplify get_rankings_free — remove internal tier computation, pass through from view
DROP FUNCTION IF EXISTS public.get_rankings_free(text, text, integer);

CREATE OR REPLACE FUNCTION public.get_rankings_free(
    position_filter text DEFAULT 'ALL',
    sort_key text DEFAULT 'neeko_rating',
    limit_n integer DEFAULT 200
)
RETURNS TABLE(
    player_id text,
    player_name text,
    team text,
    "position" text,
    projection_final numeric,
    ceiling_estimate numeric,
    floor_estimate numeric,
    consistency_score double precision,
    form_rating numeric,
    matchup_rating numeric,
    upside_rating numeric,
    risk_rating numeric,
    projection_confidence numeric,
    captain_score numeric,
    captain_rating text,
    neeko_rating numeric,
    price integer,
    value_score numeric,
    value_tag text,
    value_tier text,
    ai_recommendation text,
    ai_summary text,
    ai_updated_at timestamptz,
    recommendation_why text,
    recommendation_color text,
    consistency_tier text,
    total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH filtered AS (
        SELECT
            c.player_id::text,
            c.player_name,
            c.team,
            c.position,
            c.projection_final,
            c.ceiling_estimate,
            c.floor_estimate,
            c.consistency_score,
            c.form_rating,
            c.matchup_rating,
            c.upside_rating,
            c.risk_rating,
            c.projection_confidence,
            c.captain_score,
            c.captain_rating,
            c.neeko_rating,
            c.price,
            c.value_score,
            c.value_tag,
            c.value_tier,
            c.consistency_tier,
            c.ai_recommendation,
            c.ai_summary,
            c.ai_updated_at,
            c.recommendation_why,
            c.recommendation_color
        FROM public.v_rankings_canonical c
        WHERE
            position_filter IS NULL
            OR position_filter = 'ALL'
            OR c.position = position_filter
    ),
    sorted AS (
        SELECT *,
            ROW_NUMBER() OVER (
                ORDER BY
                    CASE WHEN sort_key = 'value'      THEN value_score     END DESC NULLS LAST,
                    CASE WHEN sort_key = 'projection' THEN projection_final END DESC NULLS LAST,
                    CASE WHEN sort_key NOT IN ('value','projection') THEN neeko_rating END DESC NULLS LAST
            ) AS rn
        FROM filtered
    ),
    counted AS (SELECT count(*)::bigint AS total_count FROM filtered)
    SELECT
        s.player_id,
        s.player_name,
        s.team,
        s.position,
        s.projection_final,
        s.ceiling_estimate,
        s.floor_estimate,
        s.consistency_score,
        s.form_rating,
        s.matchup_rating,
        s.upside_rating,
        s.risk_rating,
        s.projection_confidence,
        s.captain_score,
        s.captain_rating,
        s.neeko_rating,
        -- Freemium gate: rows > 5 get null for premium intel
        CASE WHEN s.rn <= 5 THEN s.price             ELSE NULL END AS price,
        CASE WHEN s.rn <= 5 THEN s.value_score        ELSE NULL END AS value_score,
        CASE WHEN s.rn <= 5 THEN s.value_tag          ELSE NULL END AS value_tag,
        CASE WHEN s.rn <= 5 THEN s.value_tier         ELSE NULL END AS value_tier,
        CASE WHEN s.rn <= 5 THEN s.ai_recommendation  ELSE NULL END AS ai_recommendation,
        CASE WHEN s.rn <= 5 THEN s.ai_summary         ELSE NULL END AS ai_summary,
        CASE WHEN s.rn <= 5 THEN s.ai_updated_at      ELSE NULL END AS ai_updated_at,
        CASE WHEN s.rn <= 5 THEN s.recommendation_why ELSE NULL END AS recommendation_why,
        CASE WHEN s.rn <= 5 THEN s.recommendation_color ELSE NULL END AS recommendation_color,
        s.consistency_tier,
        c.total_count
    FROM sorted s, counted c
    ORDER BY s.rn
    LIMIT limit_n;
END;
$$;


-- Step 3: Simplify get_rankings_premium — remove internal tier computation, pass through from view
DROP FUNCTION IF EXISTS public.get_rankings_premium(text, text, integer);

CREATE OR REPLACE FUNCTION public.get_rankings_premium(
    position_filter text DEFAULT 'ALL',
    sort_key text DEFAULT 'neeko_rating',
    limit_n integer DEFAULT 1000
)
RETURNS TABLE(
    player_id text,
    player_name text,
    team text,
    "position" text,
    projection_final numeric,
    ceiling_estimate numeric,
    floor_estimate numeric,
    consistency_score double precision,
    form_rating numeric,
    matchup_rating numeric,
    upside_rating numeric,
    risk_rating numeric,
    projection_confidence numeric,
    captain_score numeric,
    captain_rating text,
    neeko_rating numeric,
    price integer,
    value_score numeric,
    value_tag text,
    value_tier text,
    ai_recommendation text,
    ai_summary text,
    ai_updated_at timestamptz,
    recommendation_why text,
    recommendation_color text,
    consistency_tier text,
    total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH filtered AS (
        SELECT
            c.player_id::text,
            c.player_name,
            c.team,
            c.position,
            c.projection_final,
            c.ceiling_estimate,
            c.floor_estimate,
            c.consistency_score,
            c.form_rating,
            c.matchup_rating,
            c.upside_rating,
            c.risk_rating,
            c.projection_confidence,
            c.captain_score,
            c.captain_rating,
            c.neeko_rating,
            c.price,
            c.value_score,
            c.value_tag,
            c.value_tier,
            c.consistency_tier,
            c.ai_recommendation,
            c.ai_summary,
            c.ai_updated_at,
            c.recommendation_why,
            c.recommendation_color
        FROM public.v_rankings_canonical c
        WHERE
            position_filter IS NULL
            OR position_filter = 'ALL'
            OR c.position = position_filter
    ),
    counted AS (SELECT count(*)::bigint AS total_count FROM filtered)
    SELECT
        t.player_id,
        t.player_name,
        t.team,
        t.position,
        t.projection_final,
        t.ceiling_estimate,
        t.floor_estimate,
        t.consistency_score,
        t.form_rating,
        t.matchup_rating,
        t.upside_rating,
        t.risk_rating,
        t.projection_confidence,
        t.captain_score,
        t.captain_rating,
        t.neeko_rating,
        t.price,
        t.value_score,
        t.value_tag,
        t.value_tier,
        t.ai_recommendation,
        t.ai_summary,
        t.ai_updated_at,
        t.recommendation_why,
        t.recommendation_color,
        t.consistency_tier,
        c.total_count
    FROM filtered t, counted c
    ORDER BY
        CASE WHEN sort_key = 'value'      THEN t.value_score     END DESC NULLS LAST,
        CASE WHEN sort_key = 'projection' THEN t.projection_final END DESC NULLS LAST,
        CASE WHEN sort_key NOT IN ('value','projection') THEN t.neeko_rating END DESC NULLS LAST
    LIMIT limit_n;
END;
$$;
