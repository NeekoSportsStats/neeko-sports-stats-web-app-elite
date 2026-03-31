/*
  # Create v_neeko_intel_master

  Single source of truth for Neeko Intel page.
  Adds computed numeric aliases and mutually-exclusive category flags
  on top of v_rankings_master so the frontend can filter without
  duplicating business logic.

  ## Category Flags (boolean)
  - is_captain   : high captain_score + high confidence
  - is_breakout  : elevated upside, mid-range confidence (speculative pop)
  - is_riser     : high upside + high confidence (trending up strongly)
  - is_risk      : high risk_rating + low confidence
  - is_value     : solid projection + high confidence, not an elite captain pick

  ## Security
  - GRANT SELECT to anon and authenticated
*/

CREATE OR REPLACE VIEW public.v_neeko_intel_master
WITH (security_invoker = false)
AS
SELECT
  *,

  projection_final::numeric                AS projection,
  ceiling_estimate::numeric                AS ceiling,
  floor_estimate::numeric                  AS floor,
  projection_confidence::numeric           AS confidence,
  captain_score::numeric                   AS captain_score_num,
  upside_rating::numeric                   AS upside,
  risk_rating::numeric                     AS risk,

  -- is_captain: elite pick, high score + confident
  CASE
    WHEN captain_score::numeric >= 115
     AND projection_confidence::numeric >= 60
    THEN true ELSE false
  END AS is_captain,

  -- is_breakout: upside play, moderate confidence window
  CASE
    WHEN upside_rating::numeric >= 15
     AND projection_confidence::numeric BETWEEN 40 AND 70
    THEN true ELSE false
  END AS is_breakout,

  -- is_riser: strongly trending up + confident
  CASE
    WHEN upside_rating::numeric >= 20
     AND projection_confidence::numeric >= 50
    THEN true ELSE false
  END AS is_riser,

  -- is_risk: high risk + low confidence
  CASE
    WHEN risk_rating::numeric >= 70
     AND projection_confidence::numeric <= 50
    THEN true ELSE false
  END AS is_risk,

  -- is_value: solid floor, confident, not elite captain territory
  CASE
    WHEN projection_final::numeric >= 90
     AND projection_confidence::numeric >= 60
     AND captain_score::numeric < 110
    THEN true ELSE false
  END AS is_value

FROM public.v_rankings_master;

GRANT SELECT ON public.v_neeko_intel_master TO anon, authenticated;
