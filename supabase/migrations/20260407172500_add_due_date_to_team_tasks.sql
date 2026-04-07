ALTER TABLE IF EXISTS public.team_tasks 
  ADD COLUMN IF NOT EXISTS due_date timestamp with time zone NULL;
