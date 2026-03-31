/*
  # Phase 2: Signal Scoring Summary Function

  Creates afl.fn_build_player_signal_summary() which aggregates individual
  player signals from afl.player_signals into afl.player_signal_summary.

  ## Signal Score Mapping
  - buy_score: signals in (undervalued, breakout_value, breakout_candidate, hot_form,
                           rising_projection, favorable_matchup, bounce_back, ai_strong_buy)
  - sell_score: signals in (overvalued, cold_form, falling_projection, difficult_matchup,
                             regression_candidate, ai_avoid)
  - risk_score: signals in (high_volatility, low_floor, role_instability, low_consistency)
  - opportunity_score: signals in (breakout_candidate, breakout_value, bounce_back,
                                   ceiling_heavy, positional_advantage)

  ## Composite Labels
  - Best Buy: buy_score >= 65 AND risk_score < 40
  - Risky Trap: sell_score >= 60 OR risk_score >= 65
  - Breakout: breakout_candidate OR breakout_value signal AND positive direction
  - Safe Pick: floor_heavy + high_consistency signals with low risk
  - High Upside: ceiling_heavy signal with buy_score >= 50
  - Watch: default for players with meaningful signals
*/

CREATE OR REPLACE FUNCTION afl.fn_build_player_signal_summary(p_snapshot_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'afl', 'admin', 'public'
AS $$
DECLARE
  v_snap    uuid;
  v_written integer := 0;
BEGIN
  IF p_snapshot_id IS NULL THEN
    SELECT snapshot_id INTO v_snap FROM admin.snapshots
    WHERE is_live = true ORDER BY created_at DESC LIMIT 1;
  ELSE
    v_snap := p_snapshot_id;
  END IF;

  INSERT INTO afl.player_signal_summary
    (player_id, snapshot_id, total_score, buy_score, sell_score,
     risk_score, opportunity_score, signal_count, positive_count, negative_count,
     signal_tags, composite_label, updated_at)
  WITH raw AS (
    SELECT
      player_id,
      snapshot_id,
      signal_type,
      signal_score,
      signal_direction,
      signal_strength
    FROM afl.player_signals
    WHERE snapshot_id IS NOT DISTINCT FROM v_snap
  ),
  agg AS (
    SELECT
      player_id,
      snapshot_id,
      COUNT(*)                                                                AS signal_count,
      COUNT(*) FILTER (WHERE signal_direction = 'positive')                  AS positive_count,
      COUNT(*) FILTER (WHERE signal_direction = 'negative')                  AS negative_count,
      -- total weighted score (positive contribute up, negative subtract)
      SUM(
        CASE WHEN signal_direction = 'positive' THEN signal_score
             WHEN signal_direction = 'negative' THEN -signal_score
             ELSE 0 END
      ) / NULLIF(COUNT(*), 0)                                                AS raw_total,
      -- buy score
      COALESCE(AVG(signal_score) FILTER (WHERE signal_type IN (
        'undervalued','breakout_value','breakout_candidate','hot_form',
        'rising_projection','favorable_matchup','bounce_back','ai_strong_buy'
      )), 0)                                                                  AS buy_score,
      -- sell score
      COALESCE(AVG(signal_score) FILTER (WHERE signal_type IN (
        'overvalued','cold_form','falling_projection','difficult_matchup',
        'regression_candidate','ai_avoid'
      )), 0)                                                                  AS sell_score,
      -- risk score
      COALESCE(AVG(signal_score) FILTER (WHERE signal_type IN (
        'high_volatility','low_floor','role_instability','low_consistency'
      )), 0)                                                                  AS risk_score,
      -- opportunity score
      COALESCE(AVG(signal_score) FILTER (WHERE signal_type IN (
        'breakout_candidate','breakout_value','bounce_back',
        'ceiling_heavy','positional_advantage'
      )), 0)                                                                  AS opportunity_score,
      -- tags array
      ARRAY_AGG(DISTINCT signal_type ORDER BY signal_type)                   AS signal_tags,
      -- flags for composite label
      BOOL_OR(signal_type = 'breakout_candidate' AND signal_direction = 'positive') AS has_breakout,
      BOOL_OR(signal_type = 'breakout_value'     AND signal_direction = 'positive') AS has_breakout_val,
      BOOL_OR(signal_type = 'floor_heavy'        AND signal_direction = 'positive') AS has_floor_heavy,
      BOOL_OR(signal_type = 'high_consistency'   AND signal_direction = 'positive') AS has_high_cons,
      BOOL_OR(signal_type = 'ceiling_heavy'      AND signal_direction = 'positive') AS has_ceiling,
      COALESCE(AVG(signal_score) FILTER (WHERE signal_type IN (
        'high_volatility','low_floor','role_instability','low_consistency'
      )), 0)                                                                  AS risk_check
    FROM raw
    GROUP BY player_id, snapshot_id
  ),
  labelled AS (
    SELECT
      *,
      -- normalise total to 0-100
      LEAST(100, GREATEST(0, 50 + raw_total))::numeric(6,2) AS total_score,
      CASE
        WHEN buy_score >= 65 AND risk_check < 40
          THEN 'Best Buy'
        WHEN sell_score >= 60 OR risk_check >= 65
          THEN 'Risky Trap'
        WHEN (has_breakout OR has_breakout_val)
          THEN 'Breakout'
        WHEN has_floor_heavy AND has_high_cons AND risk_check < 45
          THEN 'Safe Pick'
        WHEN has_ceiling AND buy_score >= 50
          THEN 'High Upside'
        WHEN signal_count >= 2
          THEN 'Watch'
        ELSE 'Neutral'
      END AS composite_label
    FROM agg
  )
  SELECT
    player_id,
    snapshot_id,
    total_score,
    buy_score::numeric(6,2),
    sell_score::numeric(6,2),
    risk_score::numeric(6,2),
    opportunity_score::numeric(6,2),
    signal_count::integer,
    positive_count::integer,
    negative_count::integer,
    signal_tags,
    composite_label,
    now()
  FROM labelled
  ON CONFLICT (player_id) DO UPDATE SET
    snapshot_id       = EXCLUDED.snapshot_id,
    total_score       = EXCLUDED.total_score,
    buy_score         = EXCLUDED.buy_score,
    sell_score        = EXCLUDED.sell_score,
    risk_score        = EXCLUDED.risk_score,
    opportunity_score = EXCLUDED.opportunity_score,
    signal_count      = EXCLUDED.signal_count,
    positive_count    = EXCLUDED.positive_count,
    negative_count    = EXCLUDED.negative_count,
    signal_tags       = EXCLUDED.signal_tags,
    composite_label   = EXCLUDED.composite_label,
    updated_at        = now();

  GET DIAGNOSTICS v_written = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'players_summarised', v_written,
    'snapshot_id', v_snap,
    'generated_at', NOW()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'hint', SQLSTATE);
END;
$$;

GRANT EXECUTE ON FUNCTION afl.fn_build_player_signal_summary(uuid) TO authenticated;

-- Run immediately
SELECT afl.fn_build_player_signal_summary(NULL);
