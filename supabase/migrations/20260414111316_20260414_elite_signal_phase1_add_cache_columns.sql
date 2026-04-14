/*
  # Elite Signal System — Phase 1: Add New Cache Columns

  Adds the following new columns to afl.player_rankings_cache:
  - decision_score        numeric  — composite z-score weighted signal
  - confidence_score_100  numeric  — new 0–100 confidence built from 6 components
  - confidence_percentile numeric  — percentile rank within active dataset
  - action_display        text     — user-facing action label (Strong Start / Start / Hold / Sit / Hard Sit)
  - value_band            text     — percentile-based value bucket
  - action_reason_1       text     — primary deterministic reason for action
  - action_reason_2       text     — secondary deterministic reason for action
  - confidence_reason_1   text     — primary deterministic reason for confidence
  - confidence_reason_2   text     — secondary deterministic reason for confidence
*/

ALTER TABLE afl.player_rankings_cache
  ADD COLUMN IF NOT EXISTS decision_score        numeric,
  ADD COLUMN IF NOT EXISTS confidence_score_100  numeric,
  ADD COLUMN IF NOT EXISTS confidence_percentile numeric,
  ADD COLUMN IF NOT EXISTS action_display        text,
  ADD COLUMN IF NOT EXISTS value_band            text,
  ADD COLUMN IF NOT EXISTS action_reason_1       text,
  ADD COLUMN IF NOT EXISTS action_reason_2       text,
  ADD COLUMN IF NOT EXISTS confidence_reason_1   text,
  ADD COLUMN IF NOT EXISTS confidence_reason_2   text;
