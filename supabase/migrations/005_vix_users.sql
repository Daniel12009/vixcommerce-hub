-- Tabela de usuários do sistema VixPainel
-- Execute no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS vix_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nome TEXT NOT NULL DEFAULT '',
  setor TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'viewer', -- admin, manager, viewer
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE vix_users ENABLE ROW LEVEL SECURITY;

-- Policies: allow anonymous access (auth is app-level, not Supabase auth)
CREATE POLICY "Allow read vix_users" ON vix_users FOR SELECT USING (true);
CREATE POLICY "Allow insert vix_users" ON vix_users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update vix_users" ON vix_users FOR UPDATE USING (true);
CREATE POLICY "Allow delete vix_users" ON vix_users FOR DELETE USING (true);

-- Trigger updated_at
CREATE TRIGGER vix_users_updated_at
  BEFORE UPDATE ON vix_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Seed: primeiro usuário ADMIN / ROOT
-- Password hash for 'ROOT' using simple bcrypt-like approach (we'll hash in the app)
-- For now, store plaintext and hash on first login check
INSERT INTO vix_users (username, password_hash, nome, setor, role)
VALUES ('ADMIN', 'ROOT', 'Administrador', 'TI', 'admin')
ON CONFLICT (username) DO NOTHING;
