
CREATE TABLE public.ml_answer_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  keywords text[] NOT NULL DEFAULT '{}',
  answer_text text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ml_answer_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for ml_answer_templates"
  ON public.ml_answer_templates
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_ml_answer_templates_seller ON public.ml_answer_templates(seller_id);
