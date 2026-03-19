-- Tabela para armazenar contas do Tiny
-- Execute no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS tiny_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  api_token TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tiny_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read tiny_accounts" ON tiny_accounts FOR SELECT USING (true);
CREATE POLICY "Allow insert tiny_accounts" ON tiny_accounts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update tiny_accounts" ON tiny_accounts FOR UPDATE USING (true);
CREATE POLICY "Allow delete tiny_accounts" ON tiny_accounts FOR DELETE USING (true);

CREATE TRIGGER tiny_accounts_updated_at
  BEFORE UPDATE ON tiny_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Inserir as 3 contas
INSERT INTO tiny_accounts (nome, api_token) VALUES
('Via Flix', 'a3cf090fe96b6609ec1beed4f11e4bf12260114a30b0f6a1991c99f361c7ac01'),
('Gontarek', '3f4e96fd2aae20de1d301d4d0a14b6609685ae0c1e9604d08f4498e8df019da'),
('Monaco', 'e9c2c4b80e75ff0ab654d0f9b39a6ad7dddadc0b2acece03a174fc1361def689');
