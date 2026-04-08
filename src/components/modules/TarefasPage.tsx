import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { TeamTask } from '@/lib/types';
import { Plus, Check, Clock, Trophy, Target, Star, Trash2, ArrowRight, X, Play, PlayCircle, Clock4, CheckSquare, BarChart3, Users, LayoutDashboard, Calendar, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSheetsData } from '@/contexts/SheetsDataContext';

export function TarefasPage() {
  const { user: currentUser, allUsers, refreshUsers } = useAuth();
  const { atividadesItems } = useSheetsData();
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('minhas');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    type: 'diaria' as 'diaria' | 'afazer',
    points: 10,
    assigned_to_email: currentUser?.username || '',
    due_date: ''
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
        due_date: newTask.due_date ? new Date(newTask.due_date).toISOString() : null
      }]);

      if (error) throw error;
      toast.success('Tarefa criada!');
      setNewTask({ ...newTask, title: '', due_date: '' });
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
            <div className="md:col-span-1">
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
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Prazo (Opcional)</label>
              <input 
                type="date" 
                value={newTask.due_date}
                onChange={e => setNewTask({...newTask, due_date: e.target.value})}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground"
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

      {/* Tabs Layout */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="minhas"><Target className="w-4 h-4 mr-1.5" /> Minhas Atividades</TabsTrigger>
          {canManage && <TabsTrigger value="equipe"><LayoutDashboard className="w-4 h-4 mr-1.5" /> Gestão de Produtividade</TabsTrigger>}
        </TabsList>

        <TabsContent value="minhas" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
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

          </div>
        </TabsContent>

        {canManage && (
          <TabsContent value="equipe" className="mt-0 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Dashboard Overview Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
                 <div className="flex justify-between items-start mb-2">
                   <h4 className="text-sm font-semibold text-muted-foreground">Total de Atividades</h4>
                   <LayoutDashboard className="w-4 h-4 text-primary" />
                 </div>
                 <div className="text-2xl font-bold">{atividadesItems?.length || 0}</div>
                 <p className="text-xs text-muted-foreground mt-1">Importadas da Planilha</p>
              </div>

              <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
                 <div className="flex justify-between items-start mb-2">
                   <h4 className="text-sm font-semibold text-muted-foreground">Concluídas</h4>
                   <CheckSquare className="w-4 h-4 text-[hsl(var(--vix-success))]" />
                 </div>
                 <div className="text-2xl font-bold text-[hsl(var(--vix-success))]">
                   {atividadesItems?.filter(a => a.status?.toLowerCase().includes('conclu')).length || 0}
                 </div>
                 <p className="text-xs text-muted-foreground mt-1">Status Finalizado</p>
              </div>

              <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
                 <div className="flex justify-between items-start mb-2">
                   <h4 className="text-sm font-semibold text-muted-foreground">Pendentes (Não Ini.)</h4>
                   <Clock className="w-4 h-4 text-orange-400" />
                 </div>
                 <div className="text-2xl font-bold text-orange-400">
                   {atividadesItems?.filter(a => !a.status || a.status?.toLowerCase().includes('pendente') || a.status?.toLowerCase().includes('não ini') || a.status?.toLowerCase().includes('abert')).length || 0}
                 </div>
                 <p className="text-xs text-muted-foreground mt-1">Na fila aguardando</p>
              </div>

              <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
                 <div className="flex justify-between items-start mb-2">
                   <h4 className="text-sm font-semibold text-muted-foreground">Em Andamento</h4>
                   <Clock4 className="w-4 h-4 text-blue-500" />
                 </div>
                 <div className="text-2xl font-bold text-blue-500">
                   {atividadesItems?.filter(a => a.status?.toLowerCase().includes('andamento') || a.status?.toLowerCase().includes('execuç')).length || 0}
                 </div>
                 <p className="text-xs text-muted-foreground mt-1">Sendo trabalhadas hoje</p>
              </div>

              <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
                 <div className="flex justify-between items-start mb-2">
                   <h4 className="text-sm font-semibold text-muted-foreground">Atrasadas / Alertas</h4>
                   <AlertCircle className="w-4 h-4 text-[hsl(var(--vix-danger))]" />
                 </div>
                 <div className="text-2xl font-bold text-[hsl(var(--vix-danger))]">
                   {atividadesItems?.filter(a => {
                     if (!a.prazo) return false;
                     // Simple check mapping DD/MM/YYYY into date
                     const [d,m,y] = a.prazo.split('/');
                     if(y && m && d) {
                       const prazoDate = new Date(`${y}-${m}-${d}`);
                       return prazoDate < new Date() && !a.status?.toLowerCase().includes('conclu');
                     }
                     return false;
                   }).length || 0}
                 </div>
                 <p className="text-xs text-muted-foreground mt-1">Vencendo ou pendentes</p>
              </div>
            </div>

            {/* Produtividade da Equipe */}
            <div className="bg-card border border-border p-5 rounded-2xl">
               <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                 <Users className="w-5 h-5 text-indigo-400" /> 
                 Ranking de Atividades (Importadas)
               </h3>
               
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 <div className="space-y-4">
                   <h4 className="text-sm font-semibold text-muted-foreground border-b border-border pb-2">Status por Executor</h4>
                    {Array.from(new Set(atividadesItems?.map(a => a.responsavel).filter(Boolean) || [])).map(resp => {
                     const acts = atividadesItems?.filter(a => a.responsavel === resp) || [];
                     const concluidas = acts.filter(a => a.status?.toLowerCase().includes('conclu')).length;
                     const progresso = acts.length ? (concluidas / acts.length) * 100 : 0;
                     return (
                       <div key={resp} onClick={() => setSelectedUser(resp)} className="space-y-2 cursor-pointer hover:bg-muted/50 p-2 rounded-lg -mx-2 transition-colors">
                         <div className="flex justify-between items-center text-sm">
                           <span className="font-semibold text-foreground">{resp}</span>
                           <span className="text-muted-foreground text-xs">{concluidas} / {acts.length} • Clique para ver painel ➔</span>
                         </div>
                         <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                           <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${progresso}%` }}></div>
                         </div>
                       </div>
                     );
                   })}
                 </div>

                 {/* Ações Recentes / Tabela Resumo */}
                 <div className="space-y-4">
                   <h4 className="text-sm font-semibold text-muted-foreground border-b border-border pb-2">Últimas Atualizações</h4>
                   <div className="space-y-3">
                     {atividadesItems?.slice(0, 5).map((a, i) => (
                       <div key={i} className="flex flex-col gap-1 p-3 bg-muted/20 rounded-lg border border-border text-xs">
                         <div className="flex justify-between items-start">
                           <strong className="text-foreground">{a.tarefa}</strong>
                           <span className={`px-2 py-0.5 rounded font-semibold ${
                             a.status?.toLowerCase().includes('conclu') ? 'bg-emerald-500/10 text-emerald-500' : 
                             a.status?.toLowerCase().includes('andamento') ? 'bg-blue-500/10 text-blue-500' : 
                             'bg-orange-500/10 text-orange-500'
                           }`}>{a.status}</span>
                         </div>
                         <div className="flex gap-4 text-muted-foreground mt-1">
                           <span>👤 {a.responsavel}</span>
                           <span>📦 {a.conta || a.sku || a.id || 'N/A'}</span>
                           <span>⏳ Prazo: {a.prazo}</span>
                         </div>
                       </div>
                     ))}
                     {(!atividadesItems || atividadesItems.length === 0) && (
                       <p className="text-sm text-muted-foreground text-center py-4 italic">Dados não importados da planilha ainda.</p>
                     )}
                   </div>
                 </div>
               </div>
            </div>
            
            {/* Legacy Recompensas block */}
            <div className="bg-card border border-border p-4 rounded-xl flex flex-col gap-4">
               <div>
                 <h4 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
                   <Trophy className="w-4 h-4 text-amber-500" /> 
                   Sistema Legacy de Pontos (Gamificação)
                 </h4>
               </div>

               <div className="space-y-4">
                 {allUsers.filter((u: any) => u.ativo).map((u: any) => {
                   const userTasks = tasks.filter(t => t.assigned_to_email === u.username);
                   if(userTasks.length === 0) return null;
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
          </TabsContent>
        )}
      </Tabs>

      {/* DETAILED USER MODAL */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-4xl border border-border rounded-xl shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-border">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" /> Ficha Completa: {selectedUser}
              </h2>
              <button onClick={() => setSelectedUser(null)} className="p-1 hover:bg-muted rounded text-muted-foreground">
                <X className="w-5 h-5"/>
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                 {(() => {
                   const acts = atividadesItems?.filter(a => a.responsavel === selectedUser) || [];
                   const conc = acts.filter(a => a.status?.toLowerCase().includes('conclu')).length;
                   const and = acts.filter(a => a.status?.toLowerCase().includes('andamento') || a.status?.toLowerCase().includes('exec')).length;
                   const pend = acts.filter(a => !a.status || a.status?.toLowerCase().includes('pendente') || a.status?.toLowerCase().includes('não')).length;
                   return (
                     <>
                        <div className="bg-muted/30 p-3 rounded-lg border border-border text-center">
                           <div className="text-xs text-muted-foreground">Total Atividades</div>
                           <div className="font-bold text-lg">{acts.length}</div>
                        </div>
                        <div className="bg-muted/30 border-emerald-500/20 text-emerald-500 p-3 rounded-lg border text-center">
                           <div className="text-xs">Concluídas</div>
                           <div className="font-bold text-lg">{conc}</div>
                        </div>
                        <div className="bg-muted/30 border-blue-500/20 text-blue-500 p-3 rounded-lg border text-center">
                           <div className="text-xs">Andamento</div>
                           <div className="font-bold text-lg">{and}</div>
                        </div>
                        <div className="bg-muted/30 border-orange-500/20 text-orange-500 p-3 rounded-lg border text-center">
                           <div className="text-xs">Pendentes</div>
                           <div className="font-bold text-lg">{pend}</div>
                        </div>
                     </>
                   )
                 })()}
              </div>

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 whitespace-nowrap">Tarefa / Ação</th>
                      <th className="px-4 py-3 whitespace-nowrap">Status</th>
                      <th className="px-4 py-3 whitespace-nowrap">Aba / Doc</th>
                      <th className="px-4 py-3 whitespace-nowrap">Ref. (ID/SKU)</th>
                      <th className="px-4 py-3 whitespace-nowrap">Prazo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-card">
                    {(atividadesItems?.filter(a => a.responsavel === selectedUser) || []).map((a, i) => (
                      <tr key={i} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate" title={a.tarefa}>
                          {a.tarefa || '-'}
                        </td>
                        <td className="px-4 py-3">
                           <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                             a.status?.toLowerCase().includes('conclu') ? 'bg-emerald-500/10 text-emerald-500' : 
                             a.status?.toLowerCase().includes('andamento') ? 'bg-blue-500/10 text-blue-500' : 
                             'bg-orange-500/10 text-orange-500'
                           }`}>{a.status || 'Pendente'}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{a.abaNome || '-'}</td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs max-w-[120px] truncate" title={a.conta || a.sku || a.id}>
                          {a.conta || a.sku || a.id || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{a.prazo || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
