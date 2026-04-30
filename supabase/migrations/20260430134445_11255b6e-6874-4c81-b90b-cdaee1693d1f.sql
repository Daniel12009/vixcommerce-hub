
DO $$
DECLARE
  v_url text := 'https://mbxpkqhjapmhehdngfaj.supabase.co';
  v_token text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ieHBrcWhqYXBtaGVoZG5nZmFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzkzMjg5NiwiZXhwIjoyMDg5NTA4ODk2fQ.Z5urVHTv5oLodyYnnXM_RBALEl8Ji_5ld-HNtLjxLjQ';
  v_jobs text[] := ARRAY[
    'shopee-fetch-questions','shopee-fetch-chat','shopee-auto-chat','shopee-auto-answer',
    'sync-ml-vendas','sync-sync-ads-db','sync-sync-cmv-db','sync-ml-ads','sync-ml-v7',
    'sync-tiny-estoque','sync-ml-performance','save-daily-snapshot-daily'
  ];
  j text;
BEGIN
  FOREACH j IN ARRAY v_jobs LOOP
    BEGIN PERFORM cron.unschedule(j); EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  -- Shopee (alta frequência)
  PERFORM cron.schedule('shopee-fetch-questions','*/10 * * * *', format($q$
    SELECT net.http_post(url:='%s/functions/v1/shopee-fetch-questions',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
      body:='{}'::jsonb);
  $q$, v_url, v_token));

  PERFORM cron.schedule('shopee-fetch-chat','*/5 * * * *', format($q$
    SELECT net.http_post(url:='%s/functions/v1/shopee-fetch-chat',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
      body:='{}'::jsonb);
  $q$, v_url, v_token));

  PERFORM cron.schedule('shopee-auto-answer','5-59/10 * * * *', format($q$
    SELECT net.http_post(url:='%s/functions/v1/shopee-auto-answer',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
      body:='{}'::jsonb);
  $q$, v_url, v_token));

  PERFORM cron.schedule('shopee-auto-chat','2-59/5 * * * *', format($q$
    SELECT net.http_post(url:='%s/functions/v1/shopee-auto-chat',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
      body:='{}'::jsonb);
  $q$, v_url, v_token));

  -- Rotina das 6h BRT (09:00 UTC) escalonada
  PERFORM cron.schedule('sync-ml-v7','0 9 * * *', format($q$
    SELECT net.http_post(url:='%s/functions/v1/daily-sync',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
      body:='{"module":"ml_v7"}'::jsonb);
  $q$, v_url, v_token));

  PERFORM cron.schedule('sync-ml-ads','5 9 * * *', format($q$
    SELECT net.http_post(url:='%s/functions/v1/daily-sync',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
      body:='{"module":"ml_ads"}'::jsonb);
  $q$, v_url, v_token));

  PERFORM cron.schedule('sync-ml-performance','10 9 * * *', format($q$
    SELECT net.http_post(url:='%s/functions/v1/daily-sync',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
      body:='{"module":"ml_performance"}'::jsonb);
  $q$, v_url, v_token));

  PERFORM cron.schedule('sync-ml-vendas','15 9 * * *', format($q$
    SELECT net.http_post(url:='%s/functions/v1/daily-sync',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
      body:='{"module":"ml_vendas"}'::jsonb);
  $q$, v_url, v_token));

  PERFORM cron.schedule('sync-tiny-estoque','20 9 * * *', format($q$
    SELECT net.http_post(url:='%s/functions/v1/daily-sync',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
      body:='{"module":"tiny_estoque"}'::jsonb);
  $q$, v_url, v_token));

  PERFORM cron.schedule('sync-sync-cmv-db','25 9 * * *', format($q$
    SELECT net.http_post(url:='%s/functions/v1/daily-sync',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
      body:='{"module":"sync_cmv_db"}'::jsonb);
  $q$, v_url, v_token));

  PERFORM cron.schedule('sync-sync-ads-db','30 9 * * *', format($q$
    SELECT net.http_post(url:='%s/functions/v1/daily-sync',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
      body:='{"module":"sync_ads_db"}'::jsonb);
  $q$, v_url, v_token));

  -- save-daily-snapshot apontando pro projeto certo
  PERFORM cron.schedule('save-daily-snapshot-daily','55 2 * * *', format($q$
    SELECT net.http_post(url:='%s/functions/v1/save-daily-snapshot',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
      body:='{}'::jsonb);
  $q$, v_url, v_token));
END $$;
