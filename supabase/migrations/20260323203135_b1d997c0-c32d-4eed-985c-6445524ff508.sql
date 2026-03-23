CREATE TABLE public.ml_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL DEFAULT '',
  client_id text NOT NULL DEFAULT '',
  client_secret text NOT NULL DEFAULT '',
  access_token text NOT NULL DEFAULT '',
  refresh_token text NOT NULL DEFAULT '',
  token_expires_at timestamptz,
  seller_id text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ml_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for ml_accounts"
  ON public.ml_accounts
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);