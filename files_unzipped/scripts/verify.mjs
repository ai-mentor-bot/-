/**
 * 一度で確認: .env の探索経路 + 必須キー + Supabase 疎通（課金なし）
 * npm run verify
 */
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { envSearchPathsForHelp, loadAppEnv } from "../load-env.mjs";

loadAppEnv();

console.log("=== verify: 読み込み候補の .env（値は出しません）===\n");
for (const p of envSearchPathsForHelp()) {
  console.log(existsSync(p) ? "  [あり]" : "  [なし]", p);
}

const required = ["ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_KEY"];
console.log("\n=== verify: 必須キー ===\n");
let ok = true;
for (const k of required) {
  const v = process.env[k];
  const status = v && String(v).trim() ? "SET" : "MISSING";
  if (status === "MISSING") ok = false;
  console.log(`  ${k}: ${status}`);
}

const optional = [
  "LINE_MESSAGING_API_TOKEN",
  "LINE_USER_ID",
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
  "NOTIFY_EMAIL_TO",
];
console.log("\n=== verify: 任意（LINE / Gmail 通知）===\n");
for (const k of optional) {
  const v = process.env[k];
  const status = v && String(v).trim() ? "SET" : "MISSING";
  console.log(`  ${k}: ${status}`);
}

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_KEY?.trim();

console.log("\n=== verify: Supabase daily_ai_curations_v2（SELECT 1 行）===\n");
if (!url || !key) {
  console.log("  SKIP: SUPABASE_URL / SUPABASE_KEY が無い");
  process.exit(1);
}

const supabase = createClient(url, key);
const { error } = await supabase
  .from("daily_ai_curations_v2")
  .select("id")
  .limit(1);

if (error) {
  console.log("  FAIL:", error.message);
  console.log("  hint: テーブル未作成・RLS・キー種別（service_role 推奨）");
  process.exit(1);
}
console.log("  OK");

console.log("\n=== verify: monthly_learning_reports（月次を使うなら）===\n");
const { error: monthlyErr } = await supabase
  .from("monthly_learning_reports")
  .select("id")
  .limit(1);

if (monthlyErr) {
  console.log("  WARN:", monthlyErr.message);
  console.log("  → 月次まで使うなら supabase-migration-v2.sql を SQL Editor で実行");
} else {
  console.log("  OK");
}

console.log("\n=== verify: ここまで OK なら次の順で ===\n");
console.log("  1. メール:    npm run test:email  （届くまで .env の GMAIL_* を直す・迷惑メールも確認）");
console.log("  2. GitHub:    repo Variables に CURATOR_CRON_ENABLED = true（テストメール確認後だけ）");
console.log("  3. 任意:      Actions → Test Gmail notify でクラウドから再確認");
console.log("  4. ローカル:  npm run daily     （Anthropic 課金）※ LINE 未設定でも可");
console.log("  5. Monthly    npm run monthly   または定時（変数 true 時のみ）\n");

process.exit(ok ? 0 : 1);
