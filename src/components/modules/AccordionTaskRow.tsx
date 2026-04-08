import { useState, useEffect } from 'react';
import { ChevronUp, Send, ExternalLink, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AccordionTaskRowProps {
  idAnuncio: string;
  sku: string;
  titulo: string;
  conta: string;
  preco?: number;
  link?: string;
  isOpen: boolean;
  onClose: () => void;
  experienciaInfo?: { health: number; actions: string[] };
  colSpan: number;
}

export function AccordionTaskRow({ idAnuncio, sku, titulo, conta, preco, link, isOpen, onClose, experienciaInfo, colSpan }: AccordionTaskRowProps) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);

  // Fetch unique assignees from team_tasks table
  const fetchAssignees = async () => {
    const { data } = await (supabase as any)
      .from('team_tasks')
      .select('assigned_to_email')
      .not('assigned_to_email', 'is', null);
    if (data) {
      const unique = [...new Set<string>(data.map((r: any) => r.assigned_to_email).filter(Boolean))].sort();
      setAssignees(unique);
    }
  };

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const { data } = await (supabase as any)
        .from('team_tasks')
        .select('*')
        .ilike('description', `%${idAnuncio}%`)
        .order('created_at', { ascending: false });
      if (data) setTasks(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTasks();
      fetchAssignees();
    }
  }, [isOpen, idAnuncio]);

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim() || !newTaskAssignee) {
      toast.error('Informe a tarefa e o responsável.');
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const me = session?.user?.email || 'sistema@vix.com';
      const { error } = await (supabase as any).from('team_tasks').insert([{
        title: `${newTaskTitle}`,
        description: `MLB: ${idAnuncio} | SKU: ${sku} | Conta: ${conta}`,
        type: 'improvement',
        status: 'pending',
        points: 5,
        assigned_to_email: newTaskAssignee,
        created_by_email: me,
        due_date: new Date(Date.now() + 86400000).toISOString()
      }]);
      if (error) throw error;
      toast.success('Tarefa criada e enviada para Atividades!');
      setNewTaskTitle('');
      fetchTasks();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar tarefa');
    }
  };

  if (!isOpen) return null;

  return (
    <tr className="border-t border-primary/20 bg-muted/5">
      <td colSpan={colSpan} className="p-0">
        <div className="border-l-2 border-primary/30 mx-2 mb-2 bg-card rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20">
            <span className="font-semibold text-xs text-foreground flex items-center gap-2">
              Detalhes & Delegar Ação
              {experienciaInfo && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  experienciaInfo.health >= 1 ? 'bg-[hsl(var(--vix-success)/0.15)] text-[hsl(var(--vix-success))]'
                  : experienciaInfo.health >= 0.75 ? 'bg-[hsl(var(--vix-info)/0.15)] text-[hsl(var(--vix-info))]'
                  : experienciaInfo.health >= 0.50 ? 'bg-[hsl(var(--vix-warning)/0.15)] text-[hsl(var(--vix-warning))]'
                  : 'bg-[hsl(var(--vix-danger)/0.15)] text-[hsl(var(--vix-danger))]'
                }`}>
                  Experiência: {(experienciaInfo.health * 100).toFixed(0)}%
                </span>
              )}
            </span>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            {/* Left: Ad Details */}
            <div className="p-4 border-r border-border">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Informações do Anúncio</h4>
              <dl className="space-y-2">
                <div className="flex items-start gap-2">
                  <dt className="text-[10px] text-muted-foreground w-14 flex-shrink-0 pt-px">MLB ID</dt>
                  <dd className="text-xs font-mono text-primary font-semibold">
                    {link ? (
                      <a href={link} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1">
                        {idAnuncio} <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : idAnuncio}
                  </dd>
                </div>
                <div className="flex items-start gap-2">
                  <dt className="text-[10px] text-muted-foreground w-14 flex-shrink-0 pt-px">SKU</dt>
                  <dd className="text-xs font-mono text-foreground">{sku}</dd>
                </div>
                <div className="flex items-start gap-2">
                  <dt className="text-[10px] text-muted-foreground w-14 flex-shrink-0 pt-px">Título</dt>
                  <dd className="text-xs text-foreground leading-snug">{titulo}</dd>
                </div>
                <div className="flex items-start gap-2">
                  <dt className="text-[10px] text-muted-foreground w-14 flex-shrink-0 pt-px">Conta</dt>
                  <dd className="text-xs text-foreground">{conta}</dd>
                </div>
                {preco != null && (
                  <div className="flex items-start gap-2">
                    <dt className="text-[10px] text-muted-foreground w-14 flex-shrink-0 pt-px">Preço</dt>
                    <dd className="text-xs text-foreground font-semibold">
                      {preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </dd>
                  </div>
                )}
                {experienciaInfo && experienciaInfo.actions.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <dt className="text-[10px] font-bold text-[hsl(var(--vix-warning))] uppercase tracking-wider mb-1.5">⚠ Alertas de Qualidade</dt>
                    <ul className="space-y-1">
                      {experienciaInfo.actions.map((act, i) => (
                        <li key={i} className="text-[11px] text-muted-foreground">• {act}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </dl>
            </div>

            {/* Right: Tasks */}
            <div className="p-4">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3 flex justify-between">
                Ações Delegadas (Atividades)
                <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px]">{tasks.length}</span>
              </h4>
              <div className="space-y-1.5 mb-3 max-h-[110px] overflow-y-auto pr-1">
                {loading ? (
                  <div className="text-xs text-muted-foreground animate-pulse">Carregando...</div>
                ) : tasks.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground flex items-center justify-center h-8 border border-dashed border-border rounded-lg">Nenhuma ação delegada</div>
                ) : (
                  tasks.map(t => (
                    <div key={t.id} className="text-xs p-2 rounded-lg border border-border bg-muted/20 flex items-center justify-between gap-2">
                      <span className="text-foreground line-clamp-1 flex-1">{t.title}</span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <User className="w-2.5 h-2.5" />{t.assigned_to_email}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded uppercase text-[9px] font-bold ${
                          t.status === 'completed' ? 'text-[hsl(var(--vix-success))] bg-[hsl(var(--vix-success)/0.1)]'
                          : t.status === 'in_progress' ? 'text-[hsl(var(--vix-info))] bg-[hsl(var(--vix-info)/0.1)]'
                          : 'text-[hsl(var(--vix-warning))] bg-[hsl(var(--vix-warning)/0.1)]'
                        }`}>{t.status === 'completed' ? 'Feito' : t.status === 'in_progress' ? 'Fazendo' : 'Pendente'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* New Task Form */}
              <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border">
                <input
                  className="flex-1 min-w-[120px] h-7 px-2 text-xs bg-card border border-border rounded-md outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60"
                  placeholder="Descreva a ação..."
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateTask()}
                />
                <select
                  className="h-7 px-2 text-xs bg-card border border-border rounded-md outline-none cursor-pointer"
                  value={newTaskAssignee}
                  onChange={e => setNewTaskAssignee(e.target.value)}
                >
                  <option value="" disabled>Delegar para...</option>
                  {assignees.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <button
                  onClick={handleCreateTask}
                  className="h-7 px-3 flex items-center gap-1 bg-primary text-primary-foreground text-xs font-semibold rounded-md hover:opacity-90 transition-opacity"
                >
                  <Send className="w-3 h-3" /> Enviar
                </button>
              </div>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// Small inline trigger button to put inside a <td>
export function AccordionTriggerButton({ isOpen, onClick }: { isOpen: boolean; onClick: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors whitespace-nowrap ${
        isOpen
          ? 'bg-primary/10 text-primary border-primary/20'
          : 'bg-muted/40 text-muted-foreground border-border hover:bg-primary/10 hover:text-primary hover:border-primary/20'
      }`}
    >
      {isOpen ? '▴ Fechar' : '▸ Detalhes'}
    </button>
  );
}
