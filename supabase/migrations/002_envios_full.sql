-- Tabelas para controle de envios Full (ML)

CREATE TABLE IF NOT EXISTS envios_full (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  envio_numero TEXT,
  data_inicio DATE,
  data_coleta DATE,
  preparado BOOLEAN DEFAULT false,
  coletado BOOLEAN DEFAULT false,
  caixas INTEGER DEFAULT 0,
  conta TEXT,
  local TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS envios_full_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  envio_id UUID NOT NULL REFERENCES envios_full(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  quantidade INTEGER DEFAULT 0
);

-- RLS (public access, no auth)
ALTER TABLE envios_full ENABLE ROW LEVEL SECURITY;
ALTER TABLE envios_full_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all envios_full" ON envios_full FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all envios_full_items" ON envios_full_items FOR ALL USING (true) WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER envios_full_updated_at
  BEFORE UPDATE ON envios_full
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
