/**
 * スモーク: 上位 .env も含めて読み込み + daily_ai_curations_v2 への疎通（SELECT 1 行、課金なし）
 * 使い方: npm run test:smoke または run-smoke.cmd をダブルクリック
 * 全行程テスト: npm run test:curator（Anthropic 課金あり）
 */
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { envSearchPathsForHelp, loadAppEnv } from "../load-env.mjs";

loadAppEnv();

const cwd = process.cwd();
const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_KEY?.trim();

if (!url || !key) {
  console.error("FAIL: SUPABASE_URL か SUPABASE_KEY が空です。");
  console.error("  いまの作業フォルダ:", cwd);
  console.error("  次のいずれかに .env を置いてください（後から読んだファイルが優先）:");
  for (const p of envSearchPathsForHelp()) {
    console.error("   ", existsSync(p) ? "（あり）" : "（なし）", p);
  }
  process.exit(1);
}

const supabase = createClient(url, key);
const { data, error } = await supabase
  .from("daily_ai_curations_v2")
  .select("id")
  .limit(1);

if (error) {
  console.error("FAIL: Supabase", error.message);
  console.error("hint: テーブル名・RLS・キー（service_role 推奨）を確認");
  process.exit(1);
}

console.log("OK: daily_ai_curations_v2 読み取り成功", { sampleRows: data?.length ?? 0 });

const needLine =
  process.env.LINE_MESSAGING_API_TOKEN?.trim() && process.env.LINE_USER_ID?.trim();
const needAi = process.env.ANTHROPIC_API_KEY?.trim();
if (!needAi || !needLine) {
  console.log(
    `注意: フル実行には ANTHROPIC / LINE も要ります。AI=${needAi ? "OK" : "未設定"} LINE=${needLine ? "OK" : "未設定"}`
  );
}

process.exit(0);
