import nodemailer from "nodemailer";

export function normalizeGmailAppPassword(raw) {
  if (raw == null) return "";
  let s = String(raw).replace(/\s+/g, "").trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.replace(/\s+/g, "");
}

export function isGmailNotifyConfigured() {
  const u = process.env.GMAIL_USER?.trim();
  const p = normalizeGmailAppPassword(process.env.GMAIL_APP_PASSWORD);
  return Boolean(u && p);
}

function gmailHintForError(err) {
  const msg = (err && (err.message || err.response || String(err))) || "";
  const low = String(msg).toLowerCase();
  if (low.includes("invalid login") || low.includes("535") || low.includes("eauth")) {
    return " Gmail: アプリパスワード（16文字・空白なし）か、2段階認証が有効か確認。";
  }
  if (low.includes("timeout") || low.includes("etimed")) {
    return " ネットワーク / ファイアウォールで smtp.gmail.com:587 が遮断されていないか確認。";
  }
  return "";
}

function createGmailTransport() {
  const from = process.env.GMAIL_USER.trim();
  const pass = normalizeGmailAppPassword(process.env.GMAIL_APP_PASSWORD);

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    requireTLS: true,
    connectionTimeout: 25_000,
    greetingTimeout: 15_000,
    auth: {
      user: from,
      pass,
    },
  });
}

/**
 * 手動・CI 用: 接続確認してから 1 通送る。失敗時は例外（メッセージ拡張）。
 */
export async function sendTestEmail() {
  if (!process.env.GMAIL_USER?.trim()) {
    throw new Error("GMAIL_USER が空です。");
  }
  const pass = normalizeGmailAppPassword(process.env.GMAIL_APP_PASSWORD);
  if (!pass) {
    throw new Error("GMAIL_APP_PASSWORD が空です。Google アカウントのアプリパスワードを設定してください。");
  }
  if (pass.length < 8) {
    throw new Error(
      `GMAIL_APP_PASSWORD が短すぎます（${pass.length} 文字）。Google のアプリパスワードは通常 16 文字です。`
    );
  }
  if (pass.length !== 16) {
    console.warn(
      `WARN: アプリパスワードは通常ちょうど 16 文字です（いま ${pass.length} 文字で読み取り）。まず接続を試します。`
    );
  }

  const from = process.env.GMAIL_USER.trim();
  const to = (process.env.NOTIFY_EMAIL_TO || process.env.GMAIL_USER).trim();
  const transporter = createGmailTransport();

  try {
    await transporter.verify();
  } catch (e) {
    const hint = gmailHintForError(e);
    throw new Error(`SMTP verify に失敗: ${e.message || e}.${hint}`);
  }

  const subject = `[AI Curator テスト] ${new Date().toISOString()}`;
  const text = `これは Daily AI Curator のメール送達テストです。\n\nfrom: ${from}\nto: ${to}\n\n定時実行前にこのメールが届くことを確認し、GitHub の Variables で CURATOR_CRON_ENABLED を true にしてください。`;

  try {
    await transporter.sendMail({
      from: `"AI Curator" <${from}>`,
      to,
      subject,
      text,
    });
  } catch (e) {
    const hint = gmailHintForError(e);
    throw new Error(`送信に失敗: ${e.message || e}.${hint}`);
  }
}

/**
 * Gmail SMTP（アプリパスワード）。GMAIL_USER / GMAIL_APP_PASSWORD が無ければ何もしない。
 */
export async function sendGmailNotify(subject, text) {
  if (!isGmailNotifyConfigured()) {
    return;
  }
  const from = process.env.GMAIL_USER.trim();
  const to = (process.env.NOTIFY_EMAIL_TO || process.env.GMAIL_USER).trim();

  const transporter = createGmailTransport();

  try {
    await transporter.sendMail({
      from: `"AI Curator" <${from}>`,
      to,
      subject,
      text,
    });
    console.log("✅ Email notification sent (Gmail SMTP)");
  } catch (e) {
    console.error(
      "❌ Email notify failed:",
      e.message || e,
      gmailHintForError(e)
    );
  }
}
