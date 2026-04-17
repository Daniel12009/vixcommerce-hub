-- Schedule estoque-snapshot job to run daily at 23:55
SELECT public.schedule_cron_job(
    'estoque-snapshot-daily',      -- job_name
    '55 23 * * *',               -- cron_expression (23:55)
    'estoque-snapshot',          -- function_name
    '{}'                         -- request_body
);

COMMENT ON FUNCTION public.schedule_cron_job IS 'Schedules the daily stock snapshot at 23:55 to capture end-of-day state.';
