-- HOW TO RUN: Open this file in Cursor/VS Code, Select All, Copy, paste into Supabase SQL Editor.
-- Easier: use supabase_editor_run_once.sql (meta + this table, one paste) if you keep mixing files/paths.
-- Do NOT paste file paths like supabase/migrations/foo.sql (that causes error near "supabase").
-- Maps to daily-ai-curator.js: .from("daily_ai_curations_v2").upsert(..., { onConflict: "url" })
-- url is NOT NULL + UNIQUE so PostgREST onConflict works reliably.
-- Run in SQL Editor. Use service_role key for inserts (bypasses RLS).
-- If meta table is missing, run ensure_supabase_migrations.sql first (ASCII -- comments only).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.daily_ai_curations_v2 (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,

  total_score INTEGER NOT NULL CHECK (total_score >= 0 AND total_score <= 100),

  -- Four axes (same keys as axis_breakdown in JS)
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

-- Existing DB: drop null/empty urls then enforce NOT NULL (only if needed)
-- DELETE FROM public.daily_ai_curations_v2 WHERE url IS NULL OR btrim(url) = '';
-- ALTER TABLE public.daily_ai_curations_v2 ALTER COLUMN url SET NOT NULL;
