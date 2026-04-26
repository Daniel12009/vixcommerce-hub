CREATE TABLE IF NOT EXISTS public.daily_sales_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_referencia date NOT NULL UNIQUE,
  vendas_por_hora jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_faturamento numeric NOT NULL DEFAULT 0,
  total_pedidos integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_sales_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all daily_sales_snapshots"
  ON public.daily_sales_snapshots FOR ALL
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_daily_sales_snapshots_date
  ON public.daily_sales_snapshots(data_referencia DESC);