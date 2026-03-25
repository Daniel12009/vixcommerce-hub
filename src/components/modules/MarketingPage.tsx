import { useState, useEffect, useCallback, useMemo } from 'react';
import { Megaphone, TrendingUp, DollarSign, RefreshCw, Loader2, BarChart3, Target, Eye, MousePointerClick, Clock, Filter } from 'lucide-react';
import { KpiCard } from '@/components/shared/KpiCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatBRL, formatPercent } from '@/lib/utils-vix';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface MLCampaign {
  id: string; name: string; status: string; budget: number;
  metrics: { clicks?: number; prints?: number; cost?: number; ctr?: number; cpc?: number };
  conta: string; account_id: string;
}
interface MLAdItem {
  item_id: string; campaign_id: string; title: string; status: string;
  metrics: { clicks?: number; prints?: number; cost?: number; ctr?: number; cpc?: number };
  conta: string;
}

// Module-level cache
let _cachedAds: { campaigns: MLCampaign[]; items: MLAdItem[] } | null = null;

export function MarketingPage() {
  const [campaigns, setCampaigns] = useState<MLCampaign[]>(_cachedAds?.campaigns || []);
  const [adItems, setAdItems] = useState<MLAdItem[]>(_cachedAds?.items || []);
  const [loading, setLoading] = useState(!_cachedAds);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState('');
  const [filterConta, setFilterConta] = useState('all');

  const fetchAds = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('mercado-livre', { body: { action: 'get_ads_data' } });
      if (fnError) throw new Error(fnError.message);
      const c = data?.campaigns || [];
      const items = data?.items || [];
      setCampaigns(c);
      setAdItems(items);
      _cachedAds = { campaigns: c, items };
      setLastRefresh(new Date().toLocaleString('pt-BR'));
      if (!showSpinner) toast.success(`ADS atualizado: ${c.length} campanhas, ${items.length} anúncios`);
    } catch (err: any) {
      setError(err.message);
      console.error('Ads fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (_cachedAds) { fetchAds(false); } else { fetchAds(true); }
  }, [fetchAds]);

  // ━━━ Filter by Account ━━━
  const contas = useMemo(() => [...new Set(campaigns.map(c => c.conta).filter(Boolean))].sort(), [campaigns]);
  const filteredCampaigns = useMemo(() => filterConta === 'all' ? campaigns : campaigns.filter(c => c.conta === filterConta), [campaigns, filterConta]);
  const filteredAds = useMemo(() => filterConta === 'all' ? adItems : adItems.filter(a => a.conta === filterConta), [adItems, filterConta]);

  // ━━━ Computed Metrics ━━━
  const totalInvestimento = useMemo(() => filteredCampaigns.reduce((s, c) => s + (c.metrics?.cost || 0), 0), [filteredCampaigns]);
  const totalCliques = useMemo(() => filteredCampaigns.reduce((s, c) => s + (c.metrics?.clicks || 0), 0), [filteredCampaigns]);
  const totalImpressoes = useMemo(() => filteredCampaigns.reduce((s, c) => s + (c.metrics?.prints || 0), 0), [filteredCampaigns]);
  const ctrMedio = totalImpressoes > 0 ? (totalCliques / totalImpressoes) * 100 : 0;
  const cpcMedio = totalCliques > 0 ? totalInvestimento / totalCliques : 0;

  // Chart: Investment per campaign
  const campChart = useMemo(() =>
    filteredCampaigns.map(c => ({
      name: c.name.length > 20 ? c.name.slice(0, 20) + '...' : c.name,
      investimento: Number((c.metrics?.cost || 0).toFixed(2)),
      cliques: c.metrics?.clicks || 0,
      impressoes: c.metrics?.prints || 0,
    })).sort((a, b) => b.investimento - a.investimento).slice(0, 15),
  [filteredCampaigns]);

  // Chart: Top ad items by clicks
  const topAds = useMemo(() =>
    [...filteredAds]
      .sort((a, b) => (b.metrics?.clicks || 0) - (a.metrics?.clicks || 0))
      .slice(0, 20),
  [filteredAds]);

  const statusColor = (s: string) => {
    if (s === 'active' || s === 'enabled') return 'text-emerald-400 bg-emerald-400/10';
    if (s === 'paused') return 'text-yellow-400 bg-yellow-400/10';
    return 'text-muted-foreground bg-muted';
  };

  return (
    <div>
      <PageHeader title="Ads / Marketing" subtitle="Dados de Product Ads do Mercado Livre (últimos 30 dias)" />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button onClick={() => fetchAds(false)} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {loading ? 'Carregando...' : 'Atualizar ADS'}
        </button>

        <div className="h-5 w-px bg-border" />

        {contas.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select value={filterConta} onChange={e => setFilterConta(e.target.value)} className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs">
              <option value="all">Todas as Contas ({campaigns.length} camp.)</option>
              {contas.map(c => <option key={c} value={c}>{c} ({campaigns.filter(cp => cp.conta === c).length} camp.)</option>)}
            </select>
          </div>
        )}

        {lastRefresh && (
          <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto"><Clock className="w-3 h-3" /> {lastRefresh}</span>
        )}
        {error && <span className="text-xs text-[hsl(var(--vix-danger))]">⚠️ {error}</span>}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <KpiCard title="Investimento" value={formatBRL(totalInvestimento)} icon={DollarSign} delay={0} />
        <KpiCard title="Cliques" value={String(totalCliques)} icon={MousePointerClick} delay={50} />
        <KpiCard title="Impressões" value={String(totalImpressoes)} icon={Eye} delay={100} />
        <KpiCard title="CTR Médio" value={formatPercent(ctrMedio)} icon={Target} delay={150} />
        <KpiCard title="CPC Médio" value={formatBRL(cpcMedio)} icon={BarChart3} delay={200} />
      </div>

      {loading && campaigns.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-card border border-border rounded-xl">
          <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
          <p className="text-sm text-muted-foreground">Carregando dados de Product Ads...</p>
        </div>
      )}

      {!loading && campaigns.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 bg-card border border-border rounded-xl">
          <Megaphone className="w-12 h-12 text-muted-foreground/40 mb-4" />
          <p className="text-sm text-muted-foreground mb-2">Nenhuma campanha de Product Ads encontrada.</p>
          <p className="text-xs text-muted-foreground">Verifique se as contas ML possuem Product Ads ativado.</p>
        </div>
      )}

      {filteredCampaigns.length > 0 && (
        <>          {/* Campaigns Chart */}
          {campChart.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-6 mb-6 animate-fade-in">
              <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" /> Investimento por Campanha
              </h3>
              <ResponsiveContainer width="100%" height={Math.max(250, campChart.length * 30)}>
                <BarChart data={campChart} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `R$${v}`} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} width={120} />
                  <Tooltip formatter={(v: number, name: string) => name === 'investimento' ? formatBRL(v) : v} />
                  <Legend />
                  <Bar dataKey="investimento" name="Investimento" fill="#ef4444" radius={[0, 4, 4, 0]} opacity={0.8} />
                  <Bar dataKey="cliques" name="Cliques" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Campaigns Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden mb-6 animate-fade-in">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-foreground font-semibold flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-amber-500" /> Campanhas ({filteredCampaigns.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Campanha</th>
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Conta</th>
                    <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Investimento</th>
                    <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Cliques</th>
                    <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Impressões</th>
                    <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">CTR</th>
                    <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">CPC</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCampaigns.map(c => (
                    <tr key={`${c.id}-${c.conta}`} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-foreground max-w-[200px] truncate" title={c.name}>{c.name}</td>
                      <td className="py-2.5 px-3 text-xs text-muted-foreground">{c.conta}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor(c.status)}`}>{c.status}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-[hsl(var(--vix-danger))] font-medium">{formatBRL(c.metrics?.cost || 0)}</td>
                      <td className="py-2.5 px-3 text-right">{c.metrics?.clicks || 0}</td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">{c.metrics?.prints || 0}</td>
                      <td className="py-2.5 px-3 text-right">{formatPercent((c.metrics?.ctr || 0) * 100)}</td>
                      <td className="py-2.5 px-3 text-right">{formatBRL(c.metrics?.cpc || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Ad Items */}
          {topAds.length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-foreground font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" /> Top Anúncios por Cliques ({topAds.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">ID Anúncio</th>
                      <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Conta</th>
                      <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Cliques</th>
                      <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Impressões</th>
                      <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Custo</th>
                      <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">CPC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topAds.map((ad, i) => (
                      <tr key={`${ad.item_id}-${i}`} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-xs text-primary">{ad.item_id}</td>
                        <td className="py-2.5 px-3 text-xs text-muted-foreground">{ad.conta}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor(ad.status)}`}>{ad.status}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium">{ad.metrics?.clicks || 0}</td>
                        <td className="py-2.5 px-3 text-right text-muted-foreground">{ad.metrics?.prints || 0}</td>
                        <td className="py-2.5 px-3 text-right text-[hsl(var(--vix-danger))]">{formatBRL(ad.metrics?.cost || 0)}</td>
                        <td className="py-2.5 px-3 text-right">{formatBRL(ad.metrics?.cpc || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
