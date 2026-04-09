-- =====================================================
-- ML Questions Bot — Migration
-- Run in Supabase SQL Editor
-- =====================================================

-- 1. Templates de resposta automática
CREATE TABLE IF NOT EXISTS ml_answer_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id    text NOT NULL,
  title        text NOT NULL,
  keywords     text[] NOT NULL DEFAULT '{}',
  answer_text  text NOT NULL CHECK (char_length(answer_text) <= 2000),
  active       boolean NOT NULL DEFAULT true,
  use_count    int NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ml_answer_templates_seller ON ml_answer_templates (seller_id);

-- 2. Fila de perguntas
CREATE TABLE IF NOT EXISTS ml_questions_queue (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id         text NOT NULL,
  question_id       bigint UNIQUE NOT NULL,
  item_id           text NOT NULL,
  buyer_id          bigint,
  question_text     text NOT NULL,
  date_created      timestamptz NOT NULL,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','auto_answered','manually_answered','ignored','error')),
  match_template_id uuid REFERENCES ml_answer_templates(id),
  match_score       float,
  suggested_answer  text,
  final_answer      text,
  answered_at       timestamptz,
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ml_questions_queue_seller_status ON ml_questions_queue (seller_id, status);
CREATE INDEX IF NOT EXISTS idx_ml_questions_queue_seller_date ON ml_questions_queue (seller_id, date_created DESC);

-- 3. Log de respostas enviadas
CREATE TABLE IF NOT EXISTS ml_answers_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id       bigint NOT NULL,
  seller_id         text NOT NULL,
  answer_text       text NOT NULL,
  answer_type       text NOT NULL CHECK (answer_type IN ('auto','manual','ai_suggested')),
  template_id       uuid REFERENCES ml_answer_templates(id),
  response_time_min int,
  sent_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ml_answers_log_seller ON ml_answers_log (seller_id);

-- 4. Configuração do robô por seller
CREATE TABLE IF NOT EXISTS ml_bot_config (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id    text UNIQUE NOT NULL,
  mode         text NOT NULL DEFAULT 'learning'
               CHECK (mode IN ('learning', 'active')),
  min_score    float NOT NULL DEFAULT 0.70,
  activated_at timestamptz,
  activated_by uuid REFERENCES auth.users(id),
  paused_at    timestamptz,
  manual_count int NOT NULL DEFAULT 0,
  auto_count   int NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 5. Concorrentes monitorados para análise de IA
CREATE TABLE IF NOT EXISTS ml_competitor_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id  text NOT NULL,
  item_id    text NOT NULL,
  label      text NOT NULL,
  category   text,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_ml_competitor_items_seller ON ml_competitor_items (seller_id);

-- =====================================================
-- RLS Policies
-- =====================================================
ALTER TABLE ml_answer_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_questions_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_answers_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_bot_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_competitor_items ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access (service role bypasses RLS)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ml_answer_templates' AND policyname='auth_all') THEN
    CREATE POLICY auth_all ON ml_answer_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ml_questions_queue' AND policyname='auth_all') THEN
    CREATE POLICY auth_all ON ml_questions_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ml_answers_log' AND policyname='auth_all') THEN
    CREATE POLICY auth_all ON ml_answers_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ml_bot_config' AND policyname='auth_all') THEN
    CREATE POLICY auth_all ON ml_bot_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ml_competitor_items' AND policyname='auth_all') THEN
    CREATE POLICY auth_all ON ml_competitor_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- =====================================================
-- Cron Jobs (pg_cron) — execute after enabling the extension
-- Run separately after enabling pg_cron in Supabase Dashboard
-- =====================================================
-- SELECT cron.schedule(
--   'ml-fetch-questions',
--   '*/10 * * * *',
--   $$ SELECT net.http_post(
--     url := current_setting('app.supabase_url') || '/functions/v1/ml-fetch-questions',
--     headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
--   ) $$
-- );
--
-- SELECT cron.schedule(
--   'ml-auto-answer',
--   '1-59/10 * * * *',
--   $$ SELECT net.http_post(
--     url := current_setting('app.supabase_url') || '/functions/v1/ml-auto-answer',
--     headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
--   ) $$
-- );
