/**
 * KPI リマインダー等：Messaging API で 1 通 push（オーナーユーザ向け）。
 * 必須: LINE_MESSAGING_API_TOKEN（チャネルアクセストークン）, LINE_USER_ID
 *
 * npm run line:push
 * npm run line:push:dry
 * LINE_PUSH_TEXT=カスタム node scripts/send-line-push.mjs --dry-run
 */
import fetch from "node-fetch";
import { loadAppEnv } from "../load-env.mjs";

loadAppEnv();

const dry =
  process.argv.includes("--dry-run") ||
  process.env.LINE_DRY_RUN === "1";

const positional = process.argv.slice(2).filter((a) => a !== "--dry-run");
const defaultText =
  "【PITAPIZZA】朝のKPI: Meta の spend・CTR・CPC・clicks・orders をシートに転記してください。";
const text = positional.join(" ").trim() || process.env.LINE_PUSH_TEXT?.trim() || defaultText;

const token = process.env.LINE_MESSAGING_API_TOKEN?.trim();
const userId = process.env.LINE_USER_ID?.trim();

if (!dry && (!token || !userId)) {
  console.error(
    "Missing LINE_MESSAGING_API_TOKEN or LINE_USER_ID (.env を参照。.env.example あり)"
  );
  process.exit(1);
}

const body = {
  to: userId || "(set LINE_USER_ID)",
  messages: [{ type: "text", text }],
};

async function main() {
  if (dry) {
    console.log("[dry-run] POST /v2/bot/message/push (skipped)");
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const resText = await res.text();
  if (!res.ok) {
    console.error(`LINE API ${res.status}: ${resText}`);
    process.exit(1);
  }
  console.log("OK push sent:", res.status, resText || "(empty body)");
}

main();
