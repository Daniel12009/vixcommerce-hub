ALTER TABLE public.daily_sales_snapshots
  ADD COLUMN IF NOT EXISTS por_conta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS por_sku_vendas jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS por_sku_faturamento jsonb NOT NULL DEFAULT '{}'::jsonb;