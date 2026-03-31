
/*
  # Market Watch AI Summary System

  ## Summary
  Creates the full pipeline for weekly AI-generated Market Watch summaries.
  Safe mode — no existing tables dropped, no snapshot data modified.

  ## New Tables
  - `afl.ai_market_watch_summary`
    - Stores one AI-written summary per season/round
    - Primary key: (season, round_number)
    - Columns: season, round_number, generated_at, summary

  ## New Views
  - `afl.v_ai_market_watch_inputs`  — top 40 players across key categories for AI input
  - `afl.v_market_watch_summary`    — latest summary row (for frontend)
  - `public.v_market_watch_summary` — public wrapper with anon/authenticated grants

  ## New Prompt
  - `afl.ai_prompts` row with prompt_key = 'market_watch_summary', version = 1

  ## Security
  - RLS enabled on `afl.ai_market_watch_summary`
  - Public SELECT policy (read-only) for anon + authenticated
*/

-- ── Step 1: Storage table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS afl.ai_market_watch_summary (
  season        int         NOT NULL,
  round_number  int         NOT NULL,
  generated_at  timestamptz NOT NULL DEFAULT now(),
  summary       text        NOT NULL DEFAULT '',
  PRIMARY KEY (season, round_number)
);

ALTER TABLE afl.ai_market_watch_summary ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'afl'
      AND tablename  = 'ai_market_watch_summary'
      AND policyname = 'Anyone can read market watch summaries'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Anyone can read market watch summaries"
        ON afl.ai_market_watch_summary
        FOR SELECT
        TO anon, authenticated
        USING (true)
    $policy$;
  END IF;
END $$;

-- ── Step 2: AI input view ─────────────────────────────────────────────────────

CREATE OR REPLACE VIEW afl.v_ai_market_watch_inputs AS
SELECT
  p.player_name,
  p.team,
  p.position,
  p.price,
  p.projection,
  p.breakeven,
  p.expected_price_change,
  p.projected_price_r3,
  p.breakout_score,
  p.breakout_flag,
  p.volatility_score,
  p.volatility_level,
  p.category
FROM market.market_watch_snapshot_players p
JOIN market.market_watch_snapshot s
  ON p.snapshot_id = s.snapshot_id
WHERE s.is_active = true
  AND p.category IN ('buy', 'sell_now', 'cash_cow', 'fade')
ORDER BY p.trade_score DESC
LIMIT 40;

-- ── Step 3: AI prompt ─────────────────────────────────────────────────────────

INSERT INTO afl.ai_prompts (prompt_key, version, system_prompt, user_prompt_template, is_active)
VALUES (
  'market_watch_summary',
  1,
  'You are an elite AFL fantasy analyst writing weekly Market Watch insights for Neeko Sports Stats.

Your job is to analyse the current trade market and highlight the most important opportunities.

Focus on:
- the best buy targets
- key sell candidates
- breakout players
- emerging cash cows
- role changes impacting scoring

Write clear and actionable advice. Be concise and professional. Never mention AI or models.',

  'Analyse the following AFL fantasy trade market data.

Identify the most important trade opportunities this week.

{DATA}

Write a concise weekly Market Watch summary explaining:
- the best players to buy
- players coaches should consider selling
- rookies generating cash
- breakout candidates
- important role changes

Limit the summary to 120-180 words.',

  true
)
ON CONFLICT (prompt_key, version) DO UPDATE SET
  system_prompt         = EXCLUDED.system_prompt,
  user_prompt_template  = EXCLUDED.user_prompt_template,
  is_active             = true;

-- ── Step 4: Frontend views ────────────────────────────────────────────────────

CREATE OR REPLACE VIEW afl.v_market_watch_summary AS
SELECT *
FROM afl.ai_market_watch_summary
ORDER BY season DESC, round_number DESC
LIMIT 1;

DROP VIEW IF EXISTS public.v_market_watch_summary;

CREATE VIEW public.v_market_watch_summary AS
SELECT * FROM afl.v_market_watch_summary;

GRANT SELECT ON public.v_market_watch_summary TO anon, authenticated;
