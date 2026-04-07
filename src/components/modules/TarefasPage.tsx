import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { TeamTask } from '@/lib/types';
import { Plus, Check, Clock, Trophy, Target, Star, Trash2, ArrowRight, X, Play, PlayCircle, Clock4, CheckSquare } from 'lucide-react';
import { toast } from 'sonner';

export function TarefasPage() {
  const { user: currentUser, allUsers, refreshUsers } = useAuth();
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    type: 'diaria' as 'diaria' | 'afazer',
    points: 10,
    assigned_to_email: currentUser?.username || ''
  });

  // Forward state
  const [forwardingTaskId, setForwardingTaskId] = useState<string | null>(null);
  const [forwardTo, setForwardTo] = useState<string>('');

  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  useEffect(() => {
    fetchTasks();
    if (canManage) {
      refreshUsers();
    }
  }, [currentUser, canManage, refreshUsers]);

  const fetchTasks = async () => {
    try {
      let query = (supabase as any)
        .from('team_tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (!canManage && currentUser?.username) {
        query = query.or(`assigned_to_email.eq.${currentUser.username},created_by_email.eq.${currentUser.username}`);
      }

      const { data, error } = await query;
        
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
    try {
      const isStarting = task.status === 'pendente';
      const isCompleting = task.status === 'andamento';
      
      let updates: any = {};
      if (isStarting) {
        updates = { status: 'andamento', started_at: new Date().toISOString() };
      } else if (isCompleting) {
        updates = { status: 'concluido', completed_at: new Date().toISOString() };
      } else {
        // Reverse concluido -> pendente
        updates = { status: 'pendente', started_at: null, completed_at: null };
      }

      const { error } = await (supabase as any)
        .from('team_tasks')
        .update(updates)
        .eq('id', task.id);

      if (error) throw error;
      if (isCompleting) toast.success(`+${task.points} Pontos ganhos! Ouro pra conta! 🎯`);
      if (isStarting) toast.success('Cronômetro iniciado! Vá com tudo! ⏱️');
      
      fetchTasks();
    } catch (e: any) {
      toast.error('Erro ao atualizar status');
    }
  };

  const handleForwardTask = async () => {
    if (!forwardingTaskId || !forwardTo) return;
    try {
      const { error } = await supabase
        .from('team_tasks')
        .update({ 
          assigned_to_email: forwardTo,
          status: 'pendente', // repassa como pendente
        })
        .eq('id', forwardingTaskId);

      if (error) throw error;
      toast.success('Tarefa encaminhada com sucesso! 🚀');
      setForwardingTaskId(null);
      fetchTasks();
    } catch (e: any) {
      toast.error('Erro ao repassar tarefa');
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

  const getDuration = (start: string, end: string) => {
    const diffMs = new Date(end).getTime() - new Date(start).getTime();
    if (diffMs < 0) return '0 min';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const rm = mins % 60;
    return `${hrs}h ${rm > 0 ? rm + 'm' : ''}`;
  };

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
          {canManage && (
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

      {/* Admin / Manager Task Creation Form */}
      {showForm && canManage && (
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
      <div className={`grid grid-cols-1 md:grid-cols-2 ${canManage ? 'lg:grid-cols-3' : ''} gap-6`}>
        
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
                  : task.status === 'andamento' 
                  ? 'bg-blue-500/5 border-blue-500/30 ring-1 ring-blue-500/20' 
                  : 'bg-card border-border hover:border-indigo-500/30 hover:shadow-md hover:shadow-indigo-500/5'
                }`}
              >
                <button 
                  onClick={() => handleToggleStatus(task)}
                  className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded flex items-center justify-center border transition-all ${
                    task.status === 'concluido' ? 'bg-emerald-500 border-emerald-500 text-white' 
                    : task.status === 'andamento' ? 'bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/30 animate-pulse'
                    : 'bg-background border-border hover:border-indigo-500 text-indigo-500'
                  }`}
                  title={task.status === 'pendente' ? 'Iniciar Cronômetro' : task.status === 'andamento' ? 'Concluir' : 'Desmarcar'}
                >
                  {task.status === 'pendente' && <Play className="w-3.5 h-3.5 ml-0.5" />}
                  {task.status === 'andamento' && <Check className="w-4 h-4" />}
                  {task.status === 'concluido' && <Check className="w-4 h-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold transition-all ${
                    task.status==='concluido' ? 'line-through text-muted-foreground' 
                    : task.status==='andamento' ? 'text-blue-500' 
                    : ''
                  }`}>{task.title}</p>
                  
                  {task.status === 'andamento' && (
                    <div className="mt-1 flex items-center gap-1.5 text-blue-500 text-[10px] font-bold uppercase animate-pulse">
                      <Clock4 className="w-3 h-3" /> Em Andamento...
                    </div>
                  )}

                  {task.status === 'concluido' && task.started_at && task.completed_at && (
                    <div className="mt-1 flex items-center gap-1.5 text-emerald-600 text-[10px] font-bold uppercase">
                      <Clock4 className="w-3 h-3" /> Levou {getDuration(task.started_at, task.completed_at)}
                    </div>
                  )}

                  <p className="text-[10px] text-muted-foreground uppercase flex items-center gap-2 mt-1">
                    <span className="bg-muted px-1.5 py-0.5 rounded">Resp: {canManage ? task.assigned_to_email : 'Você'}</span>
                    <span className="text-amber-500 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">+{task.points} pts</span>
                  </p>
                </div>
                
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 items-end">
                  {canManage && (
                    <button onClick={() => handleDelete(task.id)} className="p-1 text-red-500/70 hover:bg-red-500/10 hover:text-red-500 rounded transition-colors" title="Excluir Meta">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {task.status === 'pendente' && (
                    <button onClick={() => setForwardingTaskId(task.id)} className="p-1 text-indigo-500/70 hover:bg-indigo-500/10 hover:text-indigo-500 rounded transition-colors" title="Encaminhar / Repassar Batão">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
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
                  : task.status === 'andamento'
                  ? 'bg-blue-500/5 border-blue-500/30 ring-1 ring-blue-500/20'
                  : 'bg-orange-500/5 border-orange-500/20 hover:border-orange-500/40 hover:shadow-md hover:shadow-orange-500/5'
                }`}
              >
                <button 
                  onClick={() => handleToggleStatus(task)}
                  className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded flex items-center justify-center border transition-all ${
                    task.status === 'concluido' ? 'bg-orange-500 border-orange-500 text-white' 
                    : task.status === 'andamento' ? 'bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/30 animate-pulse'
                    : 'bg-background border-orange-500/30 hover:border-orange-500 text-orange-500'
                  }`}
                  title={task.status === 'pendente' ? 'Iniciar Cronômetro' : task.status === 'andamento' ? 'Concluir' : 'Desmarcar'}
                >
                  {task.status === 'pendente' && <Play className="w-3.5 h-3.5 ml-0.5" />}
                  {task.status === 'andamento' && <Check className="w-4 h-4" />}
                  {task.status === 'concluido' && <Check className="w-4 h-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold transition-all text-foreground ${
                    task.status==='concluido' ? 'line-through text-muted-foreground' 
                    : task.status==='andamento' ? 'text-blue-500'
                    : ''
                  }`}>{task.title}</p>
                  
                  {task.status === 'andamento' && (
                    <div className="mt-1 flex items-center gap-1.5 text-blue-500 text-[10px] font-bold uppercase animate-pulse">
                      <Clock4 className="w-3 h-3" /> Em Andamento...
                    </div>
                  )}

                  {task.status === 'concluido' && task.started_at && task.completed_at && (
                    <div className="mt-1 flex items-center gap-1.5 text-emerald-600 text-[10px] font-bold uppercase">
                      <Clock4 className="w-3 h-3" /> Levou {getDuration(task.started_at, task.completed_at)}
                    </div>
                  )}

                  <p className="text-[10px] text-muted-foreground uppercase flex items-center gap-2 mt-1">
                    <span className="bg-muted px-1.5 py-0.5 rounded">Resp: {canManage ? task.assigned_to_email : 'Você'}</span>
                    <span className="text-amber-500 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">+{task.points} pts</span>
                  </p>
                </div>

                {/* Forwarding Inline Menu for Afazeres */}
                {forwardingTaskId === task.id ? (
                  <div className="flex items-center gap-1 bg-background border border-border p-1 rounded-lg shadow-sm">
                    <select 
                      className="text-xs px-1 py-1 rounded bg-muted outline-none border-none max-w-[100px]"
                      value={forwardTo}
                      onChange={e => setForwardTo(e.target.value)}
                    >
                      <option value="">Para quem?</option>
                      {allUsers.filter((u: any) => u.username !== currentUser?.username).map((u: any) => (
                        <option key={u.username} value={u.username}>{u.nome || u.username}</option>
                      ))}
                    </select>
                    <button onClick={handleForwardTask} className="p-1 rounded bg-primary text-primary-foreground hover:opacity-90">
                      <Check className="w-3 h-3" />
                    </button>
                    <button onClick={() => setForwardingTaskId(null)} className="p-1 rounded bg-muted hover:bg-muted/80">
                      <X className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </div>
                ) : (
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 items-end">
                    {canManage && (
                      <button onClick={() => handleDelete(task.id)} className="p-1 text-red-500/70 hover:bg-red-500/10 hover:text-red-500 rounded transition-colors" title="Excluir Afazer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {task.status === 'pendente' && (
                      <button onClick={() => setForwardingTaskId(task.id)} className="p-1 text-orange-500/70 hover:bg-orange-500/10 hover:text-orange-500 rounded transition-colors" title="Repassar Tarefa">
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Recompensas / Leaderboard (Apenas para Gerentes/Admin) */}
        {canManage && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h3 className="font-bold text-foreground text-lg flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                Painel da Equipe
              </h3>
            </div>
            
            <div className="bg-card border border-border p-4 rounded-xl flex flex-col gap-4">
               <div>
                 <h4 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
                   <Star className="w-4 h-4 text-primary" /> 
                   Produtividade do Time
                 </h4>
               </div>

               <div className="space-y-4">
                 {allUsers.filter((u: any) => u.ativo).map((u: any) => {
                   const userTasks = tasks.filter(t => t.assigned_to_email === u.username);
                   const completed = userTasks.filter(t => t.status === 'concluido');
                   const progress = userTasks.length ? (completed.length / userTasks.length) * 100 : 0;
                   const points = completed.reduce((acc, t) => acc + t.points, 0);

                   return (
                     <div key={u.id} className="bg-muted/30 p-3 rounded-lg border border-border">
                       <div className="flex items-center justify-between mb-2">
                         <span className="text-xs font-bold text-foreground">{u.nome || u.username}</span>
                         <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">{points} pts</span>
                       </div>
                       <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-muted-foreground">{completed.length} de {userTasks.length} concluídas</span>
                          <span className="text-[10px] font-bold">{Math.round(progress)}%</span>
                       </div>
                       <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                         <div 
                           className="h-full bg-emerald-500 transition-all duration-500" 
                           style={{ width: `${progress}%` }}
                         ></div>
                       </div>
                     </div>
                   );
                 })}
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
