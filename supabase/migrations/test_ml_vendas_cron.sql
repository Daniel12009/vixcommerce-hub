-- ═══════════════════════════════════════════════════════════════════
-- TESTE ÚNICO: Vendas ML (Mercado Livre)
-- Agendado para 12:40 BRT (15:40 UTC) — 30/04/2026
-- Após verificar o resultado, rode o comando de limpeza no final.
-- ═══════════════════════════════════════════════════════════════════

-- 1️⃣ AGENDAR O TESTE (rode este bloco no SQL Editor do Supabase)
SELECT cron.schedule(
  'test-ml-vendas-telegram',
  '40 15 30 4 *',
  $$
  SELECT net.http_post(
    url := 'https://mbxpkqhjapmhehdngfaj.supabase.co/functions/v1/daily-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ieHBrcWhqYXBtaGVoZG5nZmFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzkzMjg5NiwiZXhwIjoyMDg5NTA4ODk2fQ.Z5urVHTv5oLodyYnnXM_RBALEl8Ji_5ld-HNtLjxLjQ'
    ),
    body := '{"module":"ml_vendas"}'::jsonb
  );
  $$
);

-- 2️⃣ VERIFICAR SE FOI AGENDADO
-- SELECT * FROM cron.job WHERE jobname = 'test-ml-vendas-telegram';

-- 3️⃣ DEPOIS DO TESTE: REMOVER O CRON (rode isso depois de confirmar)
-- SELECT cron.unschedule('test-ml-vendas-telegram');
