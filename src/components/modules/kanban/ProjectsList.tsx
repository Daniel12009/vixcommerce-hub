import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Trash2, Archive, Layout, Loader2, ChevronRight, Pencil } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { toast } from 'sonner';
import type { KanbanProject } from './types';
import { PROJECT_COLORS, PROJECT_ICONS } from './types';

interface Props {
  onOpenProject: (project: KanbanProject) => void;
}

const DEFAULT_COLUMNS = [
  { name: 'A Fazer', color: '#64748b' },
  { name: 'Em Progresso', color: '#3b82f6' },
  { name: 'Concluído', color: '#22c55e' },
];

export function ProjectsList({ onOpenProject }: Props) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<KanbanProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cardCounts, setCardCounts] = useState<Record<string, number>>({});
  const [form, setForm] = useState({
    name: '',
    description: '',
    color: PROJECT_COLORS[0],
    icon: 'Folder',
  });

  const fetchProjects = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('kanban_projects')
      .select('*')
      .eq('archived', false)
      .order('position', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Erro ao carregar projetos');
      setLoading(false);
      return;
    }
    const list = (data || []) as KanbanProject[];
    setProjects(list);

    if (list.length) {
      const { data: cards } = await (supabase as any)
        .from('kanban_cards')
        .select('project_id')
        .in('project_id', list.map(p => p.id));
      const counts: Record<string, number> = {};
      (cards || []).forEach((c: any) => {
        counts[c.project_id] = (counts[c.project_id] || 0) + 1;
      });
      setCardCounts(counts);
    }
    setLoading(false);
  };

  useEffect(() => { fetchProjects(); }, []);

  const resetForm = () => {
    setForm({ name: '', description: '', color: PROJECT_COLORS[0], icon: 'Folder' });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return toast.error('Dê um nome ao projeto');

    if (editingId) {
      const { error } = await (supabase as any)
        .from('kanban_projects')
        .update({
          name: form.name.trim(),
          description: form.description,
          color: form.color,
          icon: form.icon,
        })
        .eq('id', editingId);
      if (error) return toast.error('Erro ao salvar');
      toast.success('Projeto atualizado');
    } else {
      const { data: created, error } = await (supabase as any)
        .from('kanban_projects')
        .insert([{
          name: form.name.trim(),
          description: form.description,
          color: form.color,
          icon: form.icon,
          created_by_email: user?.username || '',
          position: projects.length,
        }])
        .select()
        .single();
      if (error || !created) return toast.error('Erro ao criar');

      // Cria 3 colunas padrão
      await (supabase as any).from('kanban_columns').insert(
        DEFAULT_COLUMNS.map((c, idx) => ({
          project_id: created.id,
          name: c.name,
          color: c.color,
          position: idx,
        }))
      );
      toast.success('Projeto criado');
    }
    resetForm();
    fetchProjects();
  };

  const handleEdit = (p: KanbanProject) => {
    setForm({ name: p.name, description: p.description, color: p.color, icon: p.icon });
    setEditingId(p.id);
    setShowForm(true);
  };

  const handleArchive = async (id: string) => {
    if (!confirm('Arquivar este projeto?')) return;
    await (supabase as any).from('kanban_projects').update({ archived: true }).eq('id', id);
    toast.success('Projeto arquivado');
    fetchProjects();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este projeto e TODOS seus cards? Esta ação é permanente.')) return;
    await (supabase as any).from('kanban_projects').delete().eq('id', id);
    toast.success('Projeto excluído');
    fetchProjects();
  };

  const Icon = (name: string) => {
    const C = (LucideIcons as any)[name] || LucideIcons.Folder;
    return C;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Layout className="w-5 h-5 text-primary" />
            Projetos
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Organize tarefas em quadros estilo Kanban (Marketing, Expedição, Full, etc.)
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-md shadow-primary/20 hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> Novo Projeto
        </button>
      </div>

      {showForm && (
        <div className="bg-card border border-border p-5 rounded-2xl animate-in fade-in slide-in-from-top-4 duration-300">
          <h4 className="font-bold text-foreground mb-4">{editingId ? 'Editar Projeto' : 'Novo Projeto'}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Nome</label>
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Marketing, Expedição, Controle Full"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Descrição (opcional)</label>
              <input
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Breve descrição"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-2">Cor</label>
              <div className="flex flex-wrap gap-2">
                {PROJECT_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setForm({ ...form, color: c })}
                    style={{ backgroundColor: c }}
                    className={`w-8 h-8 rounded-lg transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-foreground scale-110' : ''}`}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-2">Ícone</label>
              <div className="flex flex-wrap gap-2">
                {PROJECT_ICONS.map(name => {
                  const I = Icon(name);
                  return (
                    <button
                      key={name}
                      onClick={() => setForm({ ...form, icon: name })}
                      className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${form.icon === name ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-muted'}`}
                    >
                      <I className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={resetForm} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              Cancelar
            </button>
            <button onClick={handleSubmit} className="px-6 py-2 bg-primary text-primary-foreground font-bold rounded-lg hover:opacity-90 text-sm">
              {editingId ? 'Salvar' : 'Criar Projeto'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
          <Layout className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-muted-foreground font-medium">Nenhum projeto ainda</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Crie seu primeiro projeto para começar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {projects.map(p => {
            const I = Icon(p.icon);
            const count = cardCounts[p.id] || 0;
            return (
              <div
                key={p.id}
                className="group relative bg-card border border-border rounded-2xl overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all"
              >
                <div className="h-2" style={{ backgroundColor: p.color }} />
                <button
                  onClick={() => onOpenProject(p)}
                  className="w-full p-5 text-left"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${p.color}20`, color: p.color }}
                    >
                      <I className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-foreground truncate">{p.name}</h4>
                      {p.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{p.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-medium">
                      {count} {count === 1 ? 'card' : 'cards'}
                    </span>
                    <span className="flex items-center gap-1 text-primary font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                      Abrir <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </button>
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEdit(p); }}
                    className="p-1.5 rounded-md bg-background/80 backdrop-blur hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="Editar"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleArchive(p.id); }}
                    className="p-1.5 rounded-md bg-background/80 backdrop-blur hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="Arquivar"
                  >
                    <Archive className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                    className="p-1.5 rounded-md bg-background/80 backdrop-blur hover:bg-red-500/10 text-muted-foreground hover:text-red-500"
                    title="Excluir"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
