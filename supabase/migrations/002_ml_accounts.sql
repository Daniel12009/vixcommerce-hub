-- Tabela para armazenar contas do Mercado Livre
-- Execute no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS ml_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,                        -- Ex: "Via Flix", "GS Torneiras", "Decarion"
  seller_id TEXT,                            -- ID da conta ML (user_id)
  client_id TEXT NOT NULL,                   -- APP_ID
  client_secret TEXT NOT NULL,               -- Client Secret
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies (allow anonymous for now - no auth yet)
ALTER TABLE ml_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read ml_accounts" ON ml_accounts FOR SELECT USING (true);
CREATE POLICY "Allow insert ml_accounts" ON ml_accounts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update ml_accounts" ON ml_accounts FOR UPDATE USING (true);
CREATE POLICY "Allow delete ml_accounts" ON ml_accounts FOR DELETE USING (true);

-- Trigger updated_at
CREATE TRIGGER ml_accounts_updated_at
  BEFORE UPDATE ON ml_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
