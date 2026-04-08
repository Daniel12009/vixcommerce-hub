import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, Clock, PlayCircle, Plus, Send, X, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AccordionTaskRowProps {
  idAnuncio: string;
  sku: string;
  titulo: string;
  conta: string;
  experienciaInfo?: { health: number; actions: string[] };
  colSpan: number;
}

export function AccordionTaskRow({ idAnuncio, sku, titulo, conta, experienciaInfo, colSpan }: AccordionTaskRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [assignees, setAssignees] = useState<string[]>(['joao@vix.com', 'arthur@vix.com', 'roberta@vix.com', 'daniel@vix.com']); // fallback list

  const fetchTasks = async () => {
    try {
      setLoading(true);
      // We look for tasks where description contains the idAnuncio
      const { data, error } = await supabase
        .from('team_tasks')
        .select('*')
        .ilike('description', `%${idAnuncio}%`)
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        setTasks(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (expanded) {
      fetchTasks();
    }
  }, [expanded, idAnuncio]);

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim() || !newTaskAssignee) {
      toast.error('Informe a tarefa e o responsável.');
      return;
    }
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const me = session?.user?.email || 'sistema@vix.com';
      
      const descObj = `MLB: ${idAnuncio} | SKU: ${sku} | Conta: ${conta}`;
      
      const { error } = await supabase.from('team_tasks').insert([{
        title: `[Catálogo/Perf] ${newTaskTitle}`,
        description: descObj,
        type: 'improvement',
        status: 'pending',
        points: 5,
        assigned_to_email: newTaskAssignee,
        created_by_email: me,
        due_date: new Date(Date.now() + 86400000).toISOString()
      }]);
      
      if (error) throw error;
      toast.success('Ação delegada com sucesso!');
      setNewTaskTitle('');
      fetchTasks();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar tarefa');
    }
  };

  if (!expanded) {
    return (
      <tr className="bg-[hsl(var(--muted)/0.15)] cursor-pointer group" onClick={() => setExpanded(true)}>
        <td colSpan={colSpan} className="px-3 py-1 text-center border-t border-border group-hover:bg-muted/30 transition-colors">
          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase font-semibold tracking-wider text-muted-foreground group-hover:text-primary transition-colors">
            <ChevronDown className="w-3.5 h-3.5" />
            Ver detalhes da Experiência e Ações ({experienciaInfo ? `${experienciaInfo.health * 100}%` : 'Sem nota'})
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className="bg-[hsl(var(--muted)/0.3)] border-t border-border">
        <td colSpan={colSpan} className="p-0">
          <div className="border border-primary/20 rounded-b-xl overflow-hidden bg-card m-2 shadow-sm animate-fade-in">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/40">
              <span className="font-semibold text-xs text-foreground flex items-center gap-2">
                Painel de Qualidade e Delegação ({idAnuncio})
                {experienciaInfo && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    experienciaInfo.health >= 1 ? 'bg-[hsl(var(--vix-success)/0.1)] text-[hsl(var(--vix-success))]'
                    : experienciaInfo.health >= 0.75 ? 'bg-[hsl(var(--vix-info)/0.1)] text-[hsl(var(--vix-info))]'
                    : experienciaInfo.health >= 0.50 ? 'bg-[hsl(var(--vix-warning)/0.1)] text-[hsl(var(--vix-warning))]'
                    : 'bg-[hsl(var(--vix-danger)/0.1)] text-[hsl(var(--vix-danger))]'
                  }`}>
                    Exp: {(experienciaInfo.health * 100).toFixed(0)}%
                  </span>
                )}
              </span>
              <button onClick={(e) => { e.stopPropagation(); setExpanded(false); }} className="text-muted-foreground hover:text-foreground">
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
              {/* Left Column: Health Reasons & Ad Stats */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Penalidades / Requisitos</h4>
                {experienciaInfo && experienciaInfo.actions.length > 0 ? (
                  <ul className="space-y-1.5">
                    {experienciaInfo.actions.map((act, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-foreground bg-muted/50 p-2 rounded-lg">
                        <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--vix-warning))] flex-shrink-0 mt-0.5" />
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                ) : experienciaInfo ? (
                  <div className="flex items-center gap-2 text-xs text-[hsl(var(--vix-success))] bg-[hsl(var(--vix-success)/0.05)] p-2 rounded-lg">
                    <CheckCircle2 className="w-4 h-4" /> Catálogo com Saúde Máxima (Não há pendências informadas).
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">Nota do catálogo não foi sincronizada neste lote.</div>
                )}
              </div>

              {/* Right Column: Mini Tasks Kanban */}
              <div className="border-l border-border pl-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex justify-between items-center">
                  Últimas Ações Delegadas
                  <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px]">{tasks.length} chamados</span>
                </h4>

                <div className="space-y-2 mb-4 max-h-[140px] overflow-y-auto pr-1">
                  {loading ? (
                     <div className="text-xs text-muted-foreground animate-pulse">Carregando histórico...</div>
                  ) : tasks.length === 0 ? (
                     <div className="text-xs text-muted-foreground flex items-center justify-center h-10 border border-dashed border-border rounded-lg">
                       Nenhuma tarefa atrelada a este SKU/MLB.
                     </div>
                  ) : (
                    tasks.map(t => (
                      <div key={t.id} className="text-xs p-2.5 rounded-lg border border-border bg-card shadow-sm flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground line-clamp-1">{t.title}</span>
                          <span className={`px-1.5 py-0.5 rounded uppercase text-[9px] font-bold ${
                            t.status === 'completed' ? 'text-[hsl(var(--vix-success))] bg-[hsl(var(--vix-success)/0.1)]'
                            : t.status === 'in_progress' ? 'text-[hsl(var(--vix-info))] bg-[hsl(var(--vix-info)/0.1)]'
                            : 'text-[hsl(var(--vix-warning))] bg-[hsl(var(--vix-warning)/0.1)]'
                          }`}>
                            {t.status === 'completed' ? 'Feito' : t.status === 'in_progress' ? 'Fazendo' : 'Pendente'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>👤 {t.assigned_to_email?.split('@')[0]}</span>
                          <span>📅 {new Date(t.created_at).toLocaleDateString('pt-BR')}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Form to Create New Action */}
                <div className="flex flex-col gap-2 p-2 rounded-lg bg-muted/40 border border-border">
                  <div className="flex flex-wrap items-center gap-2">
                    <input 
                      className="flex-1 min-w-[140px] h-8 px-2 text-xs bg-card border border-border rounded-md outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Ex: Atualizar ficha técnica..."
                      value={newTaskTitle}
                      onChange={e => setNewTaskTitle(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCreateTask()}
                    />
                    <select 
                      className="h-8 px-2 text-xs bg-card border border-border rounded-md outline-none cursor-pointer"
                      value={newTaskAssignee}
                      onChange={e => setNewTaskAssignee(e.target.value)}
                    >
                      <option value="" disabled>Delegar para...</option>
                      {assignees.map(a => <option key={a} value={a}>{a.split('@')[0]}</option>)}
                    </select>
                    <button 
                      onClick={handleCreateTask}
                      className="h-8 px-3 flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-md hover:opacity-90 transition-opacity"
                    >
                      <Send className="w-3.5 h-3.5" /> Enviar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}
