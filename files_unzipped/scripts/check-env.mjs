import { loadAppEnv } from "../load-env.mjs";

loadAppEnv();

/**
 * ローカルで .env またはシェルにキーが載っているかだけ確認（値は出さない）
 * 使い方: node --env-file=.env scripts/check-env.mjs
 * または: $env:ANTHROPIC_API_KEY="..."; node scripts/check-env.mjs
 */
const required = ["ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_KEY"];
const optional = ["LINE_MESSAGING_API_TOKEN", "LINE_USER_ID"];

let ok = true;
for (const k of required) {
  const v = process.env[k];
  const status = v && String(v).trim() ? "SET" : "MISSING";
  if (status === "MISSING") ok = false;
  console.log(`${k}: ${status}`);
}
for (const k of optional) {
  const v = process.env[k];
  const status = v && String(v).trim() ? "SET" : "MISSING (OK for DB-only)";
  console.log(`${k}: ${status}`);
}
process.exitCode = ok ? 0 : 1;
