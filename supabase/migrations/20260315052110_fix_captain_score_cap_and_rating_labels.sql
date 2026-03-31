/*
  # Fix Captain Score Cap and Rating Label Mismatch

  ## Problems Identified

  ### Bug 1 — Artificial LEAST(100) cap in populate_rankings_cache_from_source
  The function applied LEAST(100, GREATEST(0, COALESCE(met.captain_score, 0)))
  to the captain_score column. This hard-capped all scores at 100, causing 28
  players to show the same max value with no differentiation at the elite end.
  The source view afl.v_ai_player_metrics correctly produces scores up to ~121,
  so the cap was destroying the signal entirely.

  ### Bug 2 — captain_rating label mismatch (DB vs frontend)
  The cache stored captain_rating as "Elite" and "Strong" (short form).
  The frontend KPI tile (computeKpiTiles) filters for "Elite Captain" and
  "Strong Captain" (long form). Zero rows matched, so captainAvgProj was
  always null and the "Top Captain Avg" card displayed "—".

  ### Bug 3 — captain_rating thresholds too loose
  With scores capped at 100, the threshold WHEN >= 70 THEN 'Elite' meant
  453 of 736 players (61%) were "Elite". With the cap removed and scores
  now reaching ~121, we can use percentile-based thresholds:
    Elite Captain:   captain_score >= 90  (top ~15%)
    Strong Captain:  captain_score >= 75  (next ~30%)
    Captain Option:  captain_score >= 60  (next ~30%)
    Avoid:           captain_score < 60   (bottom ~25%)

  ## Fix
  Rebuilds populate_rankings_cache_from_source to:
  1. Remove LEAST(100, ...) cap — pass raw captain_score from v_ai_player_metrics
  2. Fix captain_rating labels to match frontend expectations
  3. Recalibrate thresholds to produce a meaningful distribution
*/

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $function$
DECLARE
v_count integer;
BEGIN
SET LOCAL statement_timeout = '120s';

TRUNCATE TABLE afl.player_rankings_cache;

INSERT INTO afl.player_rankings_cache (
player_id, player_name, team, team_name, position, position_group,
projection_final, projection, ceiling, floor, consistency, form_score,
neeko_rating, price, value_score, value_tag, value_tier,
projection_confidence, risk_rating, matchup_rating, upside_rating,
captain_score, captain_rating,
ai_recommendation, recommendation_color, recommendation_short, recommendation_why,
ai_summary, ai_updated_at,
consistency_tier, total_count, cached_at, created_at
)
SELECT
nr.player_id,
nr.player_name,
nr.team_name,
nr.team_name,
nr.position_group,
nr.position_group,
nr.projection::numeric,
nr.projection::numeric,
nr.ceiling::double precision,
nr.floor::double precision,
nr.consistency::double precision,
nr.form_score::double precision,
nr.neeko_rating::double precision,
nr.price::integer,
nr.value_score::double precision,
NULL::text,
CASE
  WHEN nr.price IS NULL OR nr.price = 0 THEN NULL
  WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 110 THEN 'ELITE VALUE'
  WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 100 THEN 'STRONG VALUE'
  WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 95  THEN 'FAIR VALUE'
  ELSE 'OVERPRICED'
END,
LEAST(100, GREATEST(0, COALESCE(met.start_confidence, 0)))::double precision,
LEAST(100, GREATEST(0, COALESCE(met.bust_risk, 0) * 100))::double precision,
COALESCE(met.matchup_rating, 'Neutral'),
LEAST(100, GREATEST(0, COALESCE(met.breakout_probability, 0) * 100))::double precision,

-- captain_score: NO cap — pass raw value from v_ai_player_metrics
-- v_captain_scores formula: projection * 0.45 + ceiling * 0.35 + consistency * 0.20
-- Realistic range: ~21 to ~135; scores above 100 are valid elite signals
GREATEST(0, COALESCE(met.captain_score, 0))::double precision,

-- captain_rating: use full label strings matching frontend expectations
-- Thresholds calibrated against uncapped score distribution (avg ~76, max ~121)
CASE
  WHEN COALESCE(met.captain_score, 0) >= 90 THEN 'Elite Captain'
  WHEN COALESCE(met.captain_score, 0) >= 75 THEN 'Strong Captain'
  WHEN COALESCE(met.captain_score, 0) >= 60 THEN 'Captain Option'
  ELSE 'Avoid'
END,

COALESCE(reco.recommendation_label, aic.recommendation),
COALESCE(reco.recommendation_color, CASE
  WHEN aic.recommendation = 'BUY'   THEN 'green'
  WHEN aic.recommendation = 'START' THEN 'teal'
  WHEN aic.recommendation = 'SELL'  THEN 'red'
  WHEN aic.recommendation = 'SIT'   THEN 'yellow'
  ELSE 'grey'
END),
COALESCE(reco.recommendation_short, aic.why),
COALESCE(reco.recommendation_short, aic.why),
aic.summary,
aic.generated_at,
CASE
  WHEN nr.consistency >= 75 THEN 'Elite'
  WHEN nr.consistency >= 60 THEN 'Consistent'
  WHEN nr.consistency >= 40 THEN 'Volatile'
  ELSE 'Boom-Bust'
END,
0,
now(),
now()
FROM afl.v_neeko_rating nr
LEFT JOIN afl.v_ai_player_metrics         met  ON met.player_id  = nr.player_id
LEFT JOIN public.ai_player_content        aic  ON aic.player_id  = nr.player_id
LEFT JOIN public.ai_rankings_player_recos reco ON reco.player_id = nr.player_id;

SELECT COUNT(*) INTO v_count FROM afl.player_rankings_cache;
UPDATE afl.player_rankings_cache SET total_count = v_count;
RETURN v_count;
END;
$function$;
