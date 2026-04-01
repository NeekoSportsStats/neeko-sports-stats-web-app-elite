SELECT 
  player_name,
  price,
  ROUND((price::numeric / 2500.0), 1) as calculated_breakeven,
  projection,
  ROUND(projection - (price::numeric / 2500.0), 1) as delta_vs_breakeven
FROM v_mw_premium
WHERE player_name IN ('Marcus Bontempelli', 'Patrick Cripps', 'Clayton Oliver', 'Christian Petracca', 'Zak Butters')
LIMIT 5;
