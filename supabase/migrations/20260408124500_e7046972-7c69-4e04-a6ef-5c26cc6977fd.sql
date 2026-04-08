
CREATE TABLE public.sync_run_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  module TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX idx_sync_run_log_date ON public.sync_run_log (run_date);

ALTER TABLE public.sync_run_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for service role" ON public.sync_run_log FOR ALL USING (true) WITH CHECK (true);
