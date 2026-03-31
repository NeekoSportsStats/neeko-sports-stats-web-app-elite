/*
  # Rankings Cache Calibration — Full Fix v2

  ## Summary
  Fixes 5 root-cause issues in the player_rankings_cache refresh pipeline:

  ## 1. Active player filter
  The v_projection_engine sources from afl.players without filtering is_active.
  76 inactive/retired players were appearing in rankings.
  Fix: Add JOIN to afl.v_active_players in refresh function.

  ## 2. Confidence scale fix
  start_confidence formula = projection * 0.60 + matchup * 25 + pace * 15
  For top projectors (120pts) this produces 127+ — exceeds 100.
  Current cache clamp LEAST(100, start_confidence) flattens everything at 100.
  Fix: Normalise to 0–100 using percentile rank approach via NTILE bucketing,
  then rescale to 45–99 range to produce a useful spread.

  ## 3. Risk rating fix (bust_risk)
  bust_risk is a z-score (-9.53 to +11.94), NOT a 0–1 probability.
  Cache was computing bust_risk * 100, producing -950 to +1190, then clamped
  to 0–100. Result: bimodal split — 322 players at 0.0, 350 at 100.0.
  Fix: Normalise bust_risk using NTILE(100) percentile rank to produce
  a smooth 0–100 risk scale where higher = riskier.

  ## 4. AI recommendation — derive from metrics
  All 716 rows had recommendation_label = 'HOLD' from stale AI runs.
  The prompt uses value_score thresholds (>=10 = BUY) that match the
  actual cache scale (projection/price*100k, range 1.5–35.9).
  Fix: Derive recommendation_label directly from metrics in the cache refresh
  using consistent rules, eliminating dependence on stale AI reco table.

  ## 5. Captain rating labels
  Cache was assigning captain labels using raw captain_score (0–125 range),
  but thresholds were written for 0–100 scale. Fix thresholds.

  ## Objects modified:
  - afl.refresh_player_rankings_cache() — full rebuild with all fixes applied
*/

CREATE OR REPLACE FUNCTION afl.refresh_player_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  v_total_count integer;
BEGIN

  -- Count only ACTIVE players
  SELECT COUNT(DISTINCT nr.player_id)
  INTO v_total_count
  FROM afl.v_neeko_rating nr
  JOIN afl.players p ON nr.player_id = p.player_id
  WHERE p.is_active = true;

  TRUNCATE TABLE afl.player_rankings_cache;

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, position, team_name, position_group,
    neeko_rating, projection_final, projection, ceiling, floor,
    consistency, form_score, price, value_score,
    projection_confidence, risk_rating, matchup_rating, upside_rating,
    captain_score, captain_rating, ai_recommendation, recommendation_why,
    recommendation_short, recommendation_color, ai_summary, ai_updated_at,
    value_tag, value_tier, consistency_tier, total_count, cached_at
  )
  WITH

  -- ── Step 1: Only active players ─────────────────────────────────────────────
  active_nr AS (
    SELECT nr.*
    FROM afl.v_neeko_rating nr
    JOIN afl.players p ON nr.player_id = p.player_id
    WHERE p.is_active = true
  ),

  -- ── Step 2: Raw metrics joined ───────────────────────────────────────────────
  base AS (
    SELECT
      nr.player_id,
      nr.player_name,
      nr.team_name,
      nr.position_group,
      nr.neeko_rating,
      nr.projection,
      nr.ceiling,
      nr.floor,
      nr.consistency,
      nr.form_score,
      nr.price,
      nr.value_score,
      -- Raw met values (may be out-of-range)
      met.start_confidence        AS raw_start_confidence,
      met.bust_risk               AS raw_bust_risk,
      met.breakout_probability    AS raw_breakout,
      met.captain_score           AS raw_captain_score,
      met.matchup_rating
    FROM active_nr nr
    LEFT JOIN afl.v_ai_player_metrics met ON nr.player_id = met.player_id
  ),

  -- ── Step 3: Normalise confidence using NTILE percentile rank ────────────────
  -- start_confidence ranges 43–127; we use NTILE to get a clean 45–99 spread
  conf_ranked AS (
    SELECT
      player_id,
      raw_start_confidence,
      -- NTILE(100) gives 1–100 percentile bucket, then rescale to 45–99
      ROUND(
        45.0 + (
          NTILE(100) OVER (ORDER BY raw_start_confidence NULLS FIRST) - 1
        ) * (54.0 / 99.0),
        1
      ) AS projection_confidence_norm
    FROM base
  ),

  -- ── Step 4: Normalise bust_risk using NTILE percentile rank ─────────────────
  -- bust_risk is a z-score (-9.53 to +11.94); higher = riskier
  -- NTILE(100) maps to 0–100 risk scale
  risk_ranked AS (
    SELECT
      player_id,
      raw_bust_risk,
      ROUND(
        (NTILE(100) OVER (ORDER BY raw_bust_risk NULLS LAST) - 1) * (100.0 / 99.0),
        1
      ) AS risk_rating_norm
    FROM base
  ),

  -- ── Step 5: Most recent AI reco per player ──────────────────────────────────
  reco AS (
    SELECT DISTINCT ON (player_id)
      player_id,
      recommendation_label,
      recommendation_short,
      recommendation_long,
      recommendation_color,
      updated_at
    FROM public.ai_rankings_player_recos
    ORDER BY player_id, updated_at DESC NULLS LAST
  ),

  -- ── Step 6: Most recent AI analysis per player ──────────────────────────────
  ai_data AS (
    SELECT DISTINCT ON (player_id)
      player_id, analysis, captain_recommendation, generated_at
    FROM public.ai_player_analysis
    ORDER BY player_id, generated_at DESC NULLS LAST
  ),

  -- ── Step 7: Value tag source ─────────────────────────────────────────────────
  vtag AS (
    SELECT player_id, value_tag
    FROM afl.v_ai_player_analysis_input
  )

  SELECT
    b.player_id,
    b.player_name,
    b.team_name                                                       AS team,
    b.position_group                                                  AS position,
    b.team_name                                                       AS team_name,
    b.position_group                                                  AS position_group,
    ROUND(b.neeko_rating::numeric, 2)                                 AS neeko_rating,
    ROUND(b.projection::numeric, 2)                                   AS projection_final,
    ROUND(b.projection::numeric, 2)                                   AS projection,
    b.ceiling::double precision                                       AS ceiling,
    ROUND(b.floor::numeric, 2)::double precision                     AS floor,
    ROUND(b.consistency::numeric, 2)::double precision               AS consistency,
    ROUND(b.form_score::numeric, 2)::double precision                AS form_score,
    b.price,
    ROUND(b.value_score::numeric, 2)::double precision               AS value_score,

    -- Normalised confidence (45–99 spread, percentile-ranked)
    cr.projection_confidence_norm::double precision                   AS projection_confidence,

    -- Normalised risk (0–100 spread, percentile-ranked from bust_risk z-score)
    rr.risk_rating_norm::double precision                             AS risk_rating,

    COALESCE(b.matchup_rating, 'Neutral')                             AS matchup_rating,

    -- Breakout probability normalised 0–100
    ROUND(
      LEAST(100, GREATEST(0, COALESCE(b.raw_breakout, 0) * 100))::numeric, 1
    )::double precision                                               AS upside_rating,

    -- Captain score: raw is on 60–130 range; normalise to 0–100
    ROUND(
      LEAST(100, GREATEST(0,
        (COALESCE(b.raw_captain_score, 0) - 60.0) / 70.0 * 100.0
      ))::numeric, 1
    )::double precision                                               AS captain_score,

    -- Captain rating using normalised 0–100 captain score
    CASE
      WHEN (COALESCE(b.raw_captain_score, 0) - 60.0) / 70.0 * 100.0 >= 70 THEN 'Elite Captain'
      WHEN (COALESCE(b.raw_captain_score, 0) - 60.0) / 70.0 * 100.0 >= 50 THEN 'Strong Captain'
      WHEN (COALESCE(b.raw_captain_score, 0) - 60.0) / 70.0 * 100.0 >= 30 THEN 'Captain Option'
      ELSE 'Avoid'
    END                                                               AS captain_rating,

    -- ── AI recommendation: derived from real metrics, not stale AI table ──────
    -- Uses value_score (actual scale: projection/price*100k, range ~1.5–36)
    -- Combined with matchup and risk for fuller signal
    CASE
      WHEN b.value_score IS NULL THEN
        CASE
          WHEN b.projection >= 100 AND rr.risk_rating_norm <= 35 THEN 'START'
          WHEN b.projection >= 85  AND rr.risk_rating_norm <= 50 THEN 'START'
          WHEN rr.risk_rating_norm >= 75                          THEN 'SIT'
          ELSE 'HOLD'
        END
      -- Elite value + strong projection → BUY
      WHEN b.value_score >= 12.0
        AND b.projection >= 80
        AND rr.risk_rating_norm <= 60
      THEN 'BUY'
      -- Good value + decent projection → START
      WHEN b.value_score >= 10.0
        AND b.projection >= 70
        AND rr.risk_rating_norm <= 65
      THEN 'START'
      -- Poor value overpriced → consider selling
      WHEN b.value_score < 7.0
        AND b.price > 500000
        AND rr.risk_rating_norm >= 55
      THEN 'SELL'
      -- High risk regardless → SIT
      WHEN rr.risk_rating_norm >= 80
        AND b.projection < 85
      THEN 'SIT'
      -- Reasonable hold zone
      ELSE 'HOLD'
    END                                                               AS ai_recommendation,

    reco.recommendation_long                                          AS recommendation_why,

    -- recommendation_short: use stored if fresh, else first sentence of long
    CASE
      WHEN reco.recommendation_short IS NOT NULL AND reco.recommendation_short != ''
        THEN reco.recommendation_short
      WHEN reco.recommendation_long IS NOT NULL
        THEN CASE
          WHEN POSITION('.' IN reco.recommendation_long) > 0
            THEN TRIM(SUBSTRING(reco.recommendation_long FROM 1 FOR POSITION('.' IN reco.recommendation_long)))
          ELSE LEFT(reco.recommendation_long, 120)
        END
      ELSE NULL
    END                                                               AS recommendation_short,

    -- recommendation_color derived from the new derived label
    CASE
      WHEN b.value_score IS NULL THEN
        CASE
          WHEN b.projection >= 100 AND rr.risk_rating_norm <= 35 THEN 'teal'
          WHEN b.projection >= 85  AND rr.risk_rating_norm <= 50 THEN 'teal'
          WHEN rr.risk_rating_norm >= 75                          THEN 'amber'
          ELSE 'slate'
        END
      WHEN b.value_score >= 12.0 AND b.projection >= 80 AND rr.risk_rating_norm <= 60 THEN 'green'
      WHEN b.value_score >= 10.0 AND b.projection >= 70 AND rr.risk_rating_norm <= 65 THEN 'teal'
      WHEN b.value_score < 7.0   AND b.price > 500000  AND rr.risk_rating_norm >= 55  THEN 'red'
      WHEN rr.risk_rating_norm >= 80 AND b.projection < 85                             THEN 'amber'
      ELSE 'slate'
    END                                                               AS recommendation_color,

    ai_data.analysis                                                  AS ai_summary,
    COALESCE(ai_data.generated_at, reco.updated_at)                  AS ai_updated_at,

    vtag.value_tag                                                    AS value_tag,

    CASE
      WHEN b.price IS NULL OR b.price = 0 THEN NULL
      WHEN (b.projection / (b.price::numeric / 100000.0) * 10.0) >= 110 THEN 'ELITE VALUE'
      WHEN (b.projection / (b.price::numeric / 100000.0) * 10.0) >= 100 THEN 'STRONG VALUE'
      WHEN (b.projection / (b.price::numeric / 100000.0) * 10.0) >= 95  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END                                                               AS value_tier,

    CASE
      WHEN b.consistency >= 75 THEN 'Elite'
      WHEN b.consistency >= 60 THEN 'Consistent'
      WHEN b.consistency >= 40 THEN 'Volatile'
      ELSE 'Boom-Bust'
    END                                                               AS consistency_tier,

    v_total_count                                                     AS total_count,
    now()                                                             AS cached_at

  FROM base b
  LEFT JOIN conf_ranked  cr ON b.player_id = cr.player_id
  LEFT JOIN risk_ranked  rr ON b.player_id = rr.player_id
  LEFT JOIN reco            ON b.player_id = reco.player_id::int
  LEFT JOIN ai_data         ON b.player_id = ai_data.player_id::int
  LEFT JOIN vtag            ON b.player_id = vtag.player_id;

END;
$$;
