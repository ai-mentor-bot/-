-- =============================================================================
-- ONE paste into Supabase SQL Editor, then Run once.
-- Before Run: delete ANY line that looks like a path (supabase/migrations/... or C:\... or ...files_unzipped...).
-- Do not add $0 or filenames at the end of lines.
-- =============================================================================

-- --- Part 1: migration meta (optional; skip if you do not need it) ---
CREATE SCHEMA IF NOT EXISTS "supabase_migrations";

CREATE TABLE IF NOT EXISTS "supabase_migrations"."schema_migrations" (
  version text NOT NULL PRIMARY KEY,
  statements text[],
  name text
);

-- --- Part 2: daily AI curations v2 (queue curator upsert target) ---
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.daily_ai_curations_v2 (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,

  total_score INTEGER NOT NULL CHECK (total_score >= 0 AND total_score <= 100),

  breakdown JSONB DEFAULT '{"adoption_score":0,"revenue_score":0,"scalability_score":0,"compatibility_score":0}'::jsonb,

  confidence DECIMAL(3, 2) DEFAULT 0.0 CHECK (confidence >= 0 AND confidence <= 1),

  applicable_business TEXT[],
  risk_factors TEXT[],

  implementation_complexity TEXT CHECK (implementation_complexity IN ('LOW', 'MEDIUM', 'HIGH')),
  priority TEXT CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),

  thinking_summary TEXT,
  thinking_process TEXT,

  saved_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_v2_category ON public.daily_ai_curations_v2 (category);
CREATE INDEX IF NOT EXISTS idx_v2_score ON public.daily_ai_curations_v2 (total_score DESC);

-- --- Part 3: 月次レポート + RLS（キュレーターが anon で動かす場合は UPDATE ポリシー必須）---
CREATE TABLE IF NOT EXISTS public.monthly_learning_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month TEXT NOT NULL,
  report_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monthly_reports_month ON public.monthly_learning_reports (month);

ALTER TABLE public.daily_ai_curations_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_learning_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_select_v2" ON public.daily_ai_curations_v2;
CREATE POLICY "allow_select_v2" ON public.daily_ai_curations_v2
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "allow_insert_v2" ON public.daily_ai_curations_v2;
CREATE POLICY "allow_insert_v2" ON public.daily_ai_curations_v2
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "allow_update_v2" ON public.daily_ai_curations_v2;
CREATE POLICY "allow_update_v2" ON public.daily_ai_curations_v2
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_select_monthly_reports" ON public.monthly_learning_reports;
CREATE POLICY "allow_select_monthly_reports" ON public.monthly_learning_reports
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "allow_insert_monthly_reports" ON public.monthly_learning_reports;
CREATE POLICY "allow_insert_monthly_reports" ON public.monthly_learning_reports
  FOR INSERT WITH CHECK (true);
