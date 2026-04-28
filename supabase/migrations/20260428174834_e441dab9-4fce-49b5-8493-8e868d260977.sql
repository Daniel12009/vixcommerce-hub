ALTER TABLE public.daily_sales_snapshots
ADD COLUMN IF NOT EXISTS vendas_detalhadas jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.daily_sales_snapshots.vendas_detalhadas IS
'Array de {hora, plataforma, canal, conta, faturamento, pedidos} para permitir aplicação retroativa de filtros nos gráficos do dashboard.';