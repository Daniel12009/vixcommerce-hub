import { useEffect, useState, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  ArrowLeft, Plus, MoreVertical, Trash2, Pencil, Calendar, CheckSquare,
  MessageSquare, User as UserIcon, Star, X, Loader2, GripVertical
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { toast } from 'sonner';
import type { KanbanProject, KanbanColumn, KanbanCard } from './types';
import { CardDetailModal } from './CardDetailModal';

interface Props {
  project: KanbanProject;
  onBack: () => void;
}

export function ProjectBoard({ project, onBack }: Props) {
  const { user, allUsers } = useAuth();
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);
  const [openCard, setOpenCard] = useState<KanbanCard | null>(null);
  const [addingColumnFor, setAddingColumnFor] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [showNewColumn, setShowNewColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [editingColumn, setEditingColumn] = useState<KanbanColumn | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const Icon = (LucideIcons as any)[project.icon] || LucideIcons.Folder;

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: cols }, { data: crds }] = await Promise.all([
      (supabase as any).from('kanban_columns').select('*').eq('project_id', project.id).order('position'),
      (supabase as any).from('kanban_cards').select('*').eq('project_id', project.id).order('position'),
    ]);
    setColumns((cols || []) as KanbanColumn[]);
    setCards((crds || []) as KanbanCard[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [project.id]);

  const cardsByColumn = useMemo(() => {
    const map: Record<string, KanbanCard[]> = {};
    columns.forEach(c => { map[c.id] = []; });
    cards.forEach(c => {
      if (!map[c.column_id]) map[c.column_id] = [];
      map[c.column_id].push(c);
    });
    Object.keys(map).forEach(k => map[k].sort((a, b) => a.position - b.position));
    return map;
  }, [columns, cards]);

  /* ───────── Column CRUD ───────── */
  const handleAddColumn = async () => {
    if (!newColumnName.trim()) return;
    const { data, error } = await (supabase as any)
      .from('kanban_columns')
      .insert([{
        project_id: project.id,
        name: newColumnName.trim(),
        color: '#64748b',
        position: columns.length,
      }])
      .select()
      .single();
    if (error || !data) return toast.error('Erro ao criar coluna');
    setColumns([...columns, data as KanbanColumn]);
    setNewColumnName('');
    setShowNewColumn(false);
  };

  const handleRenameColumn = async () => {
    if (!editingColumn) return;
    const { error } = await (supabase as any)
      .from('kanban_columns')
      .update({ name: editingColumn.name, color: editingColumn.color })
      .eq('id', editingColumn.id);
    if (error) return toast.error('Erro');
    setColumns(columns.map(c => c.id === editingColumn.id ? editingColumn : c));
    setEditingColumn(null);
  };

  const handleDeleteColumn = async (id: string) => {
    if (!confirm('Excluir esta coluna e todos os cards dentro?')) return;
    await (supabase as any).from('kanban_columns').delete().eq('id', id);
    setColumns(columns.filter(c => c.id !== id));
    setCards(cards.filter(c => c.column_id !== id));
  };

  /* ───────── Card CRUD ───────── */
  const handleAddCard = async (columnId: string) => {
    if (!newCardTitle.trim()) return;
    const colCards = cardsByColumn[columnId] || [];
    const { data, error } = await (supabase as any)
      .from('kanban_cards')
      .insert([{
        column_id: columnId,
        project_id: project.id,
        title: newCardTitle.trim(),
        position: colCards.length,
        created_by_email: user?.username || '',
        assigned_to_email: user?.username || '',
      }])
      .select()
      .single();
    if (error || !data) return toast.error('Erro ao criar card');
    setCards([...cards, data as KanbanCard]);
    setNewCardTitle('');
    setAddingColumnFor(null);
  };

  const updateCardLocal = (updated: KanbanCard) => {
    setCards(cards.map(c => c.id === updated.id ? updated : c));
    if (openCard?.id === updated.id) setOpenCard(updated);
  };

  const handleDeleteCard = async (id: string) => {
    await (supabase as any).from('kanban_cards').delete().eq('id', id);
    setCards(cards.filter(c => c.id !== id));
    setOpenCard(null);
  };

  /* ───────── DnD ───────── */
  const findCard = (id: string) => cards.find(c => c.id === id);
  const findColumnIdOfCard = (cardId: string) => cards.find(c => c.id === cardId)?.column_id;

  const handleDragStart = (e: DragStartEvent) => {
    const card = findCard(String(e.active.id));
    if (card) setActiveCard(card);
  };

  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const activeColId = findColumnIdOfCard(activeId);
    // Over pode ser uma coluna (se vazia) ou um card de outra coluna
    const overIsColumn = columns.some(c => c.id === overId);
    const overColId = overIsColumn ? overId : findColumnIdOfCard(overId);
    if (!activeColId || !overColId || activeColId === overColId) return;

    setCards(prev => {
      const activeIdx = prev.findIndex(c => c.id === activeId);
      if (activeIdx < 0) return prev;
      const updated = [...prev];
      updated[activeIdx] = { ...updated[activeIdx], column_id: overColId };
      return updated;
    });
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveCard(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    const activeCardObj = findCard(activeId);
    if (!activeCardObj) return;

    const overIsColumn = columns.some(c => c.id === overId);
    const targetColId = overIsColumn ? overId : findColumnIdOfCard(overId);
    if (!targetColId) return;

    // Reordena dentro da coluna alvo
    setCards(prev => {
      const colCards = prev.filter(c => c.column_id === targetColId);
      const otherCards = prev.filter(c => c.column_id !== targetColId);
      const oldIdx = colCards.findIndex(c => c.id === activeId);
      let newIdx = colCards.findIndex(c => c.id === overId);
      if (newIdx < 0) newIdx = colCards.length - 1;
      const reordered = oldIdx >= 0 && newIdx >= 0
        ? arrayMove(colCards, oldIdx, newIdx)
        : colCards;
      const final = reordered.map((c, i) => ({ ...c, position: i, column_id: targetColId }));

      // Persiste em background
      Promise.all(final.map(c =>
        (supabase as any).from('kanban_cards')
          .update({ column_id: c.column_id, position: c.position })
          .eq('id', c.id)
      )).catch(() => toast.error('Erro ao salvar ordem'));

      return [...otherCards, ...final];
    });
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${project.color}20`, color: project.color }}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-foreground">{project.name}</h3>
            {project.description && (
              <p className="text-xs text-muted-foreground">{project.description}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowNewColumn(true)}
          className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg text-sm font-medium hover:bg-muted text-foreground"
        >
          <Plus className="w-4 h-4" /> Nova Coluna
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1">
            {columns.map(col => (
              <ColumnView
                key={col.id}
                column={col}
                cards={cardsByColumn[col.id] || []}
                isAdding={addingColumnFor === col.id}
                newCardTitle={newCardTitle}
                onNewCardTitleChange={setNewCardTitle}
                onStartAdd={() => { setAddingColumnFor(col.id); setNewCardTitle(''); }}
                onCancelAdd={() => setAddingColumnFor(null)}
                onConfirmAdd={() => handleAddCard(col.id)}
                onOpenCard={setOpenCard}
                onEditColumn={() => setEditingColumn(col)}
                onDeleteColumn={() => handleDeleteColumn(col.id)}
              />
            ))}

            {showNewColumn && (
              <div className="flex-shrink-0 w-72 bg-card border border-border rounded-2xl p-3">
                <input
                  autoFocus
                  value={newColumnName}
                  onChange={e => setNewColumnName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddColumn(); if (e.key === 'Escape') setShowNewColumn(false); }}
                  placeholder="Nome da coluna"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm mb-2"
                />
                <div className="flex gap-2">
                  <button onClick={handleAddColumn} className="flex-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-bold">
                    Adicionar
                  </button>
                  <button onClick={() => setShowNewColumn(false)} className="px-3 py-1.5 text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <DragOverlay>
            {activeCard && <CardView card={activeCard} onClick={() => {}} dragging />}
          </DragOverlay>
        </DndContext>
      )}

      {/* Column edit modal */}
      {editingColumn && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditingColumn(null)}>
          <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h4 className="font-bold text-foreground mb-4">Editar Coluna</h4>
            <input
              value={editingColumn.name}
              onChange={e => setEditingColumn({ ...editingColumn, name: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm mb-3"
            />
            <label className="text-xs font-semibold text-muted-foreground block mb-2">Cor</label>
            <input
              type="color"
              value={editingColumn.color}
              onChange={e => setEditingColumn({ ...editingColumn, color: e.target.value })}
              className="w-full h-10 rounded-lg border border-border"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditingColumn(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
              <button onClick={handleRenameColumn} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Card detail modal */}
      {openCard && (
        <CardDetailModal
          card={openCard}
          allUsers={allUsers}
          onClose={() => setOpenCard(null)}
          onUpdate={updateCardLocal}
          onDelete={handleDeleteCard}
        />
      )}
    </div>
  );
}

/* ━━━━━━━━━━ Column ━━━━━━━━━━ */
interface ColumnProps {
  column: KanbanColumn;
  cards: KanbanCard[];
  isAdding: boolean;
  newCardTitle: string;
  onNewCardTitleChange: (v: string) => void;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onConfirmAdd: () => void;
  onOpenCard: (c: KanbanCard) => void;
  onEditColumn: () => void;
  onDeleteColumn: () => void;
}

function ColumnView({
  column, cards, isAdding, newCardTitle, onNewCardTitleChange,
  onStartAdd, onCancelAdd, onConfirmAdd, onOpenCard, onEditColumn, onDeleteColumn,
}: ColumnProps) {
  const { setNodeRef, isOver } = useSortableColumn(column.id);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 bg-muted/30 border border-border rounded-2xl flex flex-col max-h-[calc(100vh-280px)] transition ${isOver ? 'ring-2 ring-primary/40' : ''}`}
    >
      <div className="p-3 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: column.color }} />
          <h4 className="font-bold text-sm text-foreground truncate">{column.name}</h4>
          <span className="text-xs text-muted-foreground bg-background px-1.5 py-0.5 rounded">{cards.length}</span>
        </div>
        <div className="relative">
          <button onClick={() => setMenuOpen(!menuOpen)} className="p-1 rounded hover:bg-muted text-muted-foreground">
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-40 bg-popover border border-border rounded-lg shadow-lg z-20 py-1">
                <button
                  onClick={() => { setMenuOpen(false); onEditColumn(); }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2 text-foreground"
                >
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onDeleteColumn(); }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2 text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map(card => (
            <SortableCard key={card.id} card={card} onClick={() => onOpenCard(card)} />
          ))}
        </SortableContext>

        {isAdding ? (
          <div className="bg-card border border-border rounded-lg p-2">
            <textarea
              autoFocus
              value={newCardTitle}
              onChange={e => onNewCardTitleChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onConfirmAdd(); } if (e.key === 'Escape') onCancelAdd(); }}
              placeholder="Título do card"
              className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm resize-none"
              rows={2}
            />
            <div className="flex gap-2 mt-2">
              <button onClick={onConfirmAdd} className="flex-1 px-3 py-1 bg-primary text-primary-foreground rounded text-xs font-bold">Adicionar</button>
              <button onClick={onCancelAdd} className="px-2 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
          </div>
        ) : (
          <button
            onClick={onStartAdd}
            className="w-full p-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" /> Adicionar card
          </button>
        )}
      </div>
    </div>
  );
}

function useSortableColumn(id: string) {
  // Coluna como drop zone
  const { setNodeRef, isOver } = useSortable({ id, data: { type: 'column' } });
  return { setNodeRef, isOver };
}

/* ━━━━━━━━━━ Sortable Card ━━━━━━━━━━ */
function SortableCard({ card, onClick }: { card: KanbanCard; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CardView card={card} onClick={onClick} />
    </div>
  );
}

function CardView({ card, onClick, dragging }: { card: KanbanCard; onClick: () => void; dragging?: boolean }) {
  const checklistDone = card.checklist?.filter((i: any) => i.done).length || 0;
  const checklistTotal = card.checklist?.length || 0;
  const overdue = card.due_date && new Date(card.due_date) < new Date() && !card.completed;

  return (
    <div
      onClick={onClick}
      className={`bg-card border border-border rounded-lg p-2.5 cursor-pointer hover:border-primary/40 hover:shadow-sm transition ${dragging ? 'rotate-3 shadow-xl' : ''}`}
    >
      {card.labels && card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {card.labels.map((l: any) => (
            <span
              key={l.id}
              className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white"
              style={{ backgroundColor: l.color }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}
      <p className="text-sm text-foreground font-medium leading-snug">{card.title}</p>
      {(card.due_date || checklistTotal > 0 || card.points > 0 || card.assigned_to_email) && (
        <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px] text-muted-foreground">
          {card.due_date && (
            <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${overdue ? 'bg-red-500/10 text-red-500' : 'bg-muted'}`}>
              <Calendar className="w-3 h-3" />
              {new Date(card.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </span>
          )}
          {checklistTotal > 0 && (
            <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${checklistDone === checklistTotal ? 'bg-green-500/10 text-green-500' : 'bg-muted'}`}>
              <CheckSquare className="w-3 h-3" />
              {checklistDone}/{checklistTotal}
            </span>
          )}
          {card.points > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600">
              <Star className="w-3 h-3 fill-current" /> {card.points}
            </span>
          )}
          {card.assigned_to_email && (
            <span className="ml-auto flex items-center gap-1 bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold uppercase">
              {card.assigned_to_email.slice(0, 2)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
