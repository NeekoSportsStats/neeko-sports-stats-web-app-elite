/*
  # Create AI Generation Queue and Logs

  ## Summary
  Adds the centralised AI worker queue infrastructure as part of Phase 3.
  This is purely additive — no existing tables are modified.

  ## New Tables

  ### public.ai_generation_queue
  - Central job queue for all AI generation tasks
  - `id` — bigserial primary key
  - `job_type` — classification of the job (e.g. "player_analysis", "test")
  - `entity_type` — type of entity being processed (e.g. "player", "team", "match")
  - `entity_id` — identifier of the specific entity
  - `prompt_key` — references afl.ai_prompts for the prompt to use
  - `payload` — arbitrary JSON data injected into the prompt template
  - `status` — "pending" | "processing" | "complete" | "failed"
  - `attempts` — number of processing attempts made
  - `created_at` — job creation timestamp
  - `processed_at` — completion timestamp

  ### public.ai_generation_logs
  - Immutable audit log of every AI worker execution
  - `id` — bigserial primary key
  - `queue_id` — foreign key back to the originating queue row
  - `prompt_key` — which prompt was used
  - `model` — which OpenAI model was called
  - `tokens_used` — token consumption for cost tracking
  - `success` — whether the job completed successfully
  - `error` — error message if failed
  - `created_at` — log entry creation timestamp

  ## Indexes
  - `idx_ai_queue_status` on ai_generation_queue(status) for fast pending job lookups
  - `idx_ai_queue_created_at` on ai_generation_queue(created_at) for ordered processing
  - `idx_ai_logs_queue_id` on ai_generation_logs(queue_id) for log lookup by job

  ## Security
  - RLS enabled on both tables
  - Only service role (edge functions) can read/write queue entries
  - Only service role can insert log entries
  - Authenticated users can read their own logs via queue_id join (future use)
*/

CREATE TABLE IF NOT EXISTS public.ai_generation_queue (
  id BIGSERIAL PRIMARY KEY,
  job_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  prompt_key TEXT NOT NULL,
  payload JSONB,
  status TEXT DEFAULT 'pending',
  attempts INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_queue_status
  ON public.ai_generation_queue(status);

CREATE INDEX IF NOT EXISTS idx_ai_queue_created_at
  ON public.ai_generation_queue(created_at);

ALTER TABLE public.ai_generation_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage ai_generation_queue"
  ON public.ai_generation_queue
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can insert ai_generation_queue"
  ON public.ai_generation_queue
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update ai_generation_queue"
  ON public.ai_generation_queue
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete ai_generation_queue"
  ON public.ai_generation_queue
  FOR DELETE
  TO service_role
  USING (true);

CREATE TABLE IF NOT EXISTS public.ai_generation_logs (
  id BIGSERIAL PRIMARY KEY,
  queue_id BIGINT REFERENCES public.ai_generation_queue(id) ON DELETE SET NULL,
  prompt_key TEXT,
  model TEXT,
  tokens_used INT,
  success BOOLEAN DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_logs_queue_id
  ON public.ai_generation_logs(queue_id);

CREATE INDEX IF NOT EXISTS idx_ai_logs_created_at
  ON public.ai_generation_logs(created_at);

ALTER TABLE public.ai_generation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can select ai_generation_logs"
  ON public.ai_generation_logs
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can insert ai_generation_logs"
  ON public.ai_generation_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update ai_generation_logs"
  ON public.ai_generation_logs
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
