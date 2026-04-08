import { useState, useEffect } from 'react';
import { ChevronUp, Send, ExternalLink, User, Plus, X, Calendar, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AccordionTaskRowProps {
  idAnuncio: string;
  sku: string;
  titulo: string;
  conta: string;
  preco?: number;
  link?: string;
  accountId?: string;          // If provided: catalog mode — fetch purchase experience
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
    if (!title.trim() || !assignee) { toast.error('Informe a descrição e o responsável.'); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const me = session?.user?.email || 'sistema@vix.com';
      const { error } = await (supabase as any).from('team_tasks').insert([{
        title: title.trim(),
        description: `MLB: ${idAnuncio} | SKU: ${sku} | Conta: ${conta}\n${titulo}`,
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
    } catch (e: any) { toast.error(e.message || 'Erro ao criar tarefa'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-bold text-sm text-foreground">Nova Tarefa</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{idAnuncio} · {sku}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><X className="w-4 h-4" /></button>
        </div>
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
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5"><Calendar className="w-3 h-3 inline mr-1" />Prazo (Opcional)</label>
              <input type="date" className="w-full h-9 px-3 text-sm bg-muted/30 border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5"><User className="w-3 h-3 inline mr-1" />Delegar Para</label>
              <select className="w-full h-9 px-3 text-sm bg-muted/30 border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary cursor-pointer" value={assignee} onChange={e => setAssignee(e.target.value)}>
                <option value="" disabled>Selecionar...</option>
                {users.map(u => <option key={u.id} value={u.username}>{u.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="p-3 bg-muted/20 border border-border rounded-lg text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">Anúncio:</span> {titulo}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 h-8 text-xs font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted/50 transition-colors">Cancelar</button>
          <button onClick={handleCreate} disabled={saving || !title.trim() || !assignee} className="px-4 h-8 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-1.5">
            <Send className="w-3 h-3" />{saving ? 'Enviando...' : 'Criar Tarefa'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Purchase Experience renderer (mirrors StatusAnunciosTab logic) ─────────
function PurchaseExperiencePanel({ pe, shipping, listingType, loading }: { pe: any; shipping?: string; listingType?: string; loading: boolean }) {
  if (loading) return <div className="flex items-center gap-2 py-6 justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /><span className="text-xs text-muted-foreground">Buscando experiência...</span></div>;
  if (!pe) return <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground"><AlertTriangle className="w-4 h-4 text-yellow-500" />Sem dados de experiência para este item.</div>;

  const rep = pe.reputation || {};
  const scoreColor = rep.color === 'green' ? 'text-emerald-400 border-emerald-400' : rep.color === 'orange' ? 'text-orange-400 border-orange-400' : rep.color === 'red' ? 'text-red-400 border-red-400' : 'text-muted-foreground border-muted';
  const scoreBg = rep.color === 'green' ? 'bg-emerald-500/10' : rep.color === 'orange' ? 'bg-orange-500/10' : rep.color === 'red' ? 'bg-red-500/10' : 'bg-muted/30';
  const scoreLabel = rep.text || (rep.color === 'green' ? 'Boa' : rep.color === 'orange' ? 'Média' : rep.color === 'red' ? 'Ruim' : 'Sem dados');

  return (
    <div className="space-y-3">
      {/* Score circle */}
      <div className={`flex items-center gap-3 rounded-xl p-3 ${scoreBg}`}>
        <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${scoreColor}`}>
          <span className={`text-base font-bold ${scoreColor.split(' ')[0]}`}>{rep.value ?? '-'}</span>
        </div>
        <div>
          <p className={`text-sm font-bold ${scoreColor.split(' ')[0]}`}>{scoreLabel}</p>
          {pe.subtitles?.slice(0, 2).map((s: any) => (
            <p key={s.order} className="text-[10px] text-muted-foreground">{s.text?.replace(/\{\d+\}/g, '')}</p>
          ))}
        </div>
      </div>

      {/* Freeze */}
      {pe.freeze?.text && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-2">
          <p className="text-[11px] text-blue-400">❄️ {pe.freeze.text.replace(/\{\d+\}/g, '')}</p>
        </div>
      )}

      {/* Problems */}
      {pe.metrics_details?.problems?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-[hsl(var(--vix-warning))] uppercase tracking-wider">⚠ Problemas ({pe.metrics_details.problems.length})</p>
          {pe.metrics_details.problems.map((p: any, i: number) => (
            <div key={i} className="bg-muted/30 rounded-lg p-2 border-l-2" style={{ borderColor: p.color || 'hsl(var(--vix-warning))' }}>
              <div className="flex items-center gap-1.5 mb-0.5">
                {p.tag && <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400">{p.tag}</span>}
                <span className="text-[11px] font-medium text-foreground">{p.quantity}</span>
                <span className="text-[10px] text-muted-foreground">({p.claims || 0} recl. / {p.cancellations || 0} canc.)</span>
              </div>
              {p.level_two?.title && <p className="text-[10px] text-foreground">{p.level_two.title.text || p.level_two.title}</p>}
              {p.level_three?.title && <p className="text-[10px] text-foreground ml-2">→ {p.level_three.title.text || p.level_three.title}</p>}
              {p.level_three?.remedy && (
                <div className="mt-1.5 bg-emerald-500/10 rounded-lg p-2">
                  <p className="text-[10px] text-emerald-400">💡 {p.level_three.remedy.text || p.level_three.remedy}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {pe.metrics_details?.empty_state_title && !pe.metrics_details?.problems?.length && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2 text-center">
          <ShieldCheck className="w-4 h-4 text-emerald-400 mx-auto mb-0.5" />
          <p className="text-[11px] text-emerald-400">{pe.metrics_details.empty_state_title}</p>
        </div>
      )}

      {/* Item meta */}
      <div className="grid grid-cols-2 gap-2 mt-1">
        {shipping && <div className="bg-muted/30 rounded-lg p-1.5 text-center"><p className="text-[9px] text-muted-foreground">Envio</p><p className="text-[11px] font-semibold text-foreground">{shipping === 'fulfillment' ? '📦 Full' : shipping}</p></div>}
        {listingType && <div className="bg-muted/30 rounded-lg p-1.5 text-center"><p className="text-[9px] text-muted-foreground">Tipo</p><p className="text-[11px] font-semibold text-foreground">{listingType === 'gold_pro' ? 'Premium' : listingType === 'gold_special' ? 'Clássico' : listingType}</p></div>}
      </div>
    </div>
  );
}

export function AccordionTaskRow({ idAnuncio, sku, titulo, conta, preco, link, accountId, isOpen, onClose, experienciaInfo, colSpan }: AccordionTaskRowProps) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<VixUser[]>([]);
  const [showModal, setShowModal] = useState(false);
  // Catalog mode: purchase experience
  const [peData, setPeData] = useState<any>(null);
  const [peLoading, setPeLoading] = useState(false);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const { data } = await (supabase as any).from('team_tasks').select('*').ilike('description', `%${idAnuncio}%`).order('created_at', { ascending: false });
      if (data) setTasks(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const fetchUsers = async () => {
    const { data } = await (supabase as any).from('vix_users').select('id, username, nome').order('nome');
    if (data) setUsers(data);
  };

  const fetchPurchaseExperience = async () => {
    if (!accountId) return;
    setPeLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('mercado-livre', {
        body: { action: 'get_item_status', item_id: idAnuncio, account_id: accountId },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!error && data) setPeData(data);
    } catch { /* ignore */ }
    finally { setPeLoading(false); }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTasks();
      fetchUsers();
      if (accountId && !peData) fetchPurchaseExperience();
    }
  }, [isOpen, idAnuncio, accountId]);

  if (!isOpen) return null;

  const isCatalogMode = !!accountId;

  return (
    <>
      {showModal && <TaskModal idAnuncio={idAnuncio} sku={sku} titulo={titulo} conta={conta} users={users} onClose={() => setShowModal(false)} onCreated={fetchTasks} />}
      <tr className="border-t border-primary/20 bg-muted/5">
        <td colSpan={colSpan} className="p-0">
          <div className="border-l-2 border-primary/30 mx-2 mb-2 bg-card rounded-xl overflow-hidden shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
              <span className="font-semibold text-xs text-foreground flex items-center gap-2">
                {isCatalogMode ? 'Experiência de Compra & Delegar Ação' : 'Detalhes & Delegar Ação'}
                {experienciaInfo && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    experienciaInfo.health >= 1 ? 'bg-[hsl(var(--vix-success)/0.15)] text-[hsl(var(--vix-success))]'
                    : experienciaInfo.health >= 0.75 ? 'bg-[hsl(var(--vix-info)/0.15)] text-[hsl(var(--vix-info))]'
                    : experienciaInfo.health >= 0.50 ? 'bg-[hsl(var(--vix-warning)/0.15)] text-[hsl(var(--vix-warning))]'
                    : 'bg-[hsl(var(--vix-danger)/0.15)] text-[hsl(var(--vix-danger))]'
                  }`}>{(experienciaInfo.health * 100).toFixed(0)}%</span>
                )}
              </span>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><ChevronUp className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
              {/* Left panel */}
              <div className="p-4 border-r border-border">
                {isCatalogMode ? (
                  <>
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Experiência de Compra</h4>
                    <PurchaseExperiencePanel
                      pe={peData?.purchase_experience}
                      shipping={peData?.shipping}
                      listingType={peData?.listing_type}
                      loading={peLoading}
                    />
                  </>
                ) : (
                  <>
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Informações do Anúncio</h4>
                    <dl className="space-y-2">
                      <div className="flex gap-2"><dt className="text-[10px] text-muted-foreground w-12 flex-shrink-0 pt-px">MLB ID</dt>
                        <dd className="text-xs font-mono text-primary font-semibold">
                          {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1">{idAnuncio} <ExternalLink className="w-3 h-3" /></a> : idAnuncio}
                        </dd>
                      </div>
                      <div className="flex gap-2"><dt className="text-[10px] text-muted-foreground w-12 flex-shrink-0 pt-px">SKU</dt><dd className="text-xs font-mono text-foreground">{sku}</dd></div>
                      <div className="flex gap-2"><dt className="text-[10px] text-muted-foreground w-12 flex-shrink-0 pt-px">Título</dt><dd className="text-xs text-foreground leading-snug line-clamp-2">{titulo}</dd></div>
                      <div className="flex gap-2"><dt className="text-[10px] text-muted-foreground w-12 flex-shrink-0 pt-px">Conta</dt><dd className="text-xs text-foreground">{conta}</dd></div>
                      {preco != null && preco > 0 && (
                        <div className="flex gap-2"><dt className="text-[10px] text-muted-foreground w-12 flex-shrink-0 pt-px">Preço</dt><dd className="text-xs font-semibold text-foreground">{preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</dd></div>
                      )}
                    </dl>
                  </>
                )}
              </div>

              {/* Right: Tasks */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Ações Delegadas</h4>
                  <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                    <Plus className="w-3 h-3" /> Criar Tarefa
                  </button>
                </div>
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
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
