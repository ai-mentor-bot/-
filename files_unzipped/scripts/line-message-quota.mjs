/**
 * Messaging API メッセージ上限の参照（公式アカウントプランにより値が異なる）。
 * GET /v2/bot/message/quota — 参照: Messaging API 「Rate limits / Quota」
 */
import fetch from "node-fetch";
import { loadAppEnv } from "../load-env.mjs";

loadAppEnv();

const token = process.env.LINE_MESSAGING_API_TOKEN?.trim();
if (!token) {
  console.error("Missing LINE_MESSAGING_API_TOKEN");
  process.exit(1);
}

async function getJson(path) {
  const res = await fetch(`https://api.line.me${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${path} → ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function main() {
  const [quota, consumption] = await Promise.all([
    getJson("/v2/bot/message/quota"),
    getJson("/v2/bot/message/quota/consumption"),
  ]);
  console.log("quota:", JSON.stringify(quota, null, 2));
  console.log("consumption:", JSON.stringify(consumption, null, 2));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
