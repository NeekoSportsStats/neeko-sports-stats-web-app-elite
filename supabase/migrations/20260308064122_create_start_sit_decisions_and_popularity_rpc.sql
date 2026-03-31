/*
  # Create start_sit_decisions table and get_start_sit_popularity RPC

  ## Summary
  Tracks every Start/Sit comparison a user makes and exposes a popularity
  endpoint so the frontend can show real "Popular Decisions This Week" data
  instead of hardcoded player pairs.

  ## New Tables
  - public.start_sit_decisions
    - id: bigserial PK
    - player_a_id, player_a_name: the first player compared
    - player_b_id, player_b_name: the second player compared
    - winner_player_id: which player the model picked
    - session_id: anonymous session identifier (no auth required)
    - created_at: timestamp

  ## New RPC
  - public.get_start_sit_popularity(days_back int default 7, limit_n int default 8)
    Returns the most-compared matchups in the last N days:
    - player_a_id, player_a_name, player_b_id, player_b_name
    - comparison_count: how many times this pair was compared
    - win_a_pct: % of comparisons where player A won
    - last_compared_at: most recent comparison timestamp

  ## Security
  - RLS enabled; INSERT allowed for anon (no login required to track)
  - SELECT policy: authenticated only (admin/premium use)
  - RPC is SECURITY DEFINER so frontend can call it without auth
*/

-- ─── 1. Decisions table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.start_sit_decisions (
  id               bigserial PRIMARY KEY,
  player_a_id      text NOT NULL,
  player_a_name    text NOT NULL,
  player_b_id      text NOT NULL,
  player_b_name    text NOT NULL,
  winner_player_id text,
  session_id       text,
  created_at       timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ssd_created_at ON public.start_sit_decisions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ssd_pair ON public.start_sit_decisions (
  LEAST(player_a_id, player_b_id),
  GREATEST(player_a_id, player_b_id)
);

ALTER TABLE public.start_sit_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert start_sit decisions"
  ON public.start_sit_decisions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read start_sit decisions"
  ON public.start_sit_decisions FOR SELECT
  TO authenticated
  USING (true);

-- ─── 2. Popularity RPC ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_start_sit_popularity(
  days_back integer DEFAULT 7,
  limit_n   integer DEFAULT 8
)
RETURNS TABLE(
  player_a_id       text,
  player_a_name     text,
  player_b_id       text,
  player_b_name     text,
  comparison_count  bigint,
  win_a_pct         numeric,
  last_compared_at  timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH normalised AS (
    SELECT
      LEAST(player_a_id, player_b_id)     AS id_lo,
      GREATEST(player_a_id, player_b_id)  AS id_hi,
      CASE WHEN player_a_id <= player_b_id
        THEN player_a_name ELSE player_b_name END AS name_lo,
      CASE WHEN player_a_id <= player_b_id
        THEN player_b_name ELSE player_a_name END AS name_hi,
      CASE WHEN player_a_id <= player_b_id
        THEN player_a_id ELSE player_b_id END AS canonical_a_id,
      winner_player_id,
      created_at
    FROM public.start_sit_decisions
    WHERE created_at >= (now() - (days_back || ' days')::interval)
  )
  SELECT
    MAX(CASE WHEN id_lo = canonical_a_id THEN id_lo ELSE id_hi END)   AS player_a_id,
    MAX(name_lo)                                                        AS player_a_name,
    MAX(CASE WHEN id_lo = canonical_a_id THEN id_hi ELSE id_lo END)   AS player_b_id,
    MAX(name_hi)                                                        AS player_b_name,
    COUNT(*)                                                            AS comparison_count,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE winner_player_id = id_lo)
        / NULLIF(COUNT(*) FILTER (WHERE winner_player_id IS NOT NULL), 0),
    1)                                                                  AS win_a_pct,
    MAX(created_at)                                                     AS last_compared_at
  FROM normalised
  GROUP BY id_lo, id_hi
  ORDER BY comparison_count DESC
  LIMIT limit_n;
$$;

GRANT EXECUTE ON FUNCTION public.get_start_sit_popularity(integer, integer) TO anon, authenticated;
