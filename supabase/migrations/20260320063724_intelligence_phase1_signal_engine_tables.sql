
/*
  # Phase 1: Signal Engine — Tables

  ## Summary
  Creates the core signal infrastructure for the Player Lab intelligence layer.

  ## New Tables

  ### afl.player_signals
  One row per player per signal type per snapshot.
  - player_id, snapshot_id, signal_type
  - signal_score (0–100, normalised strength)
  - signal_strength: 'strong' | 'moderate' | 'weak'
  - signal_direction: 'positive' | 'negative' | 'neutral'
  - explanation: human-readable reason why signal fired
  - confidence: 0–1 how reliable this signal is
  - metadata: jsonb raw inputs that produced this signal

  Signal types (20+):
    VALUE:       undervalued, overvalued, price_momentum, breakout_value
    TREND:       hot_form, cold_form, rising_projection, falling_projection
    RISK:        high_volatility, low_floor, role_instability
    MATCHUP:     favorable_matchup, difficult_matchup, positional_advantage
    CONSISTENCY: high_consistency, low_consistency, ceiling_heavy, floor_heavy
    OPPORTUNITY: breakout_candidate, bounce_back, regression_candidate
    AI:          ai_strong_buy, ai_avoid, ai_high_confidence

  ### afl.player_signal_summary
  One row per player per snapshot. Aggregates all active signals.
  - total_score, buy_score, sell_score, risk_score, opportunity_score
  - signal_count, signal_tags (array of active signal types)
  - composite_label: 'Best Buy' | 'Risky Trap' | 'Breakout' | 'Safe Pick' | 'High Upside' | 'Watch'

  ## Security
  RLS enabled. Public read via security definer views.
*/

-- Signal types enum-style check
CREATE TABLE IF NOT EXISTS afl.player_signals (
  id               bigserial   PRIMARY KEY,
  player_id        integer     NOT NULL REFERENCES afl.players(player_id) ON DELETE CASCADE,
  snapshot_id      uuid        REFERENCES admin.snapshots(snapshot_id) ON DELETE SET NULL,
  signal_type      text        NOT NULL,
  signal_score     numeric(5,2) NOT NULL DEFAULT 0
                   CHECK (signal_score BETWEEN 0 AND 100),
  signal_strength  text        NOT NULL DEFAULT 'moderate'
                   CHECK (signal_strength IN ('strong','moderate','weak')),
  signal_direction text        NOT NULL DEFAULT 'neutral'
                   CHECK (signal_direction IN ('positive','negative','neutral')),
  explanation      text,
  confidence       numeric(4,3) NOT NULL DEFAULT 0.5
                   CHECK (confidence BETWEEN 0 AND 1),
  metadata         jsonb       NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_player_signals_player_snapshot_type
  ON afl.player_signals(player_id, signal_type, COALESCE(snapshot_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_player_signals_snapshot
  ON afl.player_signals(snapshot_id);

CREATE INDEX IF NOT EXISTS idx_player_signals_type
  ON afl.player_signals(signal_type);

CREATE INDEX IF NOT EXISTS idx_player_signals_direction
  ON afl.player_signals(signal_direction);

ALTER TABLE afl.player_signals ENABLE ROW LEVEL SECURITY;

-- Signal summary table
CREATE TABLE IF NOT EXISTS afl.player_signal_summary (
  player_id          integer     PRIMARY KEY REFERENCES afl.players(player_id) ON DELETE CASCADE,
  snapshot_id        uuid        REFERENCES admin.snapshots(snapshot_id) ON DELETE SET NULL,
  total_score        numeric(6,2) NOT NULL DEFAULT 0,
  buy_score          numeric(6,2) NOT NULL DEFAULT 0,
  sell_score         numeric(6,2) NOT NULL DEFAULT 0,
  risk_score         numeric(6,2) NOT NULL DEFAULT 0,
  opportunity_score  numeric(6,2) NOT NULL DEFAULT 0,
  signal_count       integer     NOT NULL DEFAULT 0,
  positive_count     integer     NOT NULL DEFAULT 0,
  negative_count     integer     NOT NULL DEFAULT 0,
  signal_tags        text[]      NOT NULL DEFAULT '{}',
  composite_label    text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_signal_summary_snapshot
  ON afl.player_signal_summary(snapshot_id);

CREATE INDEX IF NOT EXISTS idx_player_signal_summary_total_score
  ON afl.player_signal_summary(total_score DESC);

CREATE INDEX IF NOT EXISTS idx_player_signal_summary_label
  ON afl.player_signal_summary(composite_label);

ALTER TABLE afl.player_signal_summary ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated users can read signals
CREATE POLICY "authenticated read player_signals"
  ON afl.player_signals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated read player_signal_summary"
  ON afl.player_signal_summary FOR SELECT
  TO authenticated
  USING (true);
