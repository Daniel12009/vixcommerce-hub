import { useState, useEffect, useMemo } from 'react';
import { Star, TrendingUp, TrendingDown, RefreshCw, Loader2, BarChart3, MessageSquare, X, Bot } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts';

interface ReviewSnapshot {
  id: string;
  plataforma: string;
  conta: string;
  item_id: string;
  item_title: string | null;
  rating_average: number;
  total_reviews: number;
  stars_1: number;
  stars_2: number;
  stars_3: number;
  stars_4: number;
  stars_5: number;
  snapshot_date: string;
}

const STAR_COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'];

export function AvaliacoesTab({ plataforma }: { plataforma: 'ml' | 'shopee' }) {
  const [snapshots, setSnapshots] = useState<ReviewSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [days, setDays] = useState(30);

  // Detalhes / Análise on-demand
  const [selectedItem, setSelectedItem] = useState<ReviewSnapshot | null>(null);
  const [activeStar, setActiveStar] = useState<number>(1);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState<{ summary: string; reviews: any[] } | null>(null);

  const loadSnapshots = async () => {
    setLoading(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceStr = since.toISOString().split('T')[0];

      const { data, error } = await (supabase
        .from('reviews_snapshots' as any)
        .select('*') as any)
        .eq('plataforma', plataforma)
        .gte('snapshot_date', sinceStr)
        .order('snapshot_date', { ascending: true });

      if (error) throw error;
      setSnapshots((data as ReviewSnapshot[]) ?? []);
    } catch (e: any) {
      console.error('Erro ao buscar snapshots:', e);
      toast.error('Erro ao carregar avaliações: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSnapshots(); }, [plataforma, days]);

  const forceSync = async () => {
    setFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-reviews');
      if (error) throw error;
      toast.success(`Avaliações sincronizadas! ${data?.snapshots ?? 0} snapshots salvos.`);
      await loadSnapshots();
    } catch (e: any) {
      toast.error('Erro ao sincronizar: ' + e.message);
    } finally {
      setFetching(false);
    }
  };

  const openItemDetails = (item: ReviewSnapshot) => {
    setSelectedItem(item);
    setActiveStar(1); // Default to 1 star (complaints)
    analyzeReviews(item, 1);
  };

  const analyzeReviews = async (item: ReviewSnapshot, star: number) => {
    setActiveStar(star);
    setAnalysisLoading(true);
    setAnalysisData(null);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-item-reviews', {
        body: { item_id: item.item_id, plataforma: item.plataforma, conta: item.conta, rating: star }
      });
      if (error) throw error;
      setAnalysisData(data);
    } catch (e: any) {
      toast.error('Erro ao analisar: ' + e.message);
    } finally {
      setAnalysisLoading(false);
    }
  };

  // ─── Computed data ───────────────────────────────────
  const stats = useMemo(() => {
    // Get the most recent snapshot per item
    const latestByItem = new Map<string, ReviewSnapshot>();
    for (const s of snapshots) {
      const existing = latestByItem.get(s.item_id);
      if (!existing || s.snapshot_date > existing.snapshot_date) {
        latestByItem.set(s.item_id, s);
      }
    }
    const latest = Array.from(latestByItem.values());

    const totalReviews = latest.reduce((sum, s) => sum + s.total_reviews, 0);
    const totalS1 = latest.reduce((sum, s) => sum + s.stars_1, 0);
    const totalS2 = latest.reduce((sum, s) => sum + s.stars_2, 0);
    const totalS3 = latest.reduce((sum, s) => sum + s.stars_3, 0);
    const totalS4 = latest.reduce((sum, s) => sum + s.stars_4, 0);
    const totalS5 = latest.reduce((sum, s) => sum + s.stars_5, 0);

    const weightedSum = totalS1 * 1 + totalS2 * 2 + totalS3 * 3 + totalS4 * 4 + totalS5 * 5;
    const avgRating = totalReviews > 0 ? weightedSum / totalReviews : 0;
    const pct5 = totalReviews > 0 ? (totalS5 / totalReviews) * 100 : 0;
    const pctNeg = totalReviews > 0 ? ((totalS1 + totalS2) / totalReviews) * 100 : 0;

    // Star distribution for bar chart
    const starDistribution = [
      { name: '5★', value: totalS5, fill: STAR_COLORS[4] },
      { name: '4★', value: totalS4, fill: STAR_COLORS[3] },
      { name: '3★', value: totalS3, fill: STAR_COLORS[2] },
      { name: '2★', value: totalS2, fill: STAR_COLORS[1] },
      { name: '1★', value: totalS1, fill: STAR_COLORS[0] },
    ];

    // Trend line: average rating per day (across all items)
    const byDate = new Map<string, { totalWeight: number; totalCount: number }>();
    for (const s of snapshots) {
      const existing = byDate.get(s.snapshot_date) ?? { totalWeight: 0, totalCount: 0 };
      existing.totalWeight += s.stars_1 * 1 + s.stars_2 * 2 + s.stars_3 * 3 + s.stars_4 * 4 + s.stars_5 * 5;
      existing.totalCount += s.total_reviews;
      byDate.set(s.snapshot_date, existing);
    }

    const trendData = Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { totalWeight, totalCount }]) => ({
        date: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        media: totalCount > 0 ? Math.round((totalWeight / totalCount) * 100) / 100 : 0,
        total: totalCount,
      }));

    // Top items (sorted by total reviews desc)
    const topItems = [...latest]
      .filter(s => s.total_reviews > 0)
      .sort((a, b) => b.total_reviews - a.total_reviews)
      .slice(0, 20);

    return { totalReviews, avgRating, pct5, pctNeg, starDistribution, trendData, topItems, itemCount: latest.length };
  }, [snapshots]);

  const renderStars = (avg: number) => {
    const full = Math.floor(avg);
    const stars = [];
    for (let i = 0; i < 5; i++) {
      stars.push(
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i < full ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'}`}
        />
      );
    }
    return <span className="flex items-center gap-0.5">{stars}</span>;
  };

  if (loading && snapshots.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
        <span className="ml-3 text-sm text-muted-foreground">Carregando avaliações...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Avaliações {plataforma === 'ml' ? 'Mercado Livre' : 'Shopee'}
          </h3>
          <p className="text-xs text-muted-foreground">{stats.itemCount} anúncios monitorados</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="px-2 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs outline-none"
          >
            <option value={7}>7 dias</option>
            <option value={14}>14 dias</option>
            <option value={30}>30 dias</option>
            <option value={60}>60 dias</option>
            <option value={90}>90 dias</option>
          </select>
          <button
            onClick={forceSync}
            disabled={fetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {fetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {fetching ? 'Sincronizando...' : 'Sincronizar Avaliações'}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Média Geral</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-2xl font-bold text-foreground">{stats.avgRating.toFixed(1)}</span>
            {renderStars(stats.avgRating)}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Total Avaliações</p>
          <p className="text-2xl font-bold text-foreground mt-2">{stats.totalReviews}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">5 Estrelas</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-2xl font-bold text-emerald-500">{stats.pct5.toFixed(0)}%</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Negativas (1-2★)</p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-2xl font-bold ${stats.pctNeg > 10 ? 'text-red-500' : 'text-emerald-500'}`}>
              {stats.pctNeg.toFixed(1)}%
            </span>
            {stats.pctNeg > 10 ? <TrendingDown className="w-4 h-4 text-red-500" /> : <TrendingDown className="w-4 h-4 text-emerald-500" />}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Trend Line */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Evolução da Média
          </h4>
          {stats.trendData.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={stats.trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number) => [value.toFixed(2), 'Média']}
                />
                <Line type="monotone" dataKey="media" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
              <BarChart3 className="w-8 h-8 mr-2 opacity-30" />
              Dados insuficientes para gráfico. Sincronize as avaliações!
            </div>
          )}
        </div>

        {/* Star Distribution */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            Distribuição de Estrelas
          </h4>
          {stats.totalReviews > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.starDistribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} width={35} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number) => [value, 'Avaliações']}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                  {stats.starDistribution.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
              <Star className="w-8 h-8 mr-2 opacity-30" />
              Nenhuma avaliação encontrada ainda.
            </div>
          )}
        </div>
      </div>

      {/* Top Items Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">
            Anúncios com Avaliações ({stats.topItems.length})
          </h4>
        </div>
        {stats.topItems.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Anúncio</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground w-28">Conta</th>
                  <th className="px-4 py-2 text-center font-medium text-muted-foreground w-24">Média</th>
                  <th className="px-4 py-2 text-center font-medium text-muted-foreground w-20">Total</th>
                  <th className="px-4 py-2 text-center font-medium text-muted-foreground w-16">5★</th>
                  <th className="px-4 py-2 text-center font-medium text-muted-foreground w-16">4★</th>
                  <th className="px-4 py-2 text-center font-medium text-muted-foreground w-16">3★</th>
                  <th className="px-4 py-2 text-center font-medium text-muted-foreground w-16">2★</th>
                  <th className="px-4 py-2 text-center font-medium text-muted-foreground w-16">1★</th>
                </tr>
              </thead>
              <tbody>
                {stats.topItems.map(s => (
                  <tr 
                    key={s.item_id} 
                    className="border-b border-border hover:bg-muted/10 transition-colors cursor-pointer"
                    onClick={() => openItemDetails(s)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground truncate max-w-[300px]">{s.item_title || s.item_id}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{s.item_id}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-muted text-foreground border border-border">
                        {s.conta}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {renderStars(s.rating_average)}
                        <span className="text-xs font-semibold text-foreground ml-1">{s.rating_average.toFixed(1)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-foreground">{s.total_reviews}</td>
                    <td className="px-4 py-3 text-center text-emerald-500 font-medium">{s.stars_5}</td>
                    <td className="px-4 py-3 text-center text-lime-500 font-medium">{s.stars_4}</td>
                    <td className="px-4 py-3 text-center text-amber-500 font-medium">{s.stars_3}</td>
                    <td className="px-4 py-3 text-center text-orange-500 font-medium">{s.stars_2}</td>
                    <td className="px-4 py-3 text-center text-red-500 font-medium">{s.stars_1}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Star className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p>Nenhuma avaliação encontrada. Clique em "Sincronizar" para buscar.</p>
          </div>
        )}
      </div>

      {/* Modal de Detalhes / Análise da IA */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
              <div>
                <h3 className="font-semibold text-foreground line-clamp-1 pr-4">{selectedItem.item_title || selectedItem.item_id}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Analisando avaliações via IA • {selectedItem.plataforma.toUpperCase()} ({selectedItem.conta})
                </p>
              </div>
              <button 
                onClick={() => setSelectedItem(null)}
                className="p-1.5 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
              
              {/* Star Tabs */}
              <div className="flex bg-muted/30 p-1 rounded-lg w-fit mx-auto">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    onClick={() => analyzeReviews(selectedItem, star)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                      activeStar === star 
                        ? 'bg-background shadow-sm text-foreground' 
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    {star} <Star className={`w-3.5 h-3.5 ${activeStar === star ? 'fill-amber-400 text-amber-400' : ''}`} />
                  </button>
                ))}
              </div>

              {/* Connteudo */}
              {analysisLoading ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                  <Bot className="w-10 h-10 text-primary animate-pulse mb-4" />
                  <p className="text-sm font-medium text-foreground">A IA está lendo as avaliações de {activeStar} estrela(s)...</p>
                  <p className="text-xs text-muted-foreground mt-2">Extraindo os principais pontos e reclamações para você.</p>
                </div>
              ) : analysisData ? (
                <div className="space-y-6 animate-fade-in">
                  
                  {/* Resumo IA */}
                  <div className="bg-primary/10 border border-primary/20 rounded-xl p-5">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-primary/20 rounded-lg shrink-0 mt-0.5">
                        <Bot className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
                          Diagnóstico Inteligente ({activeStar} Estrela{activeStar > 1 ? 's' : ''})
                        </h4>
                        <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                          {analysisData.summary}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Lista de Comentários */}
                  <div>
                    <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 px-1 flex items-center justify-between">
                      Comentários Reais Recebidos
                      <span className="bg-muted px-2 py-0.5 rounded-full text-[10px]">{analysisData.reviews.length} avaliações</span>
                    </h5>
                    
                    {analysisData.reviews.length > 0 ? (
                      <div className="space-y-3">
                        {analysisData.reviews.map((rev, idx) => (
                          <div key={idx} className="bg-muted/10 border border-border/50 rounded-lg p-3.5">
                            {rev.title && <h6 className="font-medium text-sm text-foreground mb-1">{rev.title}</h6>}
                            <p className="text-sm text-muted-foreground">{rev.content}</p>
                            <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-border/30 text-[11px] text-muted-foreground/70 font-mono">
                              <span>{new Date(rev.date).toLocaleDateString()}</span>
                              {rev.buyer && <span>• {rev.buyer}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-8">Nenhum comentário em texto para exibir nesta nota.</p>
                    )}
                  </div>

                </div>
              ) : null}

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
