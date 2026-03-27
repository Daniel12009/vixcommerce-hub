-- Sync checkpoints for incremental data sync
CREATE TABLE IF NOT EXISTS sync_checkpoints (
  key TEXT PRIMARY KEY,
  last_sync_date TEXT NOT NULL,
  last_sync_at TIMESTAMPTZ DEFAULT NOW(),
  total_records INTEGER DEFAULT 0
);

-- Vendas incremental cache
CREATE TABLE IF NOT EXISTS vendas_cache (
  id TEXT PRIMARY KEY,
  data TEXT,
  conta TEXT,
  sku TEXT,
  valor_total NUMERIC,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendas_cache_data ON vendas_cache(data);
CREATE INDEX IF NOT EXISTS idx_vendas_cache_conta ON vendas_cache(conta);
