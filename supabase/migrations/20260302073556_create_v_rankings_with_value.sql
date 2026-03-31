
/*
  # Create v_rankings_with_value

  ## Summary
  Creates the canonical value-enriched rankings view used by the Rankings frontend.

  ## What this does
  - Extends v_rankings_master with price, value_score, price_tier, and value_tag
  - value_score = projection_final / price * 10000 (points per $10k spent)
  - value_tag is a human-readable tier label: ELITE VALUE / GOOD VALUE / FAIR VALUE / POOR VALUE
  - Joins afl_player_prices at the latest round for season 2026

  ## Columns added
  - price (integer): raw AFL Fantasy price
  - value_score (numeric): projection efficiency per $10k
  - price_tier (text): Premium / Expensive / Mid / Cheap / Rookie
  - value_tag (text): ELITE VALUE / GOOD VALUE / FAIR VALUE / POOR VALUE
*/

create or replace view public.v_rankings_with_value
with (security_invoker = false)
as
select
  r.player_id,
  r.player_name,
  r.team,
  r.position,
  r.projection_final,
  r.ceiling_estimate,
  r.floor_estimate,
  r.consistency_score,
  r.form_rating,
  r.matchup_rating,
  r.upside_rating,
  r.risk_rating,
  r.projection_confidence,
  r.ai_recommendation,
  r.ai_analysis,
  r.recommendation_why,
  r.recommendation_color,
  r.captain_score,
  r.captain_rating,
  p.price,
  case
    when p.price is not null and p.price > 0
      then round((r.projection_final / p.price::numeric) * 10000, 2)
    else null
  end as value_score,
  case
    when p.price >= 900000 then 'Premium'
    when p.price >= 700000 then 'Expensive'
    when p.price >= 500000 then 'Mid'
    when p.price >= 300000 then 'Cheap'
    when p.price is not null then 'Rookie'
    else null
  end as price_tier,
  case
    when p.price is null or p.price = 0 then null
    when (r.projection_final / p.price::numeric) * 10000 >= 1.25 then 'ELITE VALUE'
    when (r.projection_final / p.price::numeric) * 10000 >= 1.10 then 'GOOD VALUE'
    when (r.projection_final / p.price::numeric) * 10000 >= 0.95 then 'FAIR VALUE'
    else 'POOR VALUE'
  end as value_tag
from v_rankings_master r
left join afl_player_prices p
  on p.player_id = r.player_id
  and p.season = 2026
  and p.round_number = (
    select max(round_number)
    from afl_player_prices
    where season = 2026
  );

grant select on public.v_rankings_with_value to anon, authenticated;
