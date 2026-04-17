-- Create estoque_snapshots table
CREATE TABLE IF NOT EXISTS public.estoque_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_ref DATE NOT NULL DEFAULT CURRENT_DATE,
    sku TEXT NOT NULL,
    conta TEXT NOT NULL,
    quantidade NUMBER NOT NULL DEFAULT 0,
    entrada_pendente NUMBER NOT NULL DEFAULT 0,
    em_transferencia NUMBER NOT NULL DEFAULT 0,
    vmd_calculado NUMBER NOT NULL DEFAULT 0,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(data_ref, sku, conta)
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_estoque_snapshots_data ON public.estoque_snapshots(data_ref);
CREATE INDEX IF NOT EXISTS idx_estoque_snapshots_sku ON public.estoque_snapshots(sku);

-- RLS
ALTER TABLE public.estoque_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to authenticated users" ON public.estoque_snapshots
    FOR ALL USING (auth.role() = 'authenticated');

COMMENT ON TABLE public.estoque_snapshots IS 'Stores daily end-of-day snapshots of stock levels per SKU and account for historical analysis.';
