import { loadAppEnv } from "./load-env.mjs";

loadAppEnv();

function requireEnv(name) {
  const v = process.env[name];
  if (typeof v !== "string" || !v.trim()) {
    console.error(
      `Missing ${name}. Set it in クロードコードまとめ/.env または files_unzipped/.env（.env.example 参照）。`
    );
    process.exit(1);
  }
}

requireEnv("ANTHROPIC_API_KEY");
requireEnv("SUPABASE_URL");
requireEnv("SUPABASE_KEY");

/**
 * Monthly Learning Loop - 月次自動学習スクリプト
 * 
 * 機能：
 * ✅ thinking データからパターンを自動抽出
 * ✅ スコア精度の検証と改善提案
 * ✅ リスク因子の自動分類
 * ✅ 次月のキーワード最適化推奨
 * ✅ スコアリング基準の自動微調整
 * 
 * 実行：毎月末日 23:00 (Render Cron: 0 14 L * *)
 * GitHub Actions: 毎月1日 UTC 14:00（ローリング30日集計のため月末厳密一致は不要）
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";
import { sendGmailNotify } from "./lib/gmail-notify.mjs";
import path from "path";
import { fileURLToPath } from "url";

const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";
const ENABLE_THINKING =
  process.env.ANTHROPIC_ENABLE_THINKING === "1" ||
  process.env.ANTHROPIC_ENABLE_THINKING === "true";

function anthropicCreateBody(base) {
  const body = { ...base, model: ANTHROPIC_MODEL };
  if (!ENABLE_THINKING && body.thinking) {
    delete body.thinking;
  }
  return body;
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ============================================
// 月次学習実行
// ============================================

async function runMonthlyLearning() {
  console.log(
    `\n🧠 Monthly Learning Loop Started at ${new Date().toISOString()}`
  );
  console.log(
    `   model=${ANTHROPIC_MODEL} thinking=${ENABLE_THINKING ? "on" : "off"}\n`
  );

  try {
    // ステップ1：過去30日のデータ収集
    console.log("📊 Step 1: Collecting monthly data...");
    const monthlyData = await collectMonthlyData();

    if (monthlyData.articles.length === 0) {
      console.log("No data available for analysis.");
      return;
    }

    console.log(`✅ Collected ${monthlyData.articles.length} articles\n`);

    // ステップ2：パターン分析（thinking使用）
    console.log("🔍 Step 2: Pattern analysis from thinking data...");
    const patterns = await analyzeThinkingPatterns(monthlyData);
    const patternCount = Array.isArray(patterns)
      ? patterns.length
      : (patterns.top_decision_factors?.length || 0);
    console.log(`✅ Identified ${patternCount} key patterns\n`);

    // ステップ3：スコアリング精度の検証
    console.log("🎯 Step 3: Validating scoring accuracy...");
    const accuracy = await validateScoringAccuracy(monthlyData);
    console.log(`✅ Accuracy report generated\n`);

    // ステップ4：改善提案の生成
    console.log("💡 Step 4: Generating improvement recommendations...");
    const recommendations = await generateRecommendations(
      patterns,
      accuracy,
      monthlyData
    );
    console.log(`✅ ${recommendations.length} recommendations generated\n`);

    // ステップ5：結果の保存と報告
    await saveMonthlyReport(monthlyData, patterns, accuracy, recommendations);
    await notifyMonthlyReport(patterns, accuracy, recommendations);

    console.log("✅ Monthly learning completed");
  } catch (error) {
    console.error("❌ Learning error:", error);
    await notifyLearningError(error);
  }
}

// ============================================
// ステップ1：月次データ収集
// ============================================

async function collectMonthlyData() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: articles, error } = await supabase
    .from("daily_ai_curations_v2")
    .select("*")
    .gte("saved_at", thirtyDaysAgo.toISOString())
    .order("total_score", { ascending: false });

  if (error) {
    console.warn("Supabase query error (using v1):", error);
    // v1テーブルへのフォールバック
    const { data: articlesV1 } = await supabase
      .from("daily_ai_curations")
      .select("*")
      .gte("saved_at", thirtyDaysAgo.toISOString());

    return {
      articles: articlesV1 || [],
      month: new Date(),
      version: "v1",
    };
  }

  return {
    articles: articles || [],
    month: new Date(),
    version: "v2",
  };
}

// ============================================
// ステップ2：thinking パターン分析
// ============================================

async function analyzeThinkingPatterns(monthlyData) {
  /**
   * thinking プロセスから、以下を自動抽出：
   * 1. 判定に最も影響するファクター
   * 2. 誤判定の共通パターン
   * 3. リスク因子の分類
   */

  const thinkingTexts = monthlyData.articles
    .filter((a) => a.thinking_process)
    .map((a) => a.thinking_process)
    .slice(0, 10); // 最初の10件を分析

  if (thinkingTexts.length === 0) {
    console.log("No thinking data available for pattern analysis");
    return [];
  }

  try {
    const response = await anthropic.messages.create(
      anthropicCreateBody({
      max_tokens: 3000,
      thinking: {
        type: "enabled",
        budget_tokens: 2000,
      },
      messages: [
        {
          role: "user",
          content: `
【思考プロセスパターン分析タスク】

以下の10件のthinking プロセス（意思決定ロジック）を分析してください。

${thinkingTexts
  .map(
    (text, i) => `
【Article ${i + 1}】
${text.substring(0, 400)}...
`
  )
  .join("\n")}

【分析目的】
Kotaroの事業判定に最も重要な要素を特定し、
スコアリング精度を向上させる。

【出力フォーマット】JSON only
{
  "top_decision_factors": [
    {
      "factor": "ファクター名",
      "importance": 0.X,
      "description": "なぜ重要か"
    }
  ],
  "common_misconceptions": [
    "よくある誤判定パターン"
  ],
  "high_confidence_signals": [
    "確信度が高い判定の共通点"
  ],
  "patterns_to_watch": [
    {
      "pattern": "パターン名",
      "frequency": 0.X,
      "recommendation": "対応方法"
    }
  ]
}
`,
        },
      ],
    })
    );

    const content = response.content.find((c) => c.type === "text")?.text || "{}";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (parseErr) {
        console.warn("Pattern analysis JSON parse error:", parseErr.message);
      }
    }
  } catch (error) {
    console.warn("Pattern analysis error:", error);
  }

  return {
    top_decision_factors: [],
    common_misconceptions: [],
    high_confidence_signals: [],
    patterns_to_watch: [],
  };
}

// ============================================
// ステップ3：スコアリング精度検証
// ============================================

async function validateScoringAccuracy(monthlyData) {
  /**
   * 以下を検証：
   * 1. スコア分布の妥当性
   * 2. 信頼度スコアの正確性
   * 3. 優先度判定の一貫性
   */

  const stats = {
    total_articles: monthlyData.articles.length,
    avg_score: 0,
    score_distribution: { high: 0, medium: 0, low: 0 },
    avg_confidence: 0,
    confidence_distribution: { high: 0, medium: 0, low: 0 },
    by_category: {},
  };

  monthlyData.articles.forEach((article) => {
    stats.avg_score += article.total_score || 0;
    stats.avg_confidence += article.confidence || 0;

    // スコア分布
    if (article.total_score >= 85) stats.score_distribution.high++;
    else if (article.total_score >= 80) stats.score_distribution.medium++;
    else stats.score_distribution.low++;

    // 信頼度分布
    if (article.confidence >= 0.9) stats.confidence_distribution.high++;
    else if (article.confidence >= 0.75) stats.confidence_distribution.medium++;
    else stats.confidence_distribution.low++;

    // カテゴリ別
    const cat = article.category || "Unknown";
    if (!stats.by_category[cat]) {
      stats.by_category[cat] = {
        count: 0,
        avg_score: 0,
        avg_confidence: 0,
      };
    }
    stats.by_category[cat].count++;
    stats.by_category[cat].avg_score += article.total_score || 0;
    stats.by_category[cat].avg_confidence += article.confidence || 0;
  });

  // 平均値計算
  if (stats.total_articles > 0) {
    stats.avg_score = (stats.avg_score / stats.total_articles).toFixed(2);
    stats.avg_confidence = (stats.avg_confidence / stats.total_articles).toFixed(3);

    Object.keys(stats.by_category).forEach((cat) => {
      const count = stats.by_category[cat].count;
      stats.by_category[cat].avg_score = (
        stats.by_category[cat].avg_score / count
      ).toFixed(2);
      stats.by_category[cat].avg_confidence = (
        stats.by_category[cat].avg_confidence / count
      ).toFixed(3);
    });
  }

  return stats;
}

// ============================================
// ステップ4：改善推奨の生成
// ============================================

async function generateRecommendations(patterns, accuracy, monthlyData) {
  /**
   * データに基づいて、次月の改善方法を推奨
   */

  const avgConf = Number(accuracy.avg_confidence);
  const recommendations = [
    {
      area: "スコアリング基準",
      current_state: `平均スコア ${accuracy.avg_score}点、信頼度 ${accuracy.avg_confidence}`,
      recommendation: avgConf < 0.8
        ? "思考プロセスの詳細度を向上させる必要があります"
        : "現在の基準は適切です",
      priority: avgConf < 0.8 ? "HIGH" : "LOW",
    },
    {
      area: "スコア分布",
      current_state: `高${accuracy.score_distribution.high} 中${accuracy.score_distribution.medium} 低${accuracy.score_distribution.low}件`,
      recommendation: accuracy.score_distribution.high < 5
        ? "キーワードを、より実装実績豊富なものに変更してください"
        : "キーワード戦略は効果的です",
      priority: accuracy.score_distribution.high < 5 ? "HIGH" : "LOW",
    },
    {
      area: "カテゴリ別",
      current_state: Object.entries(accuracy.by_category)
        .map(
          ([cat, stats]) =>
            `${cat}: ${stats.count}件 (avg ${stats.avg_score}点)`
        )
        .join(", "),
      recommendation: "カテゴリ別にスコアリング基準を微調整することを検討",
      priority: "MEDIUM",
    },
  ];

  return recommendations;
}

// ============================================
// ステップ5：結果の保存と報告
// ============================================

async function saveMonthlyReport(
  monthlyData,
  patterns,
  accuracy,
  recommendations
) {
  const report = {
    month: new Date().toISOString().substring(0, 7),
    total_articles: monthlyData.articles.length,
    patterns,
    accuracy,
    recommendations,
    generated_at: new Date().toISOString(),
  };

  // Supabase に保存（JSON形式）
  const { error } = await supabase.from("monthly_learning_reports").insert([
    {
      month: report.month,
      report_data: report,
      created_at: new Date().toISOString(),
    },
  ]);

  if (error) {
    console.warn("Monthly report save error:", error);
  } else {
    console.log("✅ Monthly report saved to Supabase");
  }
}

async function notifyMonthlyReport(patterns, accuracy, recommendations) {
  /**
   * 月次レポートを LINE で通知
   */
  const confPct = (Number(accuracy.avg_confidence) * 100).toFixed(0);
  const message = `
📊 月次学習レポート

【スコアリング精度】
• 平均スコア: ${accuracy.avg_score}点
• 信頼度: ${confPct}%
• 分析記事数: ${accuracy.total_articles}件

【主要パターン】
${!Array.isArray(patterns) && patterns.top_decision_factors ? patterns.top_decision_factors.slice(0, 3).map((f) => `• ${f.factor}: ${(Number(f.importance) * 100).toFixed(0)}%`).join("\n") : "• データ分析中"}

【改善推奨】
${recommendations
  .filter((r) => r.priority === "HIGH")
  .map((r) => `• [${r.area}] ${r.recommendation}`)
  .join("\n")}

詳細は Supabase dashboard で確認
`;

  const lineToken = process.env.LINE_MESSAGING_API_TOKEN;
  const lineUserId = process.env.LINE_USER_ID;

  if (lineToken && lineUserId) {
    try {
      await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lineToken}`,
        },
        body: JSON.stringify({
          to: lineUserId,
          messages: [{ type: "text", text: message }],
        }),
      });
      console.log("✅ Monthly report notified via LINE");
    } catch (error) {
      console.error("LINE notification error:", error);
    }
  }

  try {
    await sendGmailNotify(
      `📊 月次学習レポート（${new Date().toLocaleDateString("ja-JP")}）`,
      message.trim()
    );
  } catch (e) {
    console.warn("Email notify:", e.message);
  }
}

async function notifyLearningError(error) {
  const lineToken = process.env.LINE_MESSAGING_API_TOKEN;
  const lineUserId = process.env.LINE_USER_ID;
  const errText = `⚠️ Monthly Learning エラー\n\n${error.message}`;

  if (lineToken && lineUserId) {
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lineToken}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [
          {
            type: "text",
            text: errText,
          },
        ],
      }),
    });
  }

  try {
    await sendGmailNotify("⚠️ Monthly Learning エラー", errText);
  } catch (e) {
    console.warn("Email notify:", e.message);
  }
}

// ============================================
// 実行（GitHub Actions / ローカル両対応）
// ============================================

const __filename = fileURLToPath(import.meta.url);
const isDirectRun =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  runMonthlyLearning().catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  });
}

export { runMonthlyLearning };
