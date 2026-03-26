-- Migration to store credentials for other generic API platforms (Shein, TikTok, Amazon, etc)

CREATE TABLE IF NOT EXISTS public.other_api_accounts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    plataforma TEXT NOT NULL, -- e.g., 'shein', 'tiktok', 'amazon', 'magalu'
    nome TEXT NOT NULL,
    credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.other_api_accounts ENABLE ROW LEVEL SECURITY;

-- Create policies safely
DROP POLICY IF EXISTS "Allow anonymous select other_api_accounts" ON public.other_api_accounts;
CREATE POLICY "Allow anonymous select other_api_accounts" ON public.other_api_accounts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow anonymous insert other_api_accounts" ON public.other_api_accounts;
CREATE POLICY "Allow anonymous insert other_api_accounts" ON public.other_api_accounts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anonymous update other_api_accounts" ON public.other_api_accounts;
CREATE POLICY "Allow anonymous update other_api_accounts" ON public.other_api_accounts FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow anonymous delete other_api_accounts" ON public.other_api_accounts;
CREATE POLICY "Allow anonymous delete other_api_accounts" ON public.other_api_accounts FOR DELETE USING (true);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_other_api_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_other_api_accounts_updated_at ON public.other_api_accounts;
CREATE TRIGGER tr_other_api_accounts_updated_at
    BEFORE UPDATE ON public.other_api_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_other_api_accounts_updated_at();
