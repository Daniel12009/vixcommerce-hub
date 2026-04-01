import { useState } from 'react';
import { Search, Crown, ExternalLink, TrendingUp, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { mlSearch, saveSearchSnapshot } from './mlSearch';

interface Props {
  mySellerIds: string[];
  callMarketData: (action: string, extra?: any) => Promise<any>; // kept for other uses
}

const LISTING_COLOR: Record<string, string> = {
  gold_pro:     '#f59e0b',
  gold_special: '#6366f1',
  gold_premium: '#8b5cf6',
  free:         '#6b7280',
};

export function MercadoTab({ mySellerIds }: Props) {
  const [keyword, setKeyword] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [limit, setLimit] = useState(30);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!keyword.trim() && !categoryId.trim()) return toast.error('Informe uma keyword ou ID de categoria');
    setLoading(true);
    setResult(null);
    try {
      const data = await mlSearch({
        keyword: keyword.trim() || undefined,
        categoryId: categoryId.trim() || undefined,
        mySellerIds,
        maxPages: 3,
      });
      setResult(data);
      // Save to DB for history (fire-and-forget, no await)
      saveSearchSnapshot(data, categoryId.trim() || undefined);
    } catch (err: any) {
      toast.error('Erro na busca: ' + err.message);
    } finally { setLoading(false); }
  };

  const myPositions = result?.my_positions || [];
  const ranking = result?.ranking || [];
  const lider = result?.lider;

  // Chart: share by seller (top 8 sellers aggregated)
  const sellerShare = (() => {
    if (!ranking.length) return [];
    const map = new Map<string, { nick: string; vendas: number; isMe: boolean }>();
    ranking.forEach((r: any) => {
      const key = r.seller_id;
      const prev = map.get(key) || { nick: r.seller_nick, vendas: 0, isMe: r.is_mine };
      map.set(key, { ...prev, vendas: prev.vendas + (r.vendas || 0) });
    });
    const totalV = [...map.values()].reduce((s, v) => s + v.vendas, 0) || 1;
    return [...map.values()]
      .sort((a, b) => b.vendas - a.vendas)
      .slice(0, 8)
      .map(v => ({ name: v.nick.slice(0, 14), share: Math.round(v.vendas / totalV * 1000) / 10, isMe: v.isMe }));
  })();

  return (
    <div className="space-y-6">
      {/* Search form */}
      <form onSubmit={handleSearch} className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground mb-1 flex items-center gap-2">
            <Search className="w-4 h-4 text-indigo-400" /> Busca de Ranking
          </h3>
          <p className="text-xs text-muted-foreground">
            Pesquise como se fosse um cliente e veja quem está no ranking — com seus produtos destacados.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="Keyword (ex: torneira preta bica baixa)…"
              className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-background border border-input text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <input
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            placeholder="Categoria ML (opcional, ex: MLB1500)"
            className="px-3 py-2.5 rounded-lg bg-background border border-input text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Top:</label>
            {[10, 30, 50].map(n => (
              <button key={n} type="button" onClick={() => setLimit(n)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${limit === n ? 'bg-indigo-600 text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                {n}
              </button>
            ))}
          </div>
          <button type="submit" disabled={loading}
            className="ml-auto flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
            {loading ? 'Buscando…' : 'Buscar Ranking'}
          </button>
        </div>
      </form>

      {/* Results */}
      {result && (
        <>
          {/* KPI bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Minha Posição</p>
              <p className="text-3xl font-bold" style={{ color: myPositions.length > 0 ? (myPositions[0].posicao <= 10 ? '#22c55e' : myPositions[0].posicao <= 30 ? '#f59e0b' : '#ef4444') : '#6b7280' }}>
                {myPositions.length > 0 ? `#${myPositions[0].posicao}` : 'Fora'}
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Meu Share</p>
              <p className="text-3xl font-bold" style={{ color: (result.my_share || 0) >= 10 ? '#22c55e' : (result.my_share || 0) >= 3 ? '#f59e0b' : '#6b7280' }}>
                {result.my_share > 0 ? `${result.my_share}%` : '0%'}
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Resultados</p>
              <p className="text-3xl font-bold text-foreground">{result.total_results?.toLocaleString('pt-BR') || '—'}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Líder</p>
              {lider ? (
                <p className="text-sm font-semibold text-amber-400 flex items-center justify-center gap-1 mt-1">
                  <Crown className="w-4 h-4" /> {lider.seller_nick.slice(0, 18)}
                </p>
              ) : <p className="text-2xl text-muted-foreground">—</p>}
            </div>
          </div>

          {/* Not visible insight */}
          {myPositions.length === 0 && (
            <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-sm">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-400">Seus anúncios não aparecem no top {limit}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Isso significa que para a keyword <em>"{keyword}"</em>, o ML não está ranqueando seus produtos. Verifique se a keyword está no título, e se o anúncio está ativo e com estoque.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Ranking table */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <p className="text-sm font-semibold text-foreground">Top {ranking.length} do Ranking</p>
              </div>
              <div className="divide-y divide-border/40 max-h-[500px] overflow-y-auto">
                {ranking.map((item: any) => (
                  <div key={item.item_id}
                    className={`flex items-center gap-3 px-4 py-3 text-xs ${item.is_mine ? 'bg-indigo-500/10 border-l-2 border-indigo-500' : ''}`}>
                    <span className={`w-7 text-center font-bold flex-shrink-0 text-sm ${item.is_mine ? 'text-indigo-400' : 'text-muted-foreground'}`}>
                      #{item.posicao}
                    </span>
                    {item.thumbnail && (
                      <img src={item.thumbnail.replace('http://', 'https://')} alt=""
                        className="w-9 h-9 object-contain rounded bg-muted flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`truncate font-medium ${item.is_mine ? 'text-indigo-300' : 'text-foreground'}`} title={item.titulo}>{item.titulo}</p>
                      <p className="text-muted-foreground">{item.seller_nick}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 text-right">
                      <div>
                        <p className="font-bold text-foreground">R$ {item.preco.toFixed(0)}</p>
                        {item.free_shipping && <p className="text-emerald-400 text-[10px]">Grátis</p>}
                      </div>
                      {item.listing_type && (
                        <div className="w-2 h-2 rounded-full" style={{ background: LISTING_COLOR[item.listing_type] || '#6b7280' }} title={item.listing_type} />
                      )}
                      {item.permalink && (
                        <a href={item.permalink} target="_blank" rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-indigo-400">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Share chart */}
            {sellerShare.length > 0 && (
              <div className="bg-card border border-border rounded-2xl p-5">
                <p className="text-sm font-semibold text-foreground mb-4">Share por Seller (Top 8)</p>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={sellerShare} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 10 }} unit="%" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Bar dataKey="share" radius={[0, 4, 4, 0]}>
                      {sellerShare.map((entry, i) => (
                        <Cell key={i} fill={entry.isMe ? '#6366f1' : '#334155'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-indigo-500 inline-block" /> Minhas contas</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-slate-600 inline-block" /> Concorrentes</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {!result && !loading && (
        <div className="text-center py-16 text-muted-foreground">
          <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-sm">Digite uma keyword e clique em Buscar Ranking para ver sua posição no ML.</p>
          <p className="text-xs mt-1 opacity-60">Ex: "torneira preta bica baixa", "cuba inox sobrepor", "luminaria pendente industrial"</p>
        </div>
      )}
    </div>
  );
}
