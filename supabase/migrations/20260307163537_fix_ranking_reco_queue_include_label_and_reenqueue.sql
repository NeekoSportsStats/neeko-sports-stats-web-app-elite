/*
  # Fix ranking reco queue — include recommendation_label in payload & re-enqueue

  ## Problem
  The {LABEL} placeholder in the v9 prompt template was never being filled because:
  1. `v_ai_rankings_generation_queue.openai_input_json` did not include ai_recommendation
  2. `enqueue_ranking_reco_jobs` did not inject recommendation_label into the payload root
  3. The worker's injectPayload only replaced {DATA}, not {LABEL}

  ## Fix
  1. Rebuild `v_ai_rankings_generation_queue` to include `ai_recommendation` in openai_input_json
  2. Rebuild `enqueue_ranking_reco_jobs` to inject `recommendation_label` at payload root
  3. Clear current pending queue (stale — built without the label)
  4. Re-enqueue all jobs fresh with the corrected payload shape

  ## Payload shape after fix
  {
    player_id, player_name, team, position, input_hash,
    recommendation_label: "MUST START",          ← new: for {LABEL} replacement
    data: {
      ...,
      ai_recommendation: "MUST START",           ← new: included in {DATA} block
      value_score: 104.2,
      value_tag: "FAIR VALUE",
      ...
    }
  }
*/

CREATE OR REPLACE VIEW public.v_ai_rankings_generation_queue AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.position,
  jsonb_build_object(
    'player_name',          c.player_name,
    'team',                 c.team,
    'position',             c.position,
    'projection_final',     c.projection_final,
    'ceiling_estimate',     c.ceiling_estimate,
    'floor_estimate',       c.floor_estimate,
    'consistency_score',    c.consistency_score,
    'form_rating',          c.form_rating,
    'matchup_rating',       c.matchup_rating,
    'upside_rating',        c.upside_rating,
    'risk_rating',          c.risk_rating,
    'projection_confidence',c.projection_confidence,
    'captain_score',        c.captain_score,
    'captain_rating',       c.captain_rating,
    'neeko_rating',         c.neeko_rating,
    'price',                c.price,
    'value_score',          c.value_score,
    'value_tag',            c.value_tag,
    'consistency_tier',     c.consistency_tier,
    'ai_recommendation',    c.ai_recommendation
  ) AS openai_input_json,
  md5(
    COALESCE(c.player_id::text, '') ||
    COALESCE(c.price::text, '') ||
    COALESCE(c.projection_final::text, '') ||
    COALESCE(c.neeko_rating::text, '') ||
    COALESCE(c.value_score::text, '')
  ) AS current_input_hash,
  r.input_hash       AS stored_input_hash,
  r.updated_at       AS ai_last_generated,
  stat_freshness.latest_stat_update
FROM public.v_rankings_canonical c
LEFT JOIN public.ai_rankings_player_recos r
  ON r.player_id = c.player_id AND r.season = 2026
LEFT JOIN (
  SELECT p.player_id, MAX(s.updated_at) AS latest_stat_update
  FROM afl.players p
  JOIN afl.player_round_stats_2025 s ON s.player = p.player_name
  GROUP BY p.player_id
) stat_freshness ON stat_freshness.player_id = c.player_id
WHERE
  r.updated_at IS NULL
  OR r.input_hash IS NULL
  OR stat_freshness.latest_stat_update > r.updated_at
  OR md5(
      COALESCE(c.player_id::text, '') ||
      COALESCE(c.price::text, '') ||
      COALESCE(c.projection_final::text, '') ||
      COALESCE(c.neeko_rating::text, '') ||
      COALESCE(c.value_score::text, '')
    ) IS DISTINCT FROM r.input_hash
ORDER BY stat_freshness.latest_stat_update DESC NULLS LAST;

CREATE OR REPLACE FUNCTION public.enqueue_ranking_reco_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.ai_generation_queue (
    job_type,
    entity_type,
    entity_id,
    prompt_key,
    payload
  )
  SELECT
    'ranking_recommendation',
    'player',
    q.player_id::text,
    'player_ranking_recommendation',
    jsonb_build_object(
      'player_id',            q.player_id,
      'player_name',          q.player_name,
      'team',                 q.team,
      'position',             q.position,
      'input_hash',           q.current_input_hash,
      'recommendation_label', COALESCE(q.openai_input_json->>'ai_recommendation', 'HOLD'),
      'data',                 COALESCE(q.openai_input_json, '{}'::jsonb)
    )
  FROM public.v_ai_rankings_generation_queue q
  WHERE (
    q.stored_input_hash IS DISTINCT FROM q.current_input_hash
    OR NOT EXISTS (
      SELECT 1
      FROM public.ai_rankings_player_recos r
      WHERE r.player_id = q.player_id
        AND r.season = 2026
        AND r.recommendation_long IS NOT NULL
        AND r.recommendation_long != 'Model analysis is currently generating.'
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.ai_generation_queue existing
    WHERE existing.entity_id = q.player_id::text
      AND existing.job_type  = 'ranking_recommendation'
      AND existing.status    IN ('pending', 'processing')
  );
END;
$$;

DELETE FROM public.ai_generation_queue
WHERE job_type = 'ranking_recommendation'
  AND status = 'pending';

SELECT enqueue_ranking_reco_jobs();
