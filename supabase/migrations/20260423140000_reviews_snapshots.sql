-- Migração: Tabela de Snapshots de Avaliações (ML + Shopee)
CREATE TABLE IF NOT EXISTS reviews_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plataforma      text NOT NULL,
  conta           text NOT NULL,
  item_id         text NOT NULL,
  item_title      text,
  rating_average  numeric DEFAULT 0,
  total_reviews   int DEFAULT 0,
  stars_1         int DEFAULT 0,
  stars_2         int DEFAULT 0,
  stars_3         int DEFAULT 0,
  stars_4         int DEFAULT 0,
  stars_5         int DEFAULT 0,
  snapshot_date   date NOT NULL DEFAULT CURRENT_DATE,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(plataforma, item_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_reviews_snap_plat_date ON reviews_snapshots (plataforma, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_reviews_snap_item ON reviews_snapshots (item_id);

-- RLS
ALTER TABLE reviews_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY reviews_snap_select ON reviews_snapshots FOR SELECT USING (true);
CREATE POLICY reviews_snap_insert ON reviews_snapshots FOR INSERT WITH CHECK (true);
CREATE POLICY reviews_snap_update ON reviews_snapshots FOR UPDATE USING (true);
