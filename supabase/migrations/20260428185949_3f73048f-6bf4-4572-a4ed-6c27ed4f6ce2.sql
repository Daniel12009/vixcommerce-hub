-- Agendar snapshot diário de estoque (rupturas/backlog) às 03:10 da manhã
SELECT public.unschedule_cron_job('estoque-snapshot-daily');
SELECT cron.schedule(
  'estoque-snapshot-daily',
  '10 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://eksqrpaqsmxcufustkfh.supabase.co/functions/v1/estoque-snapshot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrc3FycGFxc214Y3VmdXN0a2ZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTgzNjUsImV4cCI6MjA4ODczNDM2NX0.V0H8BfxAz9Tqek9VbtZLZn3uYdttNR6FuxaRlm_IkCA'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Recarregar cache do PostgREST para ele enxergar as colunas novas (por_conta, vendas_detalhadas)
NOTIFY pgrst, 'reload schema';