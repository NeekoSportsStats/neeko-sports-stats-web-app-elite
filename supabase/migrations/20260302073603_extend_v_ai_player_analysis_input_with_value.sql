
/*
  # Extend v_ai_player_analysis_input with price and value data

  ## Summary
  Rebuilds the AI player analysis input view to include price, value_score,
  and value_tag so the AI can reason about fantasy value in its output.

  ## Changes
  - Adds price, value_score, value_tag columns sourced from afl_player_prices
  - Retains all existing columns unchanged
  - Filtering threshold unchanged (projection_final >= 70)
*/

create or replace view public.v_ai_player_analysis_input
with (security_invoker = false)
as
select
  proj.player_id,
  proj.player_name,
  proj.team,
  proj.projection_final,
  proj.ceiling_estimate,
  proj.floor_estimate,
  proj.consistency_score,
  proj.trend_3_vs_10,
  proj.matchup_delta,
  p.price,
  case
    when p.price is not null and p.price > 0
      then round((proj.projection_final / p.price::numeric) * 10000, 2)
    else null
  end as value_score,
  case
    when p.price is null or p.price = 0 then null
    when (proj.projection_final / p.price::numeric) * 10000 >= 1.25 then 'ELITE VALUE'
    when (proj.projection_final / p.price::numeric) * 10000 >= 1.10 then 'GOOD VALUE'
    when (proj.projection_final / p.price::numeric) * 10000 >= 0.95 then 'FAIR VALUE'
    else 'POOR VALUE'
  end as value_tag
from v_player_detail_premium proj
left join afl_player_prices p
  on p.player_id = proj.player_id
  and p.season = 2026
  and p.round_number = (
    select max(round_number)
    from afl_player_prices
    where season = 2026
  )
where proj.projection_final >= 70;

grant select on public.v_ai_player_analysis_input to anon, authenticated;
