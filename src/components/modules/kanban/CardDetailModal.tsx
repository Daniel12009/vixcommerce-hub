import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  X, Calendar, User as UserIcon, Star, Tag, CheckSquare, MessageSquare,
  Trash2, Plus, Send, Clock, AlignLeft
} from 'lucide-react';
import { toast } from 'sonner';
import type { KanbanCard, KanbanComment, KanbanLabel, KanbanChecklistItem } from './types';
import { LABEL_COLORS } from './types';

interface Props {
  card: KanbanCard;
  allUsers: any[];
  onClose: () => void;
  onUpdate: (card: KanbanCard) => void;
  onDelete: (id: string) => void;
}

export function CardDetailModal({ card, allUsers, onClose, onUpdate, onDelete }: Props) {
  const { user } = useAuth();
  const [local, setLocal] = useState<KanbanCard>(card);
  const [comments, setComments] = useState<KanbanComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [newLabel, setNewLabel] = useState({ name: '', color: LABEL_COLORS[0].value });

  useEffect(() => { setLocal(card); }, [card.id]);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from('kanban_card_comments')
        .select('*')
        .eq('card_id', card.id)
        .order('created_at');
      setComments((data || []) as KanbanComment[]);
    })();
  }, [card.id]);

  const persist = async (patch: Partial<KanbanCard>) => {
    const updated = { ...local, ...patch };
    setLocal(updated);
    onUpdate(updated);
    const { error } = await (supabase as any)
      .from('kanban_cards')
      .update(patch)
      .eq('id', card.id);
    if (error) toast.error('Erro ao salvar');
  };

  const handleAddChecklist = () => {
    if (!newChecklistItem.trim()) return;
    const item: KanbanChecklistItem = {
      id: crypto.randomUUID(),
      text: newChecklistItem.trim(),
      done: false,
    };
    persist({ checklist: [...(local.checklist || []), item] });
    setNewChecklistItem('');
  };

  const toggleChecklist = (id: string) => {
    persist({
      checklist: local.checklist.map(i => i.id === id ? { ...i, done: !i.done } : i),
    });
  };

  const removeChecklist = (id: string) => {
    persist({ checklist: local.checklist.filter(i => i.id !== id) });
  };

  const handleAddLabel = () => {
    if (!newLabel.name.trim()) return;
    const label: KanbanLabel = {
      id: crypto.randomUUID(),
      name: newLabel.name.trim(),
      color: newLabel.color,
    };
    persist({ labels: [...(local.labels || []), label] });
    setNewLabel({ name: '', color: LABEL_COLORS[0].value });
  };

  const removeLabel = (id: string) => {
    persist({ labels: local.labels.filter(l => l.id !== id) });
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    const { data, error } = await (supabase as any)
      .from('kanban_card_comments')
      .insert([{
        card_id: card.id,
        author_email: user?.username || '',
        body: newComment.trim(),
      }])
      .select()
      .single();
    if (error || !data) return toast.error('Erro');
    setComments([...comments, data as KanbanComment]);
    setNewComment('');
  };

  const removeComment = async (id: string) => {
    await (supabase as any).from('kanban_card_comments').delete().eq('id', id);
    setComments(comments.filter(c => c.id !== id));
  };

  const checklistDone = local.checklist?.filter(i => i.done).length || 0;
  const checklistTotal = local.checklist?.length || 0;
  const checklistPct = checklistTotal > 0 ? (checklistDone / checklistTotal) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-3xl my-8 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-border flex items-start gap-3">
          <CheckSquare className="w-5 h-5 text-muted-foreground mt-1 flex-shrink-0" />
          <input
            value={local.title}
            onChange={e => setLocal({ ...local, title: e.target.value })}
            onBlur={() => persist({ title: local.title })}
            className="flex-1 text-lg font-bold bg-transparent border-none focus:outline-none text-foreground"
          />
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 p-5">
          {/* Main */}
          <div className="md:col-span-2 space-y-5">
            {/* Labels display */}
            {local.labels && local.labels.length > 0 && (
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">Etiquetas</label>
                <div className="flex flex-wrap gap-1.5">
                  {local.labels.map(l => (
                    <span
                      key={l.id}
                      className="text-xs font-bold px-2 py-1 rounded text-white flex items-center gap-1.5"
                      style={{ backgroundColor: l.color }}
                    >
                      {l.name}
                      <button onClick={() => removeLabel(l.id)} className="hover:opacity-70">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                <AlignLeft className="w-3.5 h-3.5" /> Descrição
              </label>
              <textarea
                value={local.description}
                onChange={e => setLocal({ ...local, description: e.target.value })}
                onBlur={() => persist({ description: local.description })}
                placeholder="Adicione uma descrição mais detalhada..."
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm min-h-[80px] resize-y"
              />
            </div>

            {/* Checklist */}
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                <CheckSquare className="w-3.5 h-3.5" /> Checklist
                {checklistTotal > 0 && (
                  <span className="ml-auto text-[10px]">{checklistDone}/{checklistTotal}</span>
                )}
              </label>
              {checklistTotal > 0 && (
                <div className="h-1.5 bg-muted rounded-full mb-2 overflow-hidden">
                  <div className="h-full bg-green-500 transition-all" style={{ width: `${checklistPct}%` }} />
                </div>
              )}
              <div className="space-y-1">
                {local.checklist?.map(item => (
                  <div key={item.id} className="flex items-center gap-2 group">
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => toggleChecklist(item.id)}
                      className="w-4 h-4 rounded"
                    />
                    <span className={`flex-1 text-sm ${item.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {item.text}
                    </span>
                    <button onClick={() => removeChecklist(item.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input
                  value={newChecklistItem}
                  onChange={e => setNewChecklistItem(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddChecklist(); }}
                  placeholder="Adicionar item"
                  className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-sm"
                />
                <button onClick={handleAddChecklist} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-bold">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Comments */}
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2">
                <MessageSquare className="w-3.5 h-3.5" /> Comentários ({comments.length})
              </label>
              <div className="flex gap-2 mb-3">
                <input
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddComment(); }}
                  placeholder="Escrever comentário..."
                  className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
                />
                <button onClick={handleAddComment} className="px-3 py-2 bg-primary text-primary-foreground rounded-lg">
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2">
                {comments.map(c => (
                  <div key={c.id} className="bg-muted/40 rounded-lg p-2.5 group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-foreground uppercase">{c.author_email || 'desconhecido'}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(c.created_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button onClick={() => removeComment(c.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{c.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                <UserIcon className="w-3.5 h-3.5" /> Responsável
              </label>
              <select
                value={local.assigned_to_email}
                onChange={e => persist({ assigned_to_email: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
              >
                <option value="">Não atribuído</option>
                {allUsers.map((u: any) => (
                  <option key={u.username} value={u.username}>{u.nome || u.username}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                <Calendar className="w-3.5 h-3.5" /> Data de Entrega
              </label>
              <input
                type="date"
                value={local.due_date || ''}
                onChange={e => persist({ due_date: e.target.value || null })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                <Star className="w-3.5 h-3.5" /> Pontos
              </label>
              <input
                type="number"
                value={local.points}
                onChange={e => setLocal({ ...local, points: Number(e.target.value) })}
                onBlur={() => persist({ points: local.points })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                <Tag className="w-3.5 h-3.5" /> Adicionar Etiqueta
              </label>
              <div className="space-y-2">
                <input
                  value={newLabel.name}
                  onChange={e => setNewLabel({ ...newLabel, name: e.target.value })}
                  placeholder="Nome da etiqueta"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                />
                <div className="flex flex-wrap gap-1">
                  {LABEL_COLORS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => setNewLabel({ ...newLabel, color: c.value })}
                      style={{ backgroundColor: c.value }}
                      className={`w-7 h-7 rounded ${newLabel.color === c.value ? 'ring-2 ring-offset-1 ring-foreground' : ''}`}
                      title={c.name}
                    />
                  ))}
                </div>
                <button
                  onClick={handleAddLabel}
                  className="w-full px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-bold"
                >
                  Adicionar
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-border">
              <button
                onClick={() => { if (confirm('Excluir este card?')) onDelete(card.id); }}
                className="w-full px-3 py-2 bg-red-500/10 text-red-500 rounded-lg text-sm font-bold hover:bg-red-500/20 flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" /> Excluir Card
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
