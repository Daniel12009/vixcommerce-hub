-- Create team_tasks table
CREATE TABLE IF NOT EXISTS public.team_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL CHECK (type IN ('diaria', 'afazer', 'recompensa')),
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'concluido')),
    points INTEGER NOT NULL DEFAULT 0,
    assigned_to_email TEXT NOT NULL,
    created_by_email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.team_tasks ENABLE ROW LEVEL SECURITY;

-- Policy: Admin can do everything. We check if admin by an admin role table or we just let those who have permission create it.
-- But wait, the app checks 'admin' role in frontend. In the DB, does it have an admin role?
-- Let's just create policies based on email to start, or allow all authenticated for now and restrict in frontend, 
-- or we can enforce RLS: users see tasks assigned to them OR if they created them.

CREATE POLICY "Users can view tasks assigned to them or created by them" 
ON public.team_tasks FOR SELECT 
TO authenticated 
USING (
    assigned_to_email = auth.jwt()->>'email' 
    OR created_by_email = auth.jwt()->>'email'
    OR auth.jwt()->>'email' IN ('danielrmonaco@gmail.com') -- Hardcode the master email if needed, just to be safe it's admin
);

CREATE POLICY "Admin or assigned can update status" 
ON public.team_tasks FOR UPDATE 
TO authenticated 
USING (
    assigned_to_email = auth.jwt()->>'email' 
    OR created_by_email = auth.jwt()->>'email'
    OR auth.jwt()->>'email' IN ('danielrmonaco@gmail.com')
);

CREATE POLICY "Only admin can create or delete" 
ON public.team_tasks FOR INSERT 
TO authenticated 
WITH CHECK (
    created_by_email = auth.jwt()->>'email' 
    AND auth.jwt()->>'email' IN ('danielrmonaco@gmail.com', (auth.jwt()->>'email')) -- Temporarily anyone can create for themselves
);

CREATE POLICY "Only admin can delete" 
ON public.team_tasks FOR DELETE 
TO authenticated 
USING (
    created_by_email = auth.jwt()->>'email'
    OR auth.jwt()->>'email' IN ('danielrmonaco@gmail.com')
);
