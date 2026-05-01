-- HOW TO RUN: Open this file, Select All, Copy, paste into Supabase SQL Editor (full script only).
-- Do NOT paste Windows paths or supabase/migrations/... filenames as the query.
-- Meta table used by migration tooling. Run once if you see missing relation errors.
-- Paste into SQL Editor using ASCII hyphens only for line comments (two minus: --).

CREATE SCHEMA IF NOT EXISTS "supabase_migrations";

CREATE TABLE IF NOT EXISTS "supabase_migrations"."schema_migrations" (
  version text NOT NULL PRIMARY KEY,
  statements text[],
  name text
);
