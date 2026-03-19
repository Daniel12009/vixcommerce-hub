-- Tabela genérica para armazenar configurações e dados da aplicação
-- Execute este SQL no Supabase SQL Editor (https://supabase.com/dashboard)

CREATE TABLE IF NOT EXISTS app_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  data_key TEXT UNIQUE NOT NULL,
  data_value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS and allow anonymous access (no auth system yet)
ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read" ON app_data FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert" ON app_data FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update" ON app_data FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete" ON app_data FOR DELETE USING (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER app_data_updated_at
  BEFORE UPDATE ON app_data
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
