/*
  # Neeko Phase 3 — Master V3 View (corrected column names)

  v_neeko_next_round_context columns: team, opponent, venue, is_home, next_round_number, next_start_time
  All aliased with next_ prefix for clarity in frontend.
*/

CREATE OR REPLACE VIEW public.v_neeko_intel_master_v3
WITH (security_invoker = false)
AS
SELECT
  m.player_id,
  m.player_name,
  m.team,
  m.position,
  m.projection_final,
  m.ceiling_estimate,
  m.floor_estimate,
  m.consistency_score,
  m.form_rating,
  m.matchup_rating,
  m.upside_rating,
  m.risk_rating,
  m.projection_confidence,
  m.ai_recommendation,
  m.ai_analysis,
  m.recommendation_why,
  m.recommendation_color,
  m.captain_score,
  m.captain_rating,
  m.projection,
  m.ceiling,
  m.floor,
  m.confidence,
  m.captain_score_num,
  m.upside,
  m.risk,
  m.is_captain,
  m.is_breakout,
  m.is_riser,
  m.is_risk,
  m.is_value,
  m.matchup_difficulty,
  m.volatility_score,
  m.volatility_level,
  m.captain_tier,
  m.breakout_flag,
  m.avoid_flag,

  -- ── Phase 3: Next Round ──
  nr.next_round_number,
  nr.opponent        AS next_opponent,
  nr.venue           AS next_venue,
  nr.next_start_time,
  nr.is_home,

  -- ── Phase 3: Trends ──
  tr.trend_label,
  tr.trend_delta_3v_season,
  tr.trend_delta_5v_season,
  tr.avg_last_3,
  tr.avg_last_5,
  tr.avg_season      AS trend_avg_season,
  tr.consistency_label,

  -- ── Phase 3: Role Change ──
  rc.role_signal,
  rc.role_signal_strength,
  rc.delta_cba,
  rc.delta_tog,

  -- ── Phase 3: Availability ──
  av.availability_note,
  av.days_rest,
  av.quick_turnaround_flag,

  -- ── Phase 3: Value (placeholder) ──
  ve.value_tier,
  ve.value_score

FROM public.v_neeko_intel_master_v2 m
LEFT JOIN public.v_neeko_next_round_context   nr ON nr.team = m.team
LEFT JOIN public.v_neeko_player_trends        tr USING (player_id)
LEFT JOIN public.v_neeko_role_change_signals  rc USING (player_id)
LEFT JOIN public.v_neeko_availability_flags   av USING (player_id)
LEFT JOIN public.v_neeko_value_engine         ve USING (player_id);

GRANT SELECT ON public.v_neeko_intel_master_v3 TO anon, authenticated;
