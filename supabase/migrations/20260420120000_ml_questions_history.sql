-- Migration: ml_questions_history
-- Histórico de perguntas já respondidas — base de conhecimento do bot ML

CREATE TABLE IF NOT EXISTS ml_questions_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id     text NOT NULL,
  question_id   bigint UNIQUE NOT NULL,
  item_id       text NOT NULL,
  question_text text NOT NULL,
  answer_text   text NOT NULL,
  date_created  timestamptz NOT NULL,
  date_answered timestamptz,
  imported_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ml_history_seller    ON ml_questions_history (seller_id);
CREATE INDEX IF NOT EXISTS idx_ml_history_item      ON ml_questions_history (seller_id, item_id);
CREATE INDEX IF NOT EXISTS idx_ml_history_date      ON ml_questions_history (seller_id, date_created DESC);

ALTER TABLE ml_questions_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_all ON ml_questions_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Fix: RPC get_cron_jobs — retorna todos os campos necessários
CREATE OR REPLACE FUNCTION public.get_cron_jobs()
RETURNS TABLE (
  jobid     bigint,
  jobname   text,
  schedule  text,
  command   text,
  nodename  text,
  nodeport  int,
  database  text,
  username  text,
  active    boolean
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    jobid,
    jobname,
    schedule,
    command,
    nodename,
    nodeport,
    database,
    username,
    active
  FROM cron.job
  ORDER BY jobname;
$$;

-- Fix: schedule_cron_job — robusto, não falha se o job não existir
CREATE OR REPLACE FUNCTION public.schedule_cron_job(
    job_name text,
    cron_expression text,
    function_name text,
    request_body text DEFAULT '{}'
)
RETURNS bigint AS $$
DECLARE
    job_id bigint;
BEGIN
    -- Só apaga se ele realmente existir
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = job_name) THEN
        PERFORM cron.unschedule(job_name);
    END IF;

    SELECT cron.schedule(
        job_name,
        cron_expression,
        format(
            'SELECT net.http_post(url := current_setting(''app.supabase_url'') || ''/functions/v1/%s'', headers := jsonb_build_object(''Content-Type'', ''application/json'', ''Authorization'', ''Bearer '' || current_setting(''app.service_role_key'')), body := %L::jsonb)',
            function_name,
            request_body
        )
    ) INTO job_id;

    RETURN job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix: unschedule_cron_job — robusto, não falha se o job não existir
CREATE OR REPLACE FUNCTION public.unschedule_cron_job(job_name text)
RETURNS void AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = job_name) THEN
        PERFORM cron.unschedule(job_name);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
