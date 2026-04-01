import { useState } from 'react';
import { Plus, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Crown, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';

interface Props {
  segments: any[];
  onRefresh: () => void;
  callMarketData: (action: string, extra?: any) => Promise<any>;
}

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#8b5cf6'];

export function CategoriasTab({ segments, onRefresh, callMarketData }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [newNome, setNewNome] = useState('');
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const [newTopN, setNewTopN] = useState(50);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const handleToggle = async (seg: any) => {
    setToggling(seg.id);
    try {
      await callMarketData('toggle_segment', { segment_id: seg.id, ativo: !seg.ativo });
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally { setToggling(null); }
  };

  const handleAdd = async () => {
    if (!newNome.trim()) return toast.error('Nome é obrigatório');
    setSaving(true);
    try {
      await callMarketData('add_segment', {
        nome: newNome, tipo: 'categoria',
        category_id: newCategoryId || null,
        keyword: newKeyword || null, top_n: newTopN,
      });
      toast.success('Categoria adicionada!');
      setAddMode(false); setNewNome(''); setNewCategoryId(''); setNewKeyword(''); setNewTopN(50);
      onRefresh();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  if (segments.length === 0) {
    return (
      <div className="text-center py-20">
        <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
        <h3 className="font-semibold text-foreground mb-1">Nenhuma categoria configurada</h3>
        <p className="text-sm text-muted-foreground mb-4">Clique em "Atualizar Dados" para popular com os dados da primeira coleta.</p>
        <Button size="sm" variant="outline" onClick={() => setAddMode(true)} className="gap-2">
          <Plus className="w-3.5 h-3.5" /> Adicionar Categoria
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setAddMode(v => !v)} className="gap-2">
          <Plus className="w-3.5 h-3.5" /> Adicionar Categoria
        </Button>
      </div>

      {addMode && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">Nova Categoria</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input value={newNome} onChange={e => setNewNome(e.target.value)}
              className="px-3 py-2 rounded-lg bg-background border border-input text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="Nome da categoria" />
            <input value={newCategoryId} onChange={e => setNewCategoryId(e.target.value)}
              className="px-3 py-2 rounded-lg bg-background border border-input text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="ID da categoria ML (ex: MLB1500)" />
            <input value={newKeyword} onChange={e => setNewKeyword(e.target.value)}
              className="px-3 py-2 rounded-lg bg-background border border-input text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 col-span-full"
              placeholder="Keyword principal (ex: torneira banheiro monocomando)" />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground">Top N produtos:</label>
            <input type="number" value={newTopN} onChange={e => setNewTopN(parseInt(e.target.value))}
              className="w-20 px-2 py-1 rounded-lg bg-background border border-input text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" />
            <Button size="sm" onClick={handleAdd} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white ml-auto">{saving ? 'Salvando…' : 'Adicionar'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setAddMode(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {segments.map(seg => {
        const lider = seg.lider;
        const topSnaps = (seg.snapshots || []).slice(0, 8);
        const chartData = topSnaps.map((s: any, i: number) => ({
          name: (s.seller_nick || s.seller_id || '').slice(0, 12),
          preco: s.preco || 0,
          pos: i + 1,
          vendas: s.vendas_estimadas || 0,
        }));
        const isExpanded = expanded === seg.id;

        return (
          <div key={seg.id} className={`border rounded-2xl overflow-hidden transition-all ${seg.ativo ? 'border-border' : 'border-border/40 opacity-60'}`}>
            {/* Header row */}
            <div className="flex items-center gap-4 px-5 py-4 bg-card">
              <button onClick={() => handleToggle(seg)} disabled={toggling === seg.id} className="flex-shrink-0">
                {seg.ativo
                  ? <ToggleRight className="w-6 h-6 text-emerald-400" />
                  : <ToggleLeft className="w-6 h-6 text-muted-foreground" />}
              </button>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">{seg.nome}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  {seg.keyword && <span className="text-[11px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">{seg.keyword}</span>}
                  {seg.category_id && <span className="text-[11px] text-muted-foreground">Cat: {seg.category_id}</span>}
                </div>
              </div>

              <div className="flex items-center gap-6 text-center flex-shrink-0">
                {lider && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">Líder atual</p>
                    <p className="text-xs font-semibold text-amber-400 flex items-center gap-1">
                      <Crown className="w-3 h-3" /> {(lider.seller_nick || lider.seller_id || '').slice(0, 15)}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-muted-foreground">Itens</p>
                  <p className="text-sm font-bold text-foreground">{seg.total_items || '—'}</p>
                </div>
                {seg.ultima_coleta && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">Última coleta</p>
                    <p className="text-[11px] text-foreground">{new Date(seg.ultima_coleta).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                )}
                <button onClick={() => setExpanded(isExpanded ? null : seg.id)}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Expanded ranking */}
            {isExpanded && topSnaps.length > 0 && (
              <div className="border-t border-border px-5 py-4 bg-muted/10">
                <p className="text-xs font-semibold text-foreground mb-3">Top {topSnaps.length} produtos — distribuição de preços</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => `R$${v}`} />
                    <Tooltip formatter={(v: number) => `R$ ${v.toFixed(0)}`} />
                    <Bar dataKey="preco" radius={[4, 4, 0, 0]}>
                      {chartData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      <LabelList dataKey="preco" position="top" formatter={(v: number) => `R$${v.toFixed(0)}`} fontSize={8} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                <div className="mt-3 space-y-1">
                  {topSnaps.slice(0, 5).map((s: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 text-xs">
                      <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center font-bold text-muted-foreground">{i + 1}</span>
                      <span className="text-foreground font-medium flex-1 truncate" title={s.titulo}>{s.titulo}</span>
                      <span className="text-muted-foreground">{s.seller_nick || s.seller_id}</span>
                      <span className="font-semibold text-foreground">R$ {(s.preco || 0).toFixed(0)}</span>
                      {s.free_shipping && <span className="text-emerald-400 text-[10px]">Grátis</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
