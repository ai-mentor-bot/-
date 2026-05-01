-- Daily AI Curator v2 - Supabase テーブルマイグレーション
-- thinking データと学習用プロセスを保存

-- ============================================
-- Phase 1 + Phase 2 統合版テーブル
-- ============================================

-- url NOT NULL: JS の .upsert(..., { onConflict: "url" }) と整合
-- breakdown: アプリは axis_breakdown 全体（*_reason 含む）を JSONB で保存可
CREATE TABLE IF NOT EXISTS daily_ai_curations_v2 (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- 基本情報
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  
  -- Hackathon統合スコアリング
  total_score INTEGER NOT NULL CHECK (total_score >= 0 AND total_score <= 100),
  
  -- 4軸スコア詳細（JSON）
  breakdown JSONB DEFAULT '{"adoption_score":0,"revenue_score":0,"scalability_score":0,"compatibility_score":0}'::jsonb,
  
  -- Hackathon設定：信頼度スコア
  confidence DECIMAL(3, 2) DEFAULT 0.0 CHECK (confidence >= 0 AND confidence <= 1),
  
  -- 判定結果
  applicable_business TEXT[],
  risk_factors TEXT[],
  implementation_complexity TEXT CHECK (implementation_complexity IN ('LOW', 'MEDIUM', 'HIGH')),
  priority TEXT CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
  
  -- Hackathon設定：思考プロセス（学習用）
  thinking_summary TEXT,
  thinking_process TEXT,  -- 全量保存（月次分析用）
  
  -- メタデータ
  saved_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- インデックス（クエリ最適化）
-- ============================================

CREATE INDEX IF NOT EXISTS idx_v2_category ON daily_ai_curations_v2(category);
CREATE INDEX IF NOT EXISTS idx_v2_score ON daily_ai_curations_v2(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_v2_confidence ON daily_ai_curations_v2(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_v2_priority ON daily_ai_curations_v2(priority);
CREATE INDEX IF NOT EXISTS idx_v2_saved_date ON daily_ai_curations_v2(saved_at DESC);
CREATE INDEX IF NOT EXISTS idx_v2_complexity ON daily_ai_curations_v2(implementation_complexity);
CREATE UNIQUE INDEX IF NOT EXISTS idx_v2_unique_title_per_day
  ON daily_ai_curations_v2 (title, ((saved_at::date)));

-- ============================================
-- RLS設定（Row Level Security）
-- ============================================

ALTER TABLE daily_ai_curations_v2 ENABLE ROW LEVEL SECURITY;

-- すべてのユーザーが読み取り可能
DROP POLICY IF EXISTS "allow_select_v2" ON daily_ai_curations_v2;
CREATE POLICY "allow_select_v2" ON daily_ai_curations_v2
  FOR SELECT USING (true);

-- 認証済みユーザーが挿入可能
DROP POLICY IF EXISTS "allow_insert_v2" ON daily_ai_curations_v2;
CREATE POLICY "allow_insert_v2" ON daily_ai_curations_v2
  FOR INSERT WITH CHECK (true);

-- upsert（ON CONFLICT DO UPDATE）は UPDATE 権限が要る。service_role は RLS バイパス。
DROP POLICY IF EXISTS "allow_update_v2" ON daily_ai_curations_v2;
CREATE POLICY "allow_update_v2" ON daily_ai_curations_v2
  FOR UPDATE USING (true) WITH CHECK (true);

-- ============================================
-- 月次学習レポートテーブル
-- ============================================

CREATE TABLE IF NOT EXISTS monthly_learning_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month TEXT NOT NULL,
  report_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monthly_reports_month ON monthly_learning_reports(month);

ALTER TABLE monthly_learning_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_select_monthly_reports" ON monthly_learning_reports;
CREATE POLICY "allow_select_monthly_reports" ON monthly_learning_reports
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "allow_insert_monthly_reports" ON monthly_learning_reports;
CREATE POLICY "allow_insert_monthly_reports" ON monthly_learning_reports
  FOR INSERT WITH CHECK (true);

-- ============================================
-- ビュー：月次学習分析用
-- ============================================

CREATE OR REPLACE VIEW monthly_learning_summary AS
SELECT 
  category,
  DATE_TRUNC('month', saved_at) as month,
  COUNT(*) as articles_count,
  AVG(total_score) as avg_score,
  MAX(total_score) as max_score,
  AVG(confidence) as avg_confidence,
  COUNT(CASE WHEN priority = 'HIGH' THEN 1 END) as high_priority_count
FROM daily_ai_curations_v2
GROUP BY category, DATE_TRUNC('month', saved_at)
ORDER BY month DESC, avg_score DESC;

-- ============================================
-- ビュー：リスク因子分析
-- ============================================

CREATE OR REPLACE VIEW risk_factor_analysis AS
SELECT 
  unnest(risk_factors) as risk_factor,
  COUNT(*) as occurrences,
  AVG(total_score) as avg_score_with_this_risk
FROM daily_ai_curations_v2
WHERE risk_factors IS NOT NULL AND array_length(risk_factors, 1) > 0
GROUP BY risk_factor
ORDER BY occurrences DESC;

-- ============================================
-- ビュー：実装難度別分析
-- ============================================

CREATE OR REPLACE VIEW implementation_analysis AS
SELECT 
  implementation_complexity,
  COUNT(*) as count,
  AVG(total_score) as avg_score,
  AVG(confidence) as avg_confidence,
  COUNT(CASE WHEN priority = 'HIGH' THEN 1 END) as high_priority_count
FROM daily_ai_curations_v2
GROUP BY implementation_complexity
ORDER BY avg_score DESC;

-- ============================================
-- ビュー：信頼度スコア分布（品質管理用）
-- ============================================

CREATE OR REPLACE VIEW confidence_distribution AS
SELECT 
  CASE 
    WHEN confidence >= 0.9 THEN '90%以上（極高）'
    WHEN confidence >= 0.75 THEN '75-90%（高）'
    WHEN confidence >= 0.6 THEN '60-75%（中）'
    ELSE '60%未満（低）'
  END as confidence_bracket,
  COUNT(*) as count,
  AVG(total_score) as avg_score
FROM daily_ai_curations_v2
GROUP BY 
  CASE 
    WHEN confidence >= 0.9 THEN 0
    WHEN confidence >= 0.75 THEN 1
    WHEN confidence >= 0.6 THEN 2
    ELSE 3
  END
ORDER BY count DESC;

-- ============================================
-- 旧テーブル（v1）からのマイグレーション手順
-- ============================================

-- 既存データをv2に移行する場合：
/*
INSERT INTO daily_ai_curations_v2 
  (title, url, category, total_score, breakdown, applicable_business, priority, saved_at)
SELECT 
  title, 
  url, 
  category, 
  total_score, 
  breakdown, 
  applicable_business,
  CASE 
    WHEN total_score >= 85 THEN 'HIGH'
    WHEN total_score >= 80 THEN 'MEDIUM'
    ELSE 'LOW'
  END,
  saved_at
FROM daily_ai_curations
WHERE saved_at > NOW() - INTERVAL '30 days'
ON CONFLICT (url) DO NOTHING;
*/

-- ============================================
-- 月次学習クエリテンプレート
-- ============================================

-- 【月次実行】スコア精度の検証
/*
SELECT 
  category,
  total_score,
  confidence,
  priority,
  thinking_summary
FROM daily_ai_curations_v2
WHERE saved_at > NOW() - INTERVAL '30 days'
ORDER BY total_score DESC
LIMIT 20;
*/

-- 【月次実行】リスク因子の分析
/*
SELECT * FROM risk_factor_analysis LIMIT 10;
*/

-- 【月次実行】信頼度スコア品質管理
/*
SELECT * FROM confidence_distribution;
*/

-- ============================================
-- パフォーマンスチューニング
-- ============================================

-- 統計情報の更新（月1回推奨）
-- ANALYZE daily_ai_curations_v2;

-- テーブルの最適化（月1回推奨）
-- VACUUM ANALYZE daily_ai_curations_v2;

-- ============================================
-- 注記
-- ============================================

-- thinking_process カラムについて：
-- - 月次分析後は、古いデータを自動削除して容量を最適化することを推奨
-- - パターン学習後は encrypted backup を推奨

-- 信頼度スコアについて：
-- - 0.9以上：実装決定で確信度が高い
-- - 0.6-0.9：追加調査が必要
-- - 0.6未満：専門家レビュー推奨
