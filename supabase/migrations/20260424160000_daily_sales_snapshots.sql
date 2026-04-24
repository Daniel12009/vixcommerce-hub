-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create daily_sales_snapshots table
CREATE TABLE IF NOT EXISTS public.daily_sales_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_referencia DATE UNIQUE NOT NULL,
  vendas_por_hora JSONB NOT NULL,
  total_faturamento NUMERIC NOT NULL DEFAULT 0,
  total_pedidos INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.daily_sales_snapshots ENABLE ROW LEVEL SECURITY;

-- Allow all to read (authenticated)
CREATE POLICY "Allow authenticated select snapshots" ON public.daily_sales_snapshots
  FOR SELECT TO authenticated USING (true);

-- Allow service role to insert/update
CREATE POLICY "Allow service_role full access snapshots" ON public.daily_sales_snapshots
  FOR ALL TO service_role USING (true);

-- Schedule daily snapshot job (using pg_cron)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'save-daily-sales-snapshot') THEN
    PERFORM cron.unschedule('save-daily-sales-snapshot');
  END IF;
END $$;

-- 23:55 São Paulo = 02:55 UTC (assumindo que o banco está em UTC)
-- Se o banco estiver no horário de Brasília, 23:55 * * *
-- Vamos usar 02:55 UTC para garantir.
SELECT cron.schedule(
  'save-daily-sales-snapshot',
  '55 2 * * *', 
  $$
  SELECT
    net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/save-daily-snapshot',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := jsonb_build_object('action', 'save_snapshot')
    ) as request_id;
  $$
);

