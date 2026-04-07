-- Remove as restrições baseadas no JWT (pois usamos Auth customizado no painel)
DROP POLICY IF EXISTS "Ver proprias tarefas ou admin" ON public.team_tasks;
DROP POLICY IF EXISTS "Atualizar proprias tarefas" ON public.team_tasks;
DROP POLICY IF EXISTS "Apenas criador ou si mesmo insere" ON public.team_tasks;
DROP POLICY IF EXISTS "Admin pode apagar" ON public.team_tasks;
DROP POLICY IF EXISTS "Users can view tasks assigned to them or created by them" ON public.team_tasks;
DROP POLICY IF EXISTS "Admin or assigned can update status" ON public.team_tasks;
DROP POLICY IF EXISTS "Only admin can create or delete" ON public.team_tasks;
DROP POLICY IF EXISTS "Only admin can delete" ON public.team_tasks;

-- Permite acesso total para o App (A segurança é controlada pela interface React)
CREATE POLICY "Allow read team_tasks" ON public.team_tasks FOR SELECT USING (true);
CREATE POLICY "Allow insert team_tasks" ON public.team_tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update team_tasks" ON public.team_tasks FOR UPDATE USING (true);
CREATE POLICY "Allow delete team_tasks" ON public.team_tasks FOR DELETE USING (true);
