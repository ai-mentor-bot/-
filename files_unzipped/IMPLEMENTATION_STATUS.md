# Hackathon v2 — 実装状況（このフォルダ）

## 本番エントリ

- **`daily-ai-curator.js`** … 日次キュレーション（キーワード最適化・スコアリング・Supabase v2 upsert・LINE）
- **`monthly-learning-loop.js`** … 直近30日の thinking 集約・月次レポート・LINE

`daily-ai-curator-v2-hackathon.js` は参照用。運用では `daily-ai-curator.js` をそのまま使う。

## データベース

1. Supabase SQL Editor で **`supabase-migration-v2.sql`** を実行（推奨・ビュー・インデックス込み）
2. 最小構成のみなら **`schema/supabase_editor_run_once.sql`** を1ペーストでも可（テーブル＋月次＋RLS）

**upsert** は `onConflict: "url"` のため **`url NOT NULL UNIQUE`** が前提。`service_role` キー推奨。`anon` の場合はマイグレーションの **UPDATE ポリシー**が必要。

## ローカル / CI

- `npm run check-env` … ANTHROPIC + Supabase 必須、LINE は任意表示
- `npm run test:smoke` … `daily_ai_curations_v2` の SELECT 疎通
- `npm run daily` / `npm run monthly` … 本番相当（課金あり）

## GitHub Actions（リポジトリルートに配置する場合）

- `.github/workflows/daily-curator.yml` … 日次
- `.github/workflows/monthly-learning-loop.yml` … 毎月1日 UTC 14:00 + 手動

作業用テンプレ: `../github-workflow-for-repo-root/.github/workflows/`

## まだ手元でやること

- 本番 GitHub リポに `files_unzipped/` と workflows を置き、Secrets を登録
- Render 等で月次を回す場合: `0 14 L * *`（月末）— Actions と二重にならないようどちらかに寄せる

---

## デプロイ手順メモ（2026-04-30 更新）

### ローカル疎通確認結果

| コマンド | 結果 |
| --- | --- |
| `npm install` | ✅ up to date（26 packages） |
| `npm run check-env` | ✅ ANTHROPIC / SUPABASE SET、LINE MISSING（DB-only なら問題なし） |
| `npm run test:smoke` | ✅ `daily_ai_curations_v2` SELECT 疎通確認（0 rows） |
| `npm run daily` | **未実行**（Anthropic API 課金あり。実行前にユーザー確認が必要） |

### SQL ファイルの選択方針

| ファイル | 内容 | 推奨 |
| --- | --- | --- |
| `supabase-migration-v2.sql` | テーブル + インデックス + RLS + 分析ビュー全込み | **← こちらを使う** |
| `schema/supabase_editor_run_once.sql` | テーブル + RLS のみ（ビューなし） | ビュー不要の最小構成のみ |

**理由:** `monthly_learning_summary` / `risk_factor_analysis` 等のビューが月次学習で必要。

### Supabase 実行確認手順

1. Supabase Dashboard → SQL Editor を開く
2. `supabase-migration-v2.sql` を全選択してペースト → Execute
3. 完了後、Table Editor で以下が存在するか確認：
   - `daily_ai_curations_v2`（`url` カラムが NOT NULL UNIQUE）
   - `monthly_learning_reports`
4. Views タブで `monthly_learning_summary` 等が表示されれば完了

**テーブル未実行の見分け方:** `npm run test:smoke` が `daily_ai_curations_v2` で 404 / エラーを返す場合は未実行。

### GitHub Actions デプロイ手順

> **重要:** Actions と Render の cron は**どちらか一方**に寄せる。両方を有効にすると二重実行になる。

**ファイル配置（ワンコマンド想定）**

リポジトリ直下に `files_unzipped/` ディレクトリがある構成で：

```
リポジトリルート/
├── files_unzipped/          ← このディレクトリを push
│   ├── daily-ai-curator.js
│   ├── monthly-learning-loop.js
│   ├── package.json
│   └── ... (その他すべて)
└── .github/
    └── workflows/
        ├── daily-curator.yml           ← github-workflow-for-repo-root からコピー
        ├── monthly-learning-loop.yml   ← 同上
        └── test-email.yml              ← 同上（任意）
```

**コピー元:** `automation-projects/github-workflow-for-repo-root/.github/workflows/`

**登録必須 Secrets（GitHub → Settings → Secrets and variables → Actions）**

| Secret 名 | 必須/任意 | 内容 |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | **必須** | Anthropic API キー |
| `SUPABASE_URL` | **必須** | `https://xxxx.supabase.co` |
| `SUPABASE_KEY` | **必須** | service_role キー（upsert に必要） |
| `LINE_MESSAGING_API_TOKEN` | 任意 | LINE 通知トークン |
| `LINE_USER_ID` | 任意 | LINE ユーザー ID（push 先） |
| `GMAIL_USER` | 任意 | Gmail アドレス |
| `GMAIL_APP_PASSWORD` | 任意 | Google アプリパスワード（16 桁） |
| `NOTIFY_EMAIL_TO` | 任意 | 通知先メール（未設定時は GMAIL_USER） |

**リポジトリ変数（Variables タブ）**

| 変数名 | 値 | 意味 |
| --- | --- | --- |
| `CURATOR_CRON_ENABLED` | `true` | スケジュール実行を有効化。`test:email` 成功後に設定 |

**設定順序（推奨）**

1. Secrets を登録
2. `test-email.yml` を手動実行（Actions UI → Run workflow）して Gmail 疎通確認
3. `CURATOR_CRON_ENABLED = true` を Variables に設定
4. 翌日 07:00 JST に自動実行されることを確認
5. LINE 通知・Supabase データ挿入を目視確認

### スケジュール（再掲）

| ジョブ | cron（UTC） | 日本時間 |
| --- | --- | --- |
| daily-curator | `0 22 * * *` | 毎日 07:00 JST |
| monthly-learning-loop | `0 14 1 * *` | 毎月 1 日 23:00 JST |

### 二重 cron 禁止

- GitHub Actions でスケジュールを入れた場合、Render の Background Job は**停止または削除**する。
- Render で回す場合は、`daily-curator.yml` の `schedule:` 行をコメントアウトして push する。
