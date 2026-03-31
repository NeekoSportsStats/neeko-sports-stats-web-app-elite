/*
  # Fix AI input hash to include all key projection fields

  ## Problem
  The input_hash in ai.player_prompt_inputs did not include projection_final, 
  value_score, matchup_rating, confidence, or risk. This meant AI would not 
  regenerate even when projections changed.

  ## Fix
  Create/replace the function that populates ai.player_prompt_inputs with a 
  proper input_hash that covers all fields that should trigger regeneration:
  - projection (projection_final)
  - value_score
  - matchup_rating
  - confidence
  - risk

  ## Also fixes
  - matchup_rating and value_score were NULL in ai.player_prompt_inputs
  - Now sourced correctly from mv_player_rankings
*/

CREATE OR REPLACE FUNCTION public.refresh_ai_player_analysis_input_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'ai'
AS $function$
BEGIN
  -- Rebuild ai.player_prompt_inputs from mv_player_rankings
  -- This is the source of truth for AI generation inputs
  DELETE FROM ai.player_prompt_inputs;

  INSERT INTO ai.player_prompt_inputs (
    player_id,
    player_name,
    team_name,
    position,
    price,
    projection,
    ceiling,
    floor,
    risk,
    confidence,
    consistency,
    value_score,
    matchup_rating,
    venue_multiplier,
    rest_days,
    form_score,
    form_momentum,
    neeko_rating,
    input_hash,
    created_at
  )
  SELECT
    nr.player_id,
    nr.player_name,
    nr.team_name,
    nr.position_group                                              AS position,
    COALESCE(pp.price, nr.price)                                  AS price,
    nr.projection,
    nr.ceiling::integer,
    nr.floor,
    nr.risk,
    LEAST(100, GREATEST(0, COALESCE(nr.confidence, 50)))          AS confidence,
    COALESCE(nr.consistency, 50)                                   AS consistency,
    COALESCE(nr.value_score, 50)                                   AS value_score,
    -- matchup_rating as numeric multiplier (raw, for AI context)
    COALESCE(nr.matchup_rating, 1.0)                              AS matchup_rating,
    COALESCE(nr.venue_multiplier, 1.0)                            AS venue_multiplier,
    nr.rest_days,
    nr.form_score,
    nr.form_momentum,
    nr.neeko_rating,
    -- input_hash must cover ALL fields that should trigger AI regeneration
    md5(
      COALESCE(nr.projection::text, '')          || '|' ||
      COALESCE(nr.value_score::text, '')          || '|' ||
      COALESCE(nr.matchup_rating::text, '')       || '|' ||
      COALESCE(nr.confidence::text, '')           || '|' ||
      COALESCE(nr.risk, '')                       || '|' ||
      COALESCE(nr.consistency::text, '')          || '|' ||
      COALESCE(pp.price::text, nr.price::text, '')
    )                                                              AS input_hash,
    now()                                                          AS created_at
  FROM afl.mv_player_rankings nr
  LEFT JOIN afl.player_prices pp ON pp.player_id = nr.player_id;
END;
$function$;
