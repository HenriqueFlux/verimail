-- Migration: 20260521000000_initial_schema
-- Phase 1: Validator Core + Foundation
-- Creates jobs and validation_results tables with RLS policies

-- Validation jobs
CREATE TABLE public.jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  source           TEXT NOT NULL CHECK (source IN ('csv', 'manual')),
  filename         TEXT,                        -- original CSV filename (nullable for manual)
  total_emails     INTEGER NOT NULL DEFAULT 0,
  processed_emails INTEGER NOT NULL DEFAULT 0,
  valid_count      INTEGER,
  invalid_count    INTEGER,
  risky_count      INTEGER,
  input_path       TEXT,                        -- Supabase Storage path (csv source only)
  result_path      TEXT,                        -- Supabase Storage path (cleaned CSV output)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ
);

-- Per-email validation results
CREATE TABLE public.validation_results (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  email            TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('valid', 'invalid', 'risky')),
  score            SMALLINT NOT NULL CHECK (score IN (0, 50, 100)),
  reason           TEXT CHECK (reason IN (
                     'syntax', 'no-domain', 'no-mx', 'disposable',
                     'role', 'catch-all', 'typo'
                   )),
  suggestion       TEXT,                        -- typo correction (e.g. 'gmail.com')
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for query patterns
CREATE INDEX idx_jobs_user_id         ON public.jobs(user_id);
CREATE INDEX idx_jobs_status          ON public.jobs(status);
CREATE INDEX idx_results_job_id       ON public.validation_results(job_id);
CREATE INDEX idx_results_job_status   ON public.validation_results(job_id, status);

-- Row Level Security
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_results ENABLE ROW LEVEL SECURITY;

-- Users see only their own jobs
CREATE POLICY "users_own_jobs" ON public.jobs
  FOR ALL USING (auth.uid() = user_id);

-- Users see only results for their own jobs
CREATE POLICY "users_own_results" ON public.validation_results
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.user_id = auth.uid()
    )
  );
