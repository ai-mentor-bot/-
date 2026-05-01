/**
 * Gmail 送達テストのみ（課金・キュレーション処理なし）
 * npm run test:email
 */
import { loadAppEnv } from "../load-env.mjs";
import { sendTestEmail } from "../lib/gmail-notify.mjs";

loadAppEnv();

try {
  await sendTestEmail();
  console.log("OK: テストメールを送信しました。受信箱（迷惑メール含む）を確認してください。");
} catch (e) {
  console.error("FAIL:", e.message || e);
  process.exit(1);
}
