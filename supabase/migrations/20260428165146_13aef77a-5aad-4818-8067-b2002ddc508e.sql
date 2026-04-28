-- Projetos Kanban
CREATE TABLE public.kanban_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  color text NOT NULL DEFAULT '#3b82f6',
  icon text NOT NULL DEFAULT 'Folder',
  created_by_email text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0
);

-- Colunas customizáveis
CREATE TABLE public.kanban_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.kanban_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#64748b',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Cards
CREATE TABLE public.kanban_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id uuid NOT NULL REFERENCES public.kanban_columns(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.kanban_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  assigned_to_email text DEFAULT '',
  points integer NOT NULL DEFAULT 0,
  due_date date,
  labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  position integer NOT NULL DEFAULT 0,
  created_by_email text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed boolean NOT NULL DEFAULT false
);

-- Comentários
CREATE TABLE public.kanban_card_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.kanban_cards(id) ON DELETE CASCADE,
  author_email text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kanban_columns_project ON public.kanban_columns(project_id, position);
CREATE INDEX idx_kanban_cards_column ON public.kanban_cards(column_id, position);
CREATE INDEX idx_kanban_cards_project ON public.kanban_cards(project_id);
CREATE INDEX idx_kanban_comments_card ON public.kanban_card_comments(card_id, created_at);

ALTER TABLE public.kanban_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_card_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON public.kanban_projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON public.kanban_columns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON public.kanban_cards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON public.kanban_card_comments FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER trg_kanban_projects_updated BEFORE UPDATE ON public.kanban_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_kanban_cards_updated BEFORE UPDATE ON public.kanban_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();