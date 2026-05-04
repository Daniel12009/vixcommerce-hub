-- Create dashboard_cache table
CREATE TABLE IF NOT EXISTS public.dashboard_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dashboard_cache ENABLE ROW LEVEL SECURITY;

-- Allow all to read (authenticated)
CREATE POLICY "Allow authenticated select dashboard_cache" ON public.dashboard_cache
  FOR SELECT TO authenticated USING (true);

-- Allow service role and authenticated to insert/update (since frontend might write it)
CREATE POLICY "Allow authenticated full access dashboard_cache" ON public.dashboard_cache
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Allow service_role full access dashboard_cache" ON public.dashboard_cache
  FOR ALL TO service_role USING (true);
