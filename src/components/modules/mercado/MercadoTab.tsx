import { useState, useEffect } from 'react';
import { Plus, TrendingUp, TrendingDown, Minus, Crown, Search, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ScatterChart, Scatter, ZAxis,
} from 'recharts';

interface Props {
  segments: any[];
  sellers: any[];
  myAccounts: any[];
  onRefresh: () => void;
  callMarketData: (action: string, extra?: any) => Promise<any>;
}

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6'];

function SegmentCard({ seg, sellers, myAccounts, callMarketData }: { seg: any; sellers: any[]; myAccounts: any[]; callMarketData: any }) {
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const mySellerIds = new Set([
    ...myAccounts.map(a => a.seller_id),
    ...sellers.filter(s => s.is_minha_conta).map(s => s.seller_id),
  ]);

  const currentSnaps = seg.snapshots || [];
  const lider = seg.lider;
  const total_items = seg.total_items || 0;

  // Find my position in current snapshot
  const mySnap = currentSnaps.find((s: any) => mySellerIds.has(s.seller_id));
  const myPos = mySnap?.posicao ?? null;

  // Share: my sales / total
  const myVendas = currentSnaps
    .filter((s: any) => mySellerIds.has(s.seller_id))
    .reduce((acc: number, s: any) => acc + (s.vendas_estimadas || 0), 0);
  const totalVendas = seg.total_vendas_top || 0;
  const myShare = totalVendas > 0 ? (myVendas / totalVendas * 100) : 0;

  // Visibility insight
  const myVisible = myPos !== null;

  const posColor = myPos === null ? '#6b7280' : myPos <= 5 ? '#22c55e' : myPos <= 20 ? '#f59e0b' : '#ef4444';
  const shareColor = myShare >= 10 ? '#22c55e' : myShare >= 3 ? '#f59e0b' : myShare > 0 ? '#ef4444' : '#6b7280';

  const loadHistory = async () => {
    if (loadingHistory) return;
    setShowHistory(v => {
      if (!v) {
        setLoadingHistory(true);
        callMarketData('get_history', { segment_id: seg.id, days: 30 })
          .then((data: any[]) => {
            // Group by date (day), get my position per day
            const byDay = new Map<string, number>();
            (data || []).filter((s: any) => mySellerIds.has(s.seller_id)).forEach((s: any) => {
              const day = new Date(s.coletado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
              const pos = byDay.get(day);
              if (!pos || s.posicao < pos) byDay.set(day, s.posicao);
            });
            const chart = [...byDay.entries()].map(([date, pos]) => ({ date, posicao: pos })).slice(-20);
            setHistory(chart);
          })
          .catch(() => {})
          .finally(() => setLoadingHistory(false));
      }
      return !v;
    });
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-semibold text-foreground">{seg.nome}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{seg.keyword}</p>
          </div>
          {!myVisible && (
            <div className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full">
              <AlertCircle className="w-3 h-3" />
              Não aparece
            </div>
          )}
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Minha Pos.</p>
            <p className="text-2xl font-bold" style={{ color: posColor }}>
              {myPos !== null ? `#${myPos}` : '—'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Meu Share</p>
            <p className="text-2xl font-bold" style={{ color: shareColor }}>
              {myShare > 0 ? `${myShare.toFixed(1)}%` : '—'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Líder</p>
            {lider ? (
              <p className="text-xs font-semibold text-amber-400 flex items-center justify-center gap-1 mt-1">
                <Crown className="w-3 h-3" />
                <span className="truncate max-w-[70px]" title={lider.seller_nick}>{lider.seller_nick || lider.seller_id}</span>
              </p>
            ) : <p className="text-sm text-muted-foreground">—</p>}
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Itens No Top</p>
            <p className="text-2xl font-bold text-foreground">{total_items > 0 ? total_items : '—'}</p>
          </div>
        </div>

        {/* Insight: if not visible in your own keyword search */}
        {!myVisible && seg.keyword && (
          <div className="mt-3 text-xs text-amber-500 bg-amber-500/10 rounded-lg px-3 py-2">
            💡 <strong>Insight:</strong> Você não aparece no top {seg.top_n || 50} resultados para <em>"{seg.keyword}"</em>. Verifique o título do seu anúncio — provavelmente está faltando esta keyword.
          </div>
        )}

        {/* Top 3 from snapshot */}
        {currentSnaps.length > 0 && (
          <div className="mt-3 space-y-1">
            <p className="text-[10px] text-muted-foreground font-medium">Top 3 posições:</p>
            {currentSnaps.slice(0, 3).map((s: any, i: number) => {
              const isMe = mySellerIds.has(s.seller_id);
              return (
                <div key={i} className={`flex items-center gap-2 text-xs rounded px-2 py-1 ${isMe ? 'bg-indigo-500/10' : ''}`}>
                  <span className="w-5 text-center font-bold text-muted-foreground">#{s.posicao}</span>
                  <span className="flex-1 truncate text-foreground" title={s.titulo}>{s.titulo}</span>
                  <span className={`font-medium ${isMe ? 'text-indigo-400' : 'text-muted-foreground'}`}>{s.seller_nick}</span>
                  <span className="text-foreground font-semibold">R$ {(s.preco || 0).toFixed(0)}</span>
                </div>
              );
            })}
          </div>
        )}

        <button
          onClick={loadHistory}
          className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
        >
          {showHistory ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
          {showHistory ? 'Ocultar histórico' : 'Ver evolução 30 dias'}
          {loadingHistory && <span className="text-muted-foreground ml-1">…</span>}
        </button>
      </div>

      {/* History chart */}
      {showHistory && history.length > 0 && (
        <div className="border-t border-border px-5 py-4">
          <p className="text-xs font-medium text-foreground mb-3">Evolução da posição (menor = melhor)</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} />
              <YAxis reversed tick={{ fontSize: 9 }} domain={['dataMin - 2', 'dataMax + 2']} />
              <Tooltip formatter={(v: number) => `#${v}`} />
              <Line type="monotone" dataKey="posicao" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} name="Minha posição" />
            </LineChart>
          </ResponsiveContainer>
          {history.length === 0 && <p className="text-xs text-muted-foreground text-center">Sem histórico ainda. Rode mais coletas para ver a evolução.</p>}
        </div>
      )}

      {showHistory && !loadingHistory && history.length === 0 && (
        <div className="border-t border-border px-5 py-3 text-center">
          <p className="text-xs text-muted-foreground">Sem histórico da sua conta neste segmento. Execute mais coletas ao longo dos dias para ver a evolução.</p>
        </div>
      )}
    </div>
  );
}

export function MercadoTab({ segments, sellers, myAccounts, onRefresh, callMarketData }: Props) {
  const [addMode, setAddMode] = useState(false);
  const [newNome, setNewNome] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const [newCategoryId, setNewCategoryId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!newNome.trim() || !newKeyword.trim()) return toast.error('Nome e keyword são obrigatórios');
    setSaving(true);
    try {
      await callMarketData('add_segment', {
        nome: newNome, tipo: 'keyword',
        keyword: newKeyword,
        category_id: newCategoryId || null,
        top_n: 50,
      });
      toast.success('Segmento adicionado!');
      setAddMode(false); setNewNome(''); setNewKeyword(''); setNewCategoryId('');
      onRefresh();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  // Scatter data: price vs position for all snaps across segments
  const scatterData = segments.flatMap((seg: any) =>
    (seg.snapshots || []).slice(0, 10).map((s: any) => ({
      x: s.posicao, y: s.preco || 0, z: s.vendas_estimadas || 10, name: s.seller_nick,
    }))
  ).filter(d => d.x && d.y);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{segments.length} segmentos monitorados</p>
        <Button size="sm" variant="outline" onClick={() => setAddMode(v => !v)} className="gap-2">
          <Plus className="w-3.5 h-3.5" /> Novo Segmento
        </Button>
      </div>

      {addMode && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">Novo Segmento de Nicho</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input value={newNome} onChange={e => setNewNome(e.target.value)}
              className="px-3 py-2 rounded-lg bg-background border border-input text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="Nome do segmento" />
            <input value={newKeyword} onChange={e => setNewKeyword(e.target.value)}
              className="px-3 py-2 rounded-lg bg-background border border-input text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="Keyword exata (ex: torneira preta bica baixa)" />
            <input value={newCategoryId} onChange={e => setNewCategoryId(e.target.value)}
              className="px-3 py-2 rounded-lg bg-background border border-input text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="Category ID ML (opcional, ex: MLB1500)" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">{saving ? 'Salvando…' : 'Adicionar'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setAddMode(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {segments.length === 0 ? (
        <div className="text-center py-20">
          <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
          <h3 className="font-semibold text-foreground mb-1">Nenhum segmento ainda</h3>
          <p className="text-sm text-muted-foreground">Clique em "Atualizar Dados" para a primeira coleta dos segmentos pré-configurados.</p>
        </div>
      ) : (
        <>
          {/* Segment cards */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {segments.map(seg => (
              <SegmentCard
                key={seg.id}
                seg={seg}
                sellers={sellers}
                myAccounts={myAccounts}
                callMarketData={callMarketData}
              />
            ))}
          </div>

          {/* Scatter: Preço vs Posição */}
          {scatterData.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                🔵 Preço × Posição — Todos os Segmentos
              </h3>
              <p className="text-xs text-muted-foreground mb-4">Eixo X = posição no ranking · Eixo Y = preço do produto · Tamanho = vendas estimadas</p>
              <ResponsiveContainer width="100%" height={280}>
                <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" dataKey="x" name="Posição" tick={{ fontSize: 10 }} label={{ value: 'Posição', position: 'insideBottom', fontSize: 10, offset: -5 }} />
                  <YAxis type="number" dataKey="y" name="Preço" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `R$${v}`} />
                  <ZAxis type="number" dataKey="z" range={[40, 400]} />
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-card border border-border rounded-lg p-2 text-xs shadow">
                          <p className="font-medium">{d.name}</p>
                          <p>Posição: #{d.x}</p>
                          <p>Preço: R$ {d.y.toFixed(0)}</p>
                          <p>Vendas est.: {d.z}</p>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={scatterData} fill="#6366f1" fillOpacity={0.6} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
