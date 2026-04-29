ALTER TABLE public.daily_sales_snapshots ADD COLUMN IF NOT EXISTS vendas_detalhadas_sku jsonb NOT NULL DEFAULT '[]'::jsonb;
NOTIFY pgrst, 'reload schema';