
/*
  # Fix refresh_player_rankings_cache — deduplicate by player_id

  ## Summary
  Adds a deduplication CTE at the start of the cache refresh function to ensure
  each player_id appears only once. Some players share the same name (legitimate
  roster entries with different player_ids), while others may appear via multiple
  game assignments. The DISTINCT ON (player_id) ORDER BY neeko_rating DESC keeps
  the best-ranked row for each player.

  ## Changes
  - Wraps active_base in a dedup CTE using DISTINCT ON (player_id)
  - No column changes, no table changes, no RLS changes
*/

CREATE OR REPLACE FUNCTION afl.refresh_player_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN

TRUNCATE afl.player_rankings_cache;

INSERT INTO afl.player_rankings_cache (
  player_id, player_name, team, team_name, position, position_group,
  price, neeko_rating, projection_final, projection,
  ceiling, floor, consistency, form_score,
  projection_confidence, risk_rating, matchup_rating, upside_rating,
  captain_score, captain_rating,
  value_score, value_tag, value_tier,
  ai_recommendation, recommendation_color,
  recommendation_short, recommendation_why,
  ai_summary, ai_updated_at,
  consistency_tier, total_count, cached_at
)
WITH deduped_base AS (
  -- Deduplicate: one row per player_id, keep highest neeko_rating
  SELECT DISTINCT ON (rf.player_id)
    rf.*
  FROM afl.v_player_rankings_full rf
  JOIN afl.players p ON p.player_id = rf.player_id
  WHERE p.is_active = true
  ORDER BY rf.player_id, rf.neeko_rating DESC NULLS LAST
),
raw_metrics AS (
  SELECT
    m.player_id,
    m.start_confidence   AS raw_start_confidence,
    m.bust_risk          AS raw_bust_risk,
    m.captain_score      AS raw_captain_score
  FROM afl.v_ai_player_metrics m
),
base AS (
  SELECT
    ab.player_id,
    ab.player_name,
    ab.team_name,
    ab.position_group,
    ab.neeko_rating,
    ab.projection_final,
    ab.ceiling,
    ab.floor,
    ab.consistency_score       AS consistency,
    ab.form_rating             AS form_score,
    ab.matchup_rating,
    ab.upside_rating,
    ab.price,
    ab.value_score,
    ab.value_tag,
    ab.value_tier,
    ab.consistency_tier,
    COALESCE(rm.raw_start_confidence, 0) AS raw_start_confidence,
    COALESCE(rm.raw_bust_risk, 0)        AS raw_bust_risk,
    COALESCE(rm.raw_captain_score, 0)    AS raw_captain_score
  FROM deduped_base ab
  LEFT JOIN raw_metrics rm ON rm.player_id = ab.player_id
),
conf_ranked AS (
  SELECT player_id,
    ROUND(
      45.0 + (NTILE(100) OVER (ORDER BY raw_start_confidence NULLS FIRST) - 1) * (54.0 / 99.0),
      1
    ) AS projection_confidence_norm
  FROM base
),
risk_ranked AS (
  SELECT player_id,
    ROUND(
      (NTILE(100) OVER (ORDER BY raw_bust_risk NULLS LAST) - 1) * (100.0 / 99.0),
      1
    ) AS risk_rating_norm
  FROM base
),
combined AS (
  SELECT b.*, cr.projection_confidence_norm, rr.risk_rating_norm
  FROM base b
  JOIN conf_ranked cr ON cr.player_id = b.player_id
  JOIN risk_ranked rr ON rr.player_id = b.player_id
),
with_recs AS (
  SELECT
    b.*,
    LEAST(100, GREATEST(0, (b.raw_captain_score - 60.0) / 70.0 * 100.0)) AS captain_score_norm,
    CASE
      WHEN LEAST(100, GREATEST(0, (b.raw_captain_score - 60.0) / 70.0 * 100.0)) >= 75 THEN 'Elite Captain'
      WHEN LEAST(100, GREATEST(0, (b.raw_captain_score - 60.0) / 70.0 * 100.0)) >= 55 THEN 'Strong Captain'
      WHEN LEAST(100, GREATEST(0, (b.raw_captain_score - 60.0) / 70.0 * 100.0)) >= 35 THEN 'Captain Option'
      ELSE 'Avoid'
    END AS captain_rating_label,
    CASE
      -- BUY: strong value + solid projection + manageable risk + high confidence
      WHEN b.value_score >= 11.0
        AND b.projection_final >= 75
        AND b.risk_rating_norm <= 60
        AND b.projection_confidence_norm >= 70
        THEN 'BUY'
      -- START: good value + solid projection + decent confidence
      WHEN b.value_score >= 10.5
        AND b.projection_final >= 75
        AND b.projection_confidence_norm >= 65
        THEN 'START'
      -- SELL: expensive overpriced player with poor value and low projection
      WHEN b.value_score IS NOT NULL
        AND b.value_score <= 8.5
        AND b.projection_final < 55
        AND COALESCE(b.price, 0) > 700000
        THEN 'SELL'
      -- SIT: very low confidence alone, OR high risk alone, OR moderate confidence + elevated risk
      WHEN b.projection_confidence_norm < 55
        THEN 'SIT'
      WHEN b.risk_rating_norm >= 75
        THEN 'SIT'
      WHEN b.projection_confidence_norm < 63 AND b.risk_rating_norm >= 55
        THEN 'SIT'
      -- No price data — fallback on projection
      WHEN b.value_score IS NULL THEN
        CASE
          WHEN b.projection_final >= 85 AND b.risk_rating_norm <= 35 THEN 'START'
          WHEN b.risk_rating_norm >= 75 THEN 'SIT'
          ELSE 'HOLD'
        END
      ELSE 'HOLD'
    END AS ai_recommendation_label
  FROM combined b
),
total AS (SELECT COUNT(*) AS cnt FROM with_recs)
SELECT
  b.player_id,
  b.player_name,
  b.team_name                         AS team,
  b.team_name,
  b.position_group                    AS position,
  b.position_group,
  b.price,
  b.neeko_rating,
  b.projection_final,
  b.projection_final                  AS projection,
  b.ceiling,
  b.floor,
  b.consistency,
  b.form_score,
  b.projection_confidence_norm        AS projection_confidence,
  b.risk_rating_norm                  AS risk_rating,
  b.matchup_rating::text              AS matchup_rating,
  b.upside_rating,
  b.captain_score_norm                AS captain_score,
  b.captain_rating_label              AS captain_rating,
  b.value_score,
  b.value_tag,
  b.value_tier,
  b.ai_recommendation_label           AS ai_recommendation,
  CASE b.ai_recommendation_label
    WHEN 'BUY'   THEN 'green'
    WHEN 'START' THEN 'teal'
    WHEN 'HOLD'  THEN 'slate'
    WHEN 'SIT'   THEN 'amber'
    WHEN 'SELL'  THEN 'red'
    ELSE 'grey'
  END                                 AS recommendation_color,
  ar.recommendation_short,
  ar.recommendation_long              AS recommendation_why,
  apa.analysis                        AS ai_summary,
  apa.generated_at                    AS ai_updated_at,
  b.consistency_tier,
  t.cnt::integer                      AS total_count,
  NOW()                               AS cached_at
FROM with_recs b
CROSS JOIN total t
LEFT JOIN public.ai_rankings_player_recos ar ON ar.player_id = b.player_id
LEFT JOIN public.ai_player_analysis apa ON apa.player_id = b.player_id;

END;
$function$;
