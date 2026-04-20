-- Migração: Filas e Tabelas Base para Bot de Atendimento Shopee
-- Fila de perguntas Shopee
CREATE TABLE IF NOT EXISTS shopee_questions_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         text NOT NULL,
  question_id     bigint UNIQUE NOT NULL,
  item_id         bigint NOT NULL,
  question_text   text NOT NULL,
  buyer_id        bigint,
  date_created    timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','auto_answered','manually_answered','ignored','error','suggested')),
  suggested_answer text,
  final_answer    text,
  answered_at     timestamptz,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shopee_q_shop_status ON shopee_questions_queue (shop_id, status);

-- Fila de mensagens de chat Shopee
CREATE TABLE IF NOT EXISTS shopee_chat_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         text NOT NULL,
  conversation_id text NOT NULL,
  message_id      text UNIQUE NOT NULL,
  buyer_id        bigint NOT NULL,
  buyer_name      text,
  message_text    text NOT NULL,
  order_sn        text,
  date_created    timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','auto_answered','manually_answered','ignored','error','suggested')),
  suggested_answer text,
  final_answer    text,
  answered_at     timestamptz,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shopee_chat_shop_status ON shopee_chat_queue (shop_id, status);

-- RLS
ALTER TABLE shopee_questions_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopee_chat_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_all ON shopee_questions_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_all ON shopee_chat_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- CRON JOBS (Comentados/Desativados por padrão; o bot manage-cron/frontend vai instanciá-los via schedule dinamicamente ou podem ser descomentados aqui)
/*
SELECT cron.schedule('shopee-fetch-questions', '*/10 * * * *', $$SELECT net.http_post(url := 'https://mbxpkqhjapmhehdngfaj.supabase.co/functions/v1/shopee-fetch-questions', headers := '{"Authorization": "Bearer SEU_ANON_KEY"}'::jsonb)$$);
SELECT cron.schedule('shopee-auto-answer', '5-59/10 * * * *', $$SELECT net.http_post(url := 'https://mbxpkqhjapmhehdngfaj.supabase.co/functions/v1/shopee-auto-answer', headers := '{"Authorization": "Bearer SEU_ANON_KEY"}'::jsonb)$$);
SELECT cron.schedule('shopee-fetch-chat', '*/5 * * * *', $$SELECT net.http_post(url := 'https://mbxpkqhjapmhehdngfaj.supabase.co/functions/v1/shopee-fetch-chat', headers := '{"Authorization": "Bearer SEU_ANON_KEY"}'::jsonb)$$);
SELECT cron.schedule('shopee-auto-chat', '2-59/5 * * * *', $$SELECT net.http_post(url := 'https://mbxpkqhjapmhehdngfaj.supabase.co/functions/v1/shopee-auto-chat', headers := '{"Authorization": "Bearer SEU_ANON_KEY"}'::jsonb)$$);
*/
