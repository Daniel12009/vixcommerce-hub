import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { TeamTask } from '@/lib/types';
import { Plus, Check, Clock, Trophy, Target, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export function TarefasPage() {
  const { user: currentUser, allUsers } = useAuth();
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    type: 'diaria' as const,
    points: 10,
    assigned_to_email: currentUser?.username || ''
  });

  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    fetchTasks();
  }, [currentUser]);

  const fetchTasks = async () => {
    try {
      const { data, error } = await supabase
        .from('team_tasks')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setTasks((data || []) as TeamTask[]);
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao carregar tarefas');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newTask.title) return toast.error('Preencha o título da tarefa!');

    try {
      const { error } = await supabase.from('team_tasks').insert([{
        title: newTask.title,
        type: newTask.type,
        points: newTask.points,
        status: 'pendente',
        assigned_to_email: newTask.assigned_to_email,
        created_by_email: currentUser?.username || 'admin',
      }]);

      if (error) throw error;
      toast.success('Tarefa criada!');
      setNewTask({ ...newTask, title: '' });
      setShowForm(false);
      fetchTasks();
    } catch (e: any) {
      toast.error('Erro ao criar tarefa');
    }
  };

  const handleToggleStatus = async (task: TeamTask) => {
    const isCompleting = task.status === 'pendente';
    try {
      const { error } = await supabase
        .from('team_tasks')
        .update({ 
          status: isCompleting ? 'concluido' : 'pendente',
          completed_at: isCompleting ? new Date().toISOString() : null
        })
        .eq('id', task.id);

      if (error) throw error;
      if (isCompleting) toast.success(`+${task.points} Pontos ganhos!`);
      fetchTasks();
    } catch (e: any) {
      toast.error('Erro ao atualizar status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir esta atividade?')) return;
    try {
      const { error } = await supabase.from('team_tasks').delete().eq('id', id);
      if (error) throw error;
      fetchTasks();
    } catch (e: any) {
      toast.error('Erro ao excluir tarefa');
    }
  };

  const diarias = tasks.filter(t => t.type === 'diaria');
  const afazeres = tasks.filter(t => t.type === 'afazer');
  const pointsEarned = tasks.filter(t => t.status === 'concluido').reduce((acc, t) => acc + t.points, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Target className="w-6 h-6 text-primary" />
            Minhas Atividades
          </h2>
          <p className="text-muted-foreground mt-1">
            Reúna todas as suas tarefas diárias e afazeres em um único lugar
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 rounded-xl border border-amber-500/20">
            <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
            <span className="font-bold text-amber-500 text-lg">{pointsEarned} <span className="text-sm font-medium">pts</span></span>
          </div>
          {isAdmin && (
            <button 
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-md shadow-primary/20 hover:opacity-90 transition-all"
            >
              <Plus className="w-4 h-4" />
              Delegar Meta
            </button>
          )}
        </div>
      </div>

      {/* Admin Task Creation Form */}
      {showForm && isAdmin && (
        <div className="bg-card border border-border p-5 rounded-2xl animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-foreground">Nova Tarefa / Afazer</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground block mb-1">O que deve ser feito?</label>
              <input 
                type="text" 
                value={newTask.title}
                onChange={e => setNewTask({...newTask, title: e.target.value})}
                placeholder="Ex: Revisar anúncios do Mercado Livre"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Delegar Para</label>
              <select 
                value={newTask.assigned_to_email}
                onChange={e => setNewTask({...newTask, assigned_to_email: e.target.value})}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
              >
                {allUsers.map((u: any) => (
                  <option key={u.username} value={u.username}>{u.nome || u.username}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Recompensa (Pontos)</label>
              <input 
                type="number" 
                value={newTask.points}
                onChange={e => setNewTask({...newTask, points: Number(e.target.value)})}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Frequência</label>
              <select 
                value={newTask.type}
                onChange={e => setNewTask({...newTask, type: e.target.value as 'diaria'|'afazer'})}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
              >
                <option value="diaria">Recorrente Diária</option>
                <option value="afazer">Afazer Único</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button 
              onClick={handleCreate}
              className="px-6 py-2 bg-primary text-primary-foreground font-bold rounded-lg hover:opacity-90"
            >
              Confirmar e Delegar
            </button>
          </div>
        </div>
      )}

      {/* Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Diárias */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <h3 className="font-bold text-foreground text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-400" />
              Diárias
              <span className="bg-primary/20 text-primary text-xs w-6 h-6 rounded-full flex items-center justify-center font-bold">
                {diarias.length}
              </span>
            </h3>
          </div>
          
          <div className="flex-1 space-y-3">
            {diarias.length === 0 && <p className="text-sm text-muted-foreground italic p-4 text-center">Nenhuma diária cadastrada hoje</p>}
            {diarias.map(task => (
              <div 
                key={task.id} 
                className={`group flex items-start gap-3 p-3 rounded-xl border transition-all ${
                  task.status === 'concluido' 
                  ? 'bg-muted/30 border-border opacity-60 grayscale' 
                  : 'bg-card border-border hover:border-indigo-500/30 hover:shadow-md hover:shadow-indigo-500/5'
                }`}
              >
                <button 
                  onClick={() => handleToggleStatus(task)}
                  className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded flex items-center justify-center border transition-all ${
                    task.status === 'concluido' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-background border-border hover:border-indigo-500'
                  }`}
                >
                  {task.status === 'concluido' && <Check className="w-4 h-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${task.status==='concluido'?'line-through':''}`}>{task.title}</p>
                  <p className="text-[10px] text-muted-foreground uppercase flex items-center justify-between mt-1">
                    <span>Para: {isAdmin ? task.assigned_to_email : 'Você'}</span>
                    <span className="text-amber-500 font-bold">+{task.points} pts</span>
                  </p>
                </div>
                {isAdmin && (
                  <button onClick={() => handleDelete(task.id)} className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:bg-red-400/10 rounded">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Afazeres */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <h3 className="font-bold text-foreground text-lg flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-orange-400" />
              Afazeres
              <span className="bg-primary/20 text-primary text-xs w-6 h-6 rounded-full flex items-center justify-center font-bold">
                {afazeres.length}
              </span>
            </h3>
          </div>
          
          <div className="flex-1 space-y-3">
             {afazeres.length === 0 && <p className="text-sm text-muted-foreground italic p-4 text-center">Nenhum afazer pendente</p>}
            {afazeres.map(task => (
              <div 
                key={task.id} 
                className={`group flex items-start gap-3 p-3 rounded-xl border transition-all ${
                  task.status === 'concluido' 
                  ? 'bg-muted/30 border-border opacity-60 grayscale' 
                  : 'bg-orange-500/5 border-orange-500/20 hover:border-orange-500/40 hover:shadow-md hover:shadow-orange-500/5'
                }`}
              >
                <button 
                  onClick={() => handleToggleStatus(task)}
                  className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded flex items-center justify-center border transition-all ${
                    task.status === 'concluido' ? 'bg-orange-500 border-orange-500 text-white' : 'bg-background border-orange-500/30'
                  }`}
                >
                  {task.status === 'concluido' && <Check className="w-4 h-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold text-foreground ${task.status==='concluido'?'line-through':''}`}>{task.title}</p>
                  <p className="text-[10px] text-muted-foreground uppercase flex items-center justify-between mt-1">
                    <span>Para: {isAdmin ? task.assigned_to_email : 'Você'}</span>
                    <span className="text-amber-500 font-bold">+{task.points} pts</span>
                  </p>
                </div>
                {isAdmin && (
                  <button onClick={() => handleDelete(task.id)} className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:bg-red-400/10 rounded">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Recompensas / Leaderboard */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <h3 className="font-bold text-foreground text-lg flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              Desempenho Diário
            </h3>
          </div>
          
          <div className="bg-card border border-border p-4 rounded-xl flex flex-col items-center justify-center text-center gap-3">
             <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center">
               <Trophy className="w-8 h-8 text-amber-500" />
             </div>
             <div>
               <h4 className="font-bold text-lg text-foreground">Sua Produtividade</h4>
               <p className="text-sm text-muted-foreground">Complete tarefas para ganhar mais pontos no ranking de operação.</p>
             </div>

             <div className="w-full h-px bg-border my-2"></div>

             <div className="flex items-center justify-between w-full">
                <span className="text-sm font-medium text-muted-foreground">Progresso de Hoje:</span>
                <span className="text-sm font-bold text-foreground">{tasks.filter(t => t.status === 'concluido').length} / {tasks.length}</span>
             </div>
             
             {/* Simple progress bar */}
             <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
               <div 
                 className="h-full bg-amber-500 transition-all duration-500" 
                 style={{ width: `${tasks.length ? (tasks.filter(t => t.status === 'concluido').length / tasks.length) * 100 : 0}%` }}
               ></div>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
}
