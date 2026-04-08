
CREATE OR REPLACE FUNCTION public.get_cron_jobs()
RETURNS TABLE(jobid bigint, jobname text, schedule text, command text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT jobid, jobname, schedule, command FROM cron.job ORDER BY jobname;
$$;

CREATE OR REPLACE FUNCTION public.unschedule_cron_job(job_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  PERFORM cron.unschedule(job_name);
EXCEPTION WHEN OTHERS THEN
  -- Job doesn't exist, ignore
  NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.schedule_cron_job(
  job_name text,
  cron_expression text,
  function_name text,
  request_body text DEFAULT '{}'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  result bigint;
  full_url text;
  anon_key text;
BEGIN
  full_url := current_setting('app.settings.supabase_url', true);
  IF full_url IS NULL OR full_url = '' THEN
    full_url := 'https://eksqrpaqsmxcufustkfh.supabase.co';
  END IF;

  anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrc3FycGFxc214Y3VmdXN0a2ZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTgzNjUsImV4cCI6MjA4ODczNDM2NX0.V0H8BfxAz9Tqek9VbtZLZn3uYdttNR6FuxaRlm_IkCA';

  SELECT cron.schedule(
    job_name,
    cron_expression,
    format(
      $SQL$
      SELECT net.http_post(
        url:='%s/functions/v1/%s',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer %s"}'::jsonb,
        body:='%s'::jsonb
      ) AS request_id;
      $SQL$,
      full_url, function_name, anon_key, request_body
    )
  ) INTO result;

  RETURN result;
END;
$$;
