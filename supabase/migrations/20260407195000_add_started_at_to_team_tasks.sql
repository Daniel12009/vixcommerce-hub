-- Adicionar coluna started_at
ALTER TABLE public.team_tasks ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

-- Atualizar o check constraint para aceitar 'andamento'
ALTER TABLE public.team_tasks DROP CONSTRAINT IF EXISTS team_tasks_status_check;
ALTER TABLE public.team_tasks ADD CONSTRAINT team_tasks_status_check CHECK (status IN ('pendente', 'andamento', 'concluido'));
