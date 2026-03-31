
/*
  # Upgrade get_rankings_free RPC — add price and value columns (v3)

  ## Summary
  Drops and recreates the free rankings RPC to add price, value_score,
  value_tier, value_tag, consistency_tier. Source switched to v_rankings_with_value.
*/

drop function if exists public.get_rankings_free(text, integer);

create function public.get_rankings_free(
  position_filter text default null,
  limit_n integer default 20
)
returns table (
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
  projection_confidence double precision,
  ai_recommendation text,
  ai_analysis text,
  recommendation_why text,
  recommendation_color text,
  captain_score numeric,
  captain_rating text,
  price integer,
  value_score numeric,
  value_tag text,
  value_tier text,
  consistency_tier text,
  total_count bigint
)
language sql
security definer
as $$
with base as (
  select
    p.player_id::text,
    p.player_name,
    p.team,
    p."position",
    p.projection_final,
    p.ceiling_estimate,
    p.floor_estimate,
    p.consistency_score,
    p.form_rating,
    p.matchup_rating,
    p.upside_rating,
    p.risk_rating,
    p.projection_confidence,
    p.ai_recommendation,
    p.ai_analysis,
    p.recommendation_why,
    p.recommendation_color,
    p.captain_score,
    p.captain_rating,
    p.price,
    p.value_score,
    p.value_tag,
    p.value_tier,
    p.consistency_tier
  from public.v_rankings_with_value p
  where
    position_filter is null
    or position_filter = 'ALL'
    or p."position" = position_filter
),
counted as (select count(*) as total_count from base)
select
  b.player_id,
  b.player_name,
  b.team,
  b."position",
  b.projection_final,
  b.ceiling_estimate,
  b.floor_estimate,
  b.consistency_score,
  b.form_rating,
  b.matchup_rating,
  b.upside_rating,
  b.risk_rating,
  b.projection_confidence,
  b.ai_recommendation,
  b.ai_analysis,
  b.recommendation_why,
  b.recommendation_color,
  b.captain_score,
  b.captain_rating,
  b.price,
  b.value_score,
  b.value_tag,
  b.value_tier,
  b.consistency_tier,
  c.total_count
from base b, counted c
order by b.projection_final desc nulls last
limit limit_n;
$$;

grant execute on function public.get_rankings_free to anon, authenticated;
