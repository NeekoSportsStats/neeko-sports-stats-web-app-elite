
/*
  # Rebuild v_rankings_with_value — correct value tiers + consistency tier (v2)

  ## Summary
  Fixes the value tier system to use a clean 3-tier model (ELITE / GOOD / POOR)
  and adds consistency_tier. Removes FAIR VALUE as a separate tier.
  Drops and recreates the view to allow column changes.

  ## Changes
  - value_tier: ELITE / GOOD / POOR
  - value_tag: display label aligned to 3-tier (ELITE VALUE / GOOD VALUE / POOR VALUE)
  - price_tier: kept as-is (Premium / Expensive / Mid / Cheap / Rookie)
  - consistency_tier: ELITE (>=80) / GOOD (>=60) / POOR (<60)
*/

drop view if exists public.v_rankings_with_value;

create view public.v_rankings_with_value
with (security_invoker = false)
as
select
  r.*,
  p.price,

  round(
    r.projection_final / nullif(p.price, 0) * 10000
  , 2) as value_score,

  case
    when p.price >= 900000 then 'Premium'
    when p.price >= 700000 then 'Expensive'
    when p.price >= 500000 then 'Mid'
    when p.price >= 300000 then 'Cheap'
    else 'Rookie'
  end as price_tier,

  case
    when r.projection_final / nullif(p.price, 0) * 10000 >= 1.25 then 'ELITE'
    when r.projection_final / nullif(p.price, 0) * 10000 >= 1.10 then 'GOOD'
    else 'POOR'
  end as value_tier,

  case
    when r.projection_final / nullif(p.price, 0) * 10000 >= 1.25 then 'ELITE VALUE'
    when r.projection_final / nullif(p.price, 0) * 10000 >= 1.10 then 'GOOD VALUE'
    else 'POOR VALUE'
  end as value_tag,

  case
    when r.consistency_score >= 80 then 'ELITE'
    when r.consistency_score >= 60 then 'GOOD'
    else 'POOR'
  end as consistency_tier

from v_rankings_master r
left join afl_player_prices p
  on r.player_id = p.player_id
where p.season = 2026
  and p.round_number = (
    select max(round_number)
    from afl_player_prices
    where season = 2026
  );

grant select on public.v_rankings_with_value to anon, authenticated;
