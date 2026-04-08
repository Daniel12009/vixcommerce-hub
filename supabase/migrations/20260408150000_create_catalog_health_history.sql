CREATE TABLE IF NOT EXISTS public.catalog_health_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conta TEXT NOT NULL,
    mlb_id TEXT NOT NULL,
    health NUMERIC(4,2) NOT NULL DEFAULT 0,
    health_actions JSONB DEFAULT '[]'::jsonb,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (conta, mlb_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_catalog_health_conta ON public.catalog_health_history (conta);
CREATE INDEX IF NOT EXISTS idx_catalog_health_date ON public.catalog_health_history (snapshot_date);

ALTER TABLE public.catalog_health_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read" ON public.catalog_health_history FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert" ON public.catalog_health_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update" ON public.catalog_health_history FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete" ON public.catalog_health_history FOR DELETE USING (true);
