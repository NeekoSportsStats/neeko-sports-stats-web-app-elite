/*
  # Fast Rankings Views Rebuild + Indexes

  ## Summary
  Drops and recreates public.v_rankings_master and public.v_rankings_free to read
  ONLY from afl.player_rankings_cache (no join to mv_player_rankings).
  This eliminates the sequential scan that caused 3-5s page load times.

  ## Changes
  1. DROP and recreate v_rankings_master — cache-only, no mv join
  2. DROP and recreate v_rankings_free — cache-only, free-tier columns
  3. Add indexes for neeko_rating and best_value_score sort columns
  4. Grant anon/authenticated access to cache table and views
  5. Schedule 5-minute cron refresh of the cache
*/

-- ─── 1. Rebuild v_rankings_master ────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_rankings_master CASCADE;

CREATE VIEW public.v_rankings_master AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.team                  AS team_name,
  c.position,
  c.position              AS position_group,
  c.projection_final,
  c.projection_final      AS projection,
  c.ceiling_estimate      AS ceiling,
  c.floor_estimate        AS floor,
  c.ceiling_estimate,
  c.floor_estimate,
  c.consistency           AS consistency_score,
  c.consistency,
  c.form_score,
  c.form_score            AS form_rating,
  c.neeko_rating,
  c.price,
  c.value_score,
  c.best_value_score,
  c.value_tag,
  c.value_tier,
  c.value_tag             AS signal,
  c.ai_summary            AS summary,
  c.recommendation_why    AS analysis,
  c.projection_confidence,
  c.risk_rating,
  c.matchup_rating,
  c.upside_rating,
  c.captain_score,
  c.captain_rating,
  c.ai_recommendation,
  c.recommendation_color,
  c.recommendation_short,
  c.recommendation_why,
  c.ai_summary,
  c.recommendation_short  AS ai_summary_short,
  c.ai_summary            AS ai_summary_long,
  c.ai_updated_at,
  c.ai_updated_at         AS ai_generated_at,
  c.consistency_tier,
  c.total_count,
  c.cached_at,
  NULL::text              AS venue,
  NULL::text              AS opponent_name,
  NULL::boolean           AS is_home,
  NULL::double precision  AS season_avg,
  NULL::double precision  AS last3_avg,
  NULL::double precision  AS last5_avg,
  NULL::integer           AS games_played
FROM afl.player_rankings_cache c
ORDER BY c.neeko_rating DESC NULLS LAST;

GRANT SELECT ON public.v_rankings_master TO anon, authenticated;

-- ─── 2. Rebuild v_rankings_free ──────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_rankings_free CASCADE;

CREATE VIEW public.v_rankings_free AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.team                  AS team_name,
  c.position,
  c.position              AS position_group,
  c.projection_final,
  c.ceiling_estimate      AS ceiling,
  c.floor_estimate        AS floor,
  c.ceiling_estimate,
  c.floor_estimate,
  c.consistency           AS consistency_score,
  c.form_score            AS form_rating,
  c.neeko_rating,
  c.price,
  c.value_score,
  c.best_value_score,
  c.value_tag,
  c.value_tier,
  c.value_tag             AS signal,
  c.ai_summary            AS summary,
  c.recommendation_why    AS analysis,
  c.projection_confidence,
  c.risk_rating,
  c.matchup_rating,
  c.upside_rating,
  c.captain_score,
  c.captain_rating,
  c.consistency_tier,
  c.total_count,
  c.cached_at,
  NULL::integer           AS games_played
FROM afl.player_rankings_cache c
ORDER BY c.neeko_rating DESC NULLS LAST;

GRANT SELECT ON public.v_rankings_free TO anon, authenticated;

-- ─── 3. Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rankings_cache_neeko_rating
  ON afl.player_rankings_cache (neeko_rating DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_rankings_cache_best_value
  ON afl.player_rankings_cache (best_value_score DESC NULLS LAST);

-- ─── 4. Grant direct table access ────────────────────────────────────────────────
GRANT SELECT ON afl.player_rankings_cache TO anon, authenticated;

-- ─── 5. 5-minute cron refresh ────────────────────────────────────────────────────
SELECT cron.unschedule('rankings-cache-refresh-5min')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'rankings-cache-refresh-5min'
);

SELECT cron.schedule(
  'rankings-cache-refresh-5min',
  '*/5 * * * *',
  $$SELECT afl.populate_rankings_cache_from_source();$$
);
