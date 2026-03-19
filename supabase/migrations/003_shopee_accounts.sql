-- Tabela para armazenar contas da Shopee
-- Execute no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS shopee_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  partner_id TEXT NOT NULL,
  partner_key TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE shopee_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read shopee_accounts" ON shopee_accounts FOR SELECT USING (true);
CREATE POLICY "Allow insert shopee_accounts" ON shopee_accounts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update shopee_accounts" ON shopee_accounts FOR UPDATE USING (true);
CREATE POLICY "Allow delete shopee_accounts" ON shopee_accounts FOR DELETE USING (true);

CREATE TRIGGER shopee_accounts_updated_at
  BEFORE UPDATE ON shopee_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
