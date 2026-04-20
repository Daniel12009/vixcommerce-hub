-- Migração: Ajuste de Schema e RLS para Filas Shopee
-- Adiciona coluna de nome do comprador para perguntas
ALTER TABLE shopee_questions_queue ADD COLUMN IF NOT EXISTS buyer_name text;

-- Corrige/Refina RLS para garantir visibilidade no Dashboard
-- Remove políticas genéricas se existirem para evitar conflitos
DROP POLICY IF EXISTS auth_all ON shopee_questions_queue;
DROP POLICY IF EXISTS auth_all ON shopee_chat_queue;

-- Cria políticas explícitas de SELECT
CREATE POLICY shopee_questions_select ON shopee_questions_queue FOR SELECT TO authenticated USING (true);
CREATE POLICY shopee_chat_select ON shopee_chat_queue FOR SELECT TO authenticated USING (true);

-- Mantém permissões de INSERT/UPDATE apenas para authenticated por enquanto (robôs usam service_role)
CREATE POLICY shopee_questions_insert ON shopee_questions_queue FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY shopee_questions_update ON shopee_questions_queue FOR UPDATE TO authenticated USING (true);

CREATE POLICY shopee_chat_insert ON shopee_chat_queue FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY shopee_chat_update ON shopee_chat_queue FOR UPDATE TO authenticated USING (true);
