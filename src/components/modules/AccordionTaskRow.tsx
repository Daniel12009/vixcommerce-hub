import { useState, useEffect } from 'react';
import { ChevronUp, Send, ExternalLink, User, Plus, X, Calendar } from 'lucide-react';
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

interface VixUser { id: string; username: string; nome: string; }

interface TaskModalProps {
  idAnuncio: string; sku: string; titulo: string; conta: string;
  users: VixUser[]; onClose: () => void; onCreated: () => void;
}

function TaskModal({ idAnuncio, sku, titulo, conta, users, onClose, onCreated }: TaskModalProps) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignee, setAssignee] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!title.trim() || !assignee) {
      toast.error('Informe a descrição e o responsável.');
      return;
    }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const me = session?.user?.email || 'sistema@vix.com';
      const { error } = await (supabase as any).from('team_tasks').insert([{
        title: title.trim(),
        description: `MLB: ${idAnuncio} | SKU: ${sku} | Conta: ${conta}`,
        type: 'afazer',
        status: 'pendente',
        points: 5,
        assigned_to_email: assignee,
        created_by_email: me,
        due_date: dueDate ? new Date(dueDate).toISOString() : new Date(Date.now() + 86400000).toISOString()
      }]);
      if (error) throw error;
      toast.success('Tarefa criada e enviada para Atividades!');
      onCreated();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar tarefa');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-bold text-sm text-foreground">Nova Tarefa</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{idAnuncio} · {sku}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">O que deve ser feito?</label>
            <input
              autoFocus
              className="w-full h-9 px-3 text-sm bg-muted/30 border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
              placeholder={`Ex: Atualizar título do anúncio ${idAnuncio}`}
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                <Calendar className="w-3 h-3 inline mr-1" />Prazo (Opcional)
              </label>
              <input
                type="date"
                className="w-full h-9 px-3 text-sm bg-muted/30 border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                <User className="w-3 h-3 inline mr-1" />Delegar Para
              </label>
              <select
                className="w-full h-9 px-3 text-sm bg-muted/30 border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                value={assignee}
                onChange={e => setAssignee(e.target.value)}
              >
                <option value="" disabled>Selecionar...</option>
                {users.map(u => <option key={u.id} value={u.username}>{u.nome}</option>)}
              </select>
            </div>
          </div>

          {/* Ad context */}
          <div className="p-3 bg-muted/20 border border-border rounded-lg text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">Anúncio:</span> {titulo}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 h-8 text-xs font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted/50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !title.trim() || !assignee}
            className="px-4 h-8 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-1.5"
          >
            <Send className="w-3 h-3" />
            {saving ? 'Enviando...' : 'Criar Tarefa'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AccordionTaskRow({ idAnuncio, sku, titulo, conta, preco, link, isOpen, onClose, experienciaInfo, colSpan }: AccordionTaskRowProps) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<VixUser[]>([]);
  const [showModal, setShowModal] = useState(false);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const { data } = await (supabase as any)
        .from('team_tasks')
        .select('*')
        .ilike('description', `%${idAnuncio}%`)
        .order('created_at', { ascending: false });
      if (data) setTasks(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const fetchUsers = async () => {
    const { data } = await (supabase as any)
      .from('vix_users')
      .select('id, username, nome')
      .order('nome');
    if (data) setUsers(data);
  };

  useEffect(() => {
    if (isOpen) { fetchTasks(); fetchUsers(); }
  }, [isOpen, idAnuncio]);

  if (!isOpen) return null;

  return (
    <>
      {showModal && (
        <TaskModal
          idAnuncio={idAnuncio}
          sku={sku}
          titulo={titulo}
          conta={conta}
          users={users}
          onClose={() => setShowModal(false)}
          onCreated={fetchTasks}
        />
      )}
      <tr className="border-t border-primary/20 bg-muted/5">
        <td colSpan={colSpan} className="p-0">
          <div className="border-l-2 border-primary/30 mx-2 mb-2 bg-card rounded-xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
              <span className="font-semibold text-xs text-foreground flex items-center gap-2">
                Detalhes & Delegar Ação
                {experienciaInfo && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    experienciaInfo.health >= 1 ? 'bg-[hsl(var(--vix-success)/0.15)] text-[hsl(var(--vix-success))]'
                    : experienciaInfo.health >= 0.75 ? 'bg-[hsl(var(--vix-info)/0.15)] text-[hsl(var(--vix-info))]'
                    : experienciaInfo.health >= 0.50 ? 'bg-[hsl(var(--vix-warning)/0.15)] text-[hsl(var(--vix-warning))]'
                    : 'bg-[hsl(var(--vix-danger)/0.15)] text-[hsl(var(--vix-danger))]'
                  }`}>
                    {(experienciaInfo.health * 100).toFixed(0)}%
                  </span>
                )}
              </span>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><ChevronUp className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
              {/* Left: Ad Info */}
              <div className="p-4 border-r border-border">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Informações do Anúncio</h4>
                <dl className="space-y-2">
                  <div className="flex gap-2">
                    <dt className="text-[10px] text-muted-foreground w-12 flex-shrink-0 pt-px">MLB ID</dt>
                    <dd className="text-xs font-mono text-primary font-semibold">
                      {link ? (
                        <a href={link} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1">
                          {idAnuncio} <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : idAnuncio}
                    </dd>
                  </div>
                  <div className="flex gap-2"><dt className="text-[10px] text-muted-foreground w-12 flex-shrink-0 pt-px">SKU</dt><dd className="text-xs font-mono text-foreground">{sku}</dd></div>
                  <div className="flex gap-2"><dt className="text-[10px] text-muted-foreground w-12 flex-shrink-0 pt-px">Título</dt><dd className="text-xs text-foreground leading-snug line-clamp-2">{titulo}</dd></div>
                  <div className="flex gap-2"><dt className="text-[10px] text-muted-foreground w-12 flex-shrink-0 pt-px">Conta</dt><dd className="text-xs text-foreground">{conta}</dd></div>
                  {preco != null && preco > 0 && (
                    <div className="flex gap-2">
                      <dt className="text-[10px] text-muted-foreground w-12 flex-shrink-0 pt-px">Preço</dt>
                      <dd className="text-xs font-semibold text-foreground">{preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</dd>
                    </div>
                  )}
                  {experienciaInfo && experienciaInfo.actions.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <dt className="text-[10px] font-bold text-[hsl(var(--vix-warning))] uppercase tracking-wider mb-1">⚠ Alertas de Qualidade</dt>
                      <ul className="space-y-0.5">
                        {experienciaInfo.actions.map((act, i) => <li key={i} className="text-[11px] text-muted-foreground">• {act}</li>)}
                      </ul>
                    </div>
                  )}
                </dl>
              </div>

              {/* Right: Tasks */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Ações Delegadas</h4>
                  <button
                    onClick={() => setShowModal(true)}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    <Plus className="w-3 h-3" /> Criar Tarefa
                  </button>
                </div>
                <div className="space-y-1.5 max-h-[130px] overflow-y-auto pr-1">
                  {loading ? (
                    <div className="text-xs text-muted-foreground animate-pulse">Carregando...</div>
                  ) : tasks.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground flex items-center justify-center h-10 border border-dashed border-border rounded-lg">Nenhuma ação delegada</div>
                  ) : (
                    tasks.map(t => (
                      <div key={t.id} className="text-xs p-2 rounded-lg border border-border bg-muted/20 flex items-center justify-between gap-2">
                        <span className="text-foreground line-clamp-1 flex-1">{t.title}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><User className="w-2.5 h-2.5" />{t.assigned_to_email}</span>
                          <span className={`px-1.5 py-0.5 rounded uppercase text-[9px] font-bold ${
                            t.status === 'concluido' ? 'text-[hsl(var(--vix-success))] bg-[hsl(var(--vix-success)/0.1)]'
                            : t.status === 'andamento' ? 'text-[hsl(var(--vix-info))] bg-[hsl(var(--vix-info)/0.1)]'
                            : 'text-[hsl(var(--vix-warning))] bg-[hsl(var(--vix-warning)/0.1)]'
                          }`}>{t.status === 'concluido' ? 'Feito' : t.status === 'andamento' ? 'Fazendo' : 'Pendente'}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

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
