-- Ativa as extensões necessárias (idempotente)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Armazena URL e chave nas configurações do banco (só precisa rodar uma vez)
-- Substitua os valores abaixo com os dados reais do seu projeto
ALTER DATABASE postgres SET app.supabase_url = 'https://mbxpkqhjapmhehdngfaj.supabase.co';
ALTER DATABASE postgres SET app.service_role_key = 'SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER';

-- Remove versão anterior do job (idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-sync-6am') THEN
    PERFORM cron.unschedule('daily-sync-6am');
  END IF;
END $$;

-- Agenda execução diária às 09:00 UTC = 06:00 BRT
SELECT cron.schedule(
  'daily-sync-6am',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/daily-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
