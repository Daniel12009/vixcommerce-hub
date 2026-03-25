import { useState, useEffect, useCallback, useMemo } from 'react';
import { Megaphone, TrendingUp, DollarSign, RefreshCw, Loader2, BarChart3, Target, Eye, MousePointerClick, Clock, Filter, Edit3, X, Save, Calendar, ShoppingCart } from 'lucide-react';
import { KpiCard } from '@/components/shared/KpiCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatBRL, formatPercent } from '@/lib/utils-vix';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface MLCampaign {
  id: string; name: string; status: string; budget: number; strategy?: string; roas_target?: number; product_type?: string;
  metrics: { clicks?: number; prints?: number; cost?: number; ctr?: number; cpc?: number; roas?: number; total_amount?: number; direct_amount?: number; indirect_amount?: number; units_quantity?: number; direct_units_quantity?: number; indirect_units_quantity?: number; cvr?: number };
  conta: string; account_id: string; advertiser_id?: number;
}
interface MLAdItem {
  item_id: string; campaign_id: string; title: string; status: string; price?: number; thumbnail?: string; permalink?: string;
  metrics: { clicks?: number; prints?: number; cost?: number; ctr?: number; cpc?: number; roas?: number; total_amount?: number; units_quantity?: number };
  conta: string;
}

type DatePreset = 'today' | '7d' | '15d' | '30d' | 'custom';
const datePresets: { key: DatePreset; label: string; days: number }[] = [
  { key: 'today', label: 'Hoje', days: 0 },
  { key: '7d', label: '7 dias', days: 7 },
  { key: '15d', label: '15 dias', days: 15 },
  { key: '30d', label: '30 dias', days: 30 },
];

function calcDates(preset: DatePreset, customFrom?: string, customTo?: string) {
  const now = new Date();
  const to = now.toISOString().split('T')[0];
  if (preset === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo };
  const days = datePresets.find(p => p.key === preset)?.days ?? 7;
  const from = days === 0 ? to : new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return { from, to };
}

const prodColor: Record<string, string> = {
  PADS: 'bg-blue-500/15 text-blue-400',
  BADS: 'bg-purple-500/15 text-purple-400',
  DISPLAY: 'bg-amber-500/15 text-amber-400',
};

let _cachedAds: { campaigns: MLCampaign[]; items: MLAdItem[] } | null = null;

export function MarketingPage() {
  const [campaigns, setCampaigns] = useState<MLCampaign[]>(_cachedAds?.campaigns || []);
  const [adItems, setAdItems] = useState<MLAdItem[]>(_cachedAds?.items || []);
  const [loading, setLoading] = useState(!_cachedAds);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState('');
  const [filterConta, setFilterConta] = useState('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  // Edit
  const [editCamp, setEditCamp] = useState<MLCampaign | null>(null);
  const [editBudget, setEditBudget] = useState('');
  const [editRoas, setEditRoas] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchAds = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    const { from, to } = calcDates(datePreset, customFrom, customTo);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('mercado-livre', { body: { action: 'get_ads_data', date_from: from, date_to: to } });
      if (fnError) throw new Error(fnError.message);
      const c = data?.campaigns || [];
      const items = data?.items || [];
      setCampaigns(c); setAdItems(items);
      _cachedAds = { campaigns: c, items };
      setLastRefresh(new Date().toLocaleString('pt-BR'));
      if (!showSpinner) toast.success(`ADS: ${c.length} campanhas, ${items.length} anúncios`);
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  }, [datePreset, customFrom, customTo]);

  useEffect(() => {
    if (_cachedAds) { fetchAds(false); } else { fetchAds(true); }
  }, [fetchAds]);

  // ━━━ Save campaign edit ━━━
  const handleSaveCampaign = async () => {
    if (!editCamp) return;
    setSaving(true);
    try {
      const body: any = { action: 'update_campaign', campaign_id: editCamp.id, account_id: editCamp.account_id };
      if (editBudget) body.budget = parseFloat(editBudget);
      if (editRoas) body.roas_target = parseFloat(editRoas);
      const { error: fnError } = await supabase.functions.invoke('mercado-livre', { body });
      if (fnError) throw new Error(fnError.message);
      toast.success('Campanha atualizada!');
      setEditCamp(null);
      fetchAds(false);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally { setSaving(false); }
  };

  // ━━━ Filters ━━━
  const contas = useMemo(() => [...new Set(campaigns.map(c => c.conta).filter(Boolean))].sort(), [campaigns]);
  const fc = useMemo(() => filterConta === 'all' ? campaigns : campaigns.filter(c => c.conta === filterConta), [campaigns, filterConta]);
  const fa = useMemo(() => filterConta === 'all' ? adItems : adItems.filter(a => a.conta === filterConta), [adItems, filterConta]);

  // ━━━ Metrics ━━━
  const inv = useMemo(() => fc.reduce((s, c) => s + (c.metrics?.cost || 0), 0), [fc]);
  const clicks = useMemo(() => fc.reduce((s, c) => s + (c.metrics?.clicks || 0), 0), [fc]);
  const prints = useMemo(() => fc.reduce((s, c) => s + (c.metrics?.prints || 0), 0), [fc]);
  const receita = useMemo(() => fc.reduce((s, c) => s + (c.metrics?.total_amount || 0), 0), [fc]);
  const directAmt = useMemo(() => fc.reduce((s, c) => s + (c.metrics?.direct_amount || 0), 0), [fc]);
  const indirectAmt = useMemo(() => fc.reduce((s, c) => s + (c.metrics?.indirect_amount || 0), 0), [fc]);
  const units = useMemo(() => fc.reduce((s, c) => s + (c.metrics?.units_quantity || 0), 0), [fc]);
  const directUnits = useMemo(() => fc.reduce((s, c) => s + (c.metrics?.direct_units_quantity || 0), 0), [fc]);
  const indirectUnits = useMemo(() => fc.reduce((s, c) => s + (c.metrics?.indirect_units_quantity || 0), 0), [fc]);
  const ctr = prints > 0 ? (clicks / prints) * 100 : 0;
  const cpc = clicks > 0 ? inv / clicks : 0;
  const roas = inv > 0 ? receita / inv : 0;
  const cvr = clicks > 0 ? (units / clicks) * 100 : 0;

  // Chart
  const campChart = useMemo(() =>
    fc.map(c => ({
      name: c.name.length > 20 ? c.name.slice(0, 20) + '...' : c.name,
      investimento: Number((c.metrics?.cost || 0).toFixed(2)),
      receita: Number((c.metrics?.total_amount || 0).toFixed(2)),
    })).sort((a, b) => b.investimento - a.investimento).slice(0, 15),
  [fc]);

  const topAds = useMemo(() =>
    [...fa].sort((a, b) => (b.metrics?.cost || 0) - (a.metrics?.cost || 0)).slice(0, 30),
  [fa]);

  const statusColor = (s: string) => {
    if (s === 'active' || s === 'enabled') return 'text-emerald-400 bg-emerald-400/10';
    if (s === 'paused') return 'text-yellow-400 bg-yellow-400/10';
    return 'text-muted-foreground bg-muted';
  };

  return (
    <div>
      <PageHeader title="Ads / Marketing" subtitle="Product Ads • Brand Ads • Display — Mercado Livre" />

      {/* Controls Row */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <button onClick={() => fetchAds(false)} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {loading ? 'Carregando...' : 'Atualizar ADS'}
        </button>

        <div className="h-5 w-px bg-border" />

        {/* Date Filter */}
        <div className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          {datePresets.map(p => (
            <button key={p.key} onClick={() => { setDatePreset(p.key); }} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${datePreset === p.key ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-foreground hover:bg-muted'}`}>
              {p.label}
            </button>
          ))}
          <button onClick={() => setDatePreset('custom')} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${datePreset === 'custom' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-foreground hover:bg-muted'}`}>
            Personalizado
          </button>
        </div>

        {datePreset === 'custom' && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="px-2 py-1 rounded-md bg-card border border-border text-foreground text-xs" />
            <span className="text-xs text-muted-foreground">a</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="px-2 py-1 rounded-md bg-card border border-border text-foreground text-xs" />
            <button onClick={() => fetchAds(true)} className="px-2 py-1 rounded-md bg-primary text-primary-foreground text-xs">Buscar</button>
          </div>
        )}

        <div className="h-5 w-px bg-border" />

        {contas.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select value={filterConta} onChange={e => setFilterConta(e.target.value)} className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs">
              <option value="all">Todas ({campaigns.length})</option>
              {contas.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}

        {lastRefresh && <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto"><Clock className="w-3 h-3" /> {lastRefresh}</span>}
        {error && <span className="text-xs text-[hsl(var(--vix-danger))]">⚠️ {error}</span>}
      </div>

      {/* KPIs — 2 rows */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-3">
        <KpiCard title="Investimento" value={formatBRL(inv)} icon={DollarSign} delay={0} />
        <KpiCard title="Receita Ads" value={formatBRL(receita)} icon={TrendingUp} delay={30} />
        <KpiCard title="ROAS" value={roas.toFixed(2) + 'x'} icon={Target} delay={60} />
        <KpiCard title="Vendas (un)" value={String(units)} icon={ShoppingCart} delay={90} />
        <KpiCard title="CVR" value={formatPercent(cvr)} icon={Target} delay={120} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard title="Cliques" value={String(clicks)} icon={MousePointerClick} delay={150} />
        <KpiCard title="Impressões" value={String(prints)} icon={Eye} delay={180} />
        <KpiCard title="CTR" value={formatPercent(ctr)} icon={BarChart3} delay={210} />
        <KpiCard title="CPC Médio" value={formatBRL(cpc)} icon={DollarSign} delay={240} />
        <KpiCard title="Venda Direta" value={formatBRL(directAmt)} icon={TrendingUp} delay={270} />
      </div>

      {loading && campaigns.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-card border border-border rounded-xl">
          <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
          <p className="text-sm text-muted-foreground">Carregando dados de Advertising...</p>
        </div>
      )}

      {!loading && campaigns.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 bg-card border border-border rounded-xl">
          <Megaphone className="w-12 h-12 text-muted-foreground/40 mb-4" />
          <p className="text-sm text-muted-foreground">Nenhuma campanha encontrada.</p>
        </div>
      )}

      {fc.length > 0 && (
        <>
          {/* Chart */}
          {campChart.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-6 mb-6 animate-fade-in">
              <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" /> Investimento vs Receita por Campanha
              </h3>
              <ResponsiveContainer width="100%" height={Math.max(250, campChart.length * 30)}>
                <BarChart data={campChart} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `R$${v}`} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} width={120} />
                  <Tooltip formatter={(v: number, name: string) => formatBRL(v)} />
                  <Legend />
                  <Bar dataKey="investimento" name="Investimento" fill="#ef4444" radius={[0, 4, 4, 0]} opacity={0.8} />
                  <Bar dataKey="receita" name="Receita" fill="#22c55e" radius={[0, 4, 4, 0]} opacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Campaigns Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden mb-6 animate-fade-in">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-foreground font-semibold flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-amber-500" /> Campanhas ({fc.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Campanha</th>
                    <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Tipo</th>
                    <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Orçamento</th>
                    <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">ROAS Obj.</th>
                    <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Invest.</th>
                    <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Receita</th>
                    <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">ROAS</th>
                    <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Vendas</th>
                    <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Cliques</th>
                    <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {fc.map(c => (
                    <tr key={`${c.id}-${c.conta}`} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-foreground max-w-[180px] truncate" title={c.name}>{c.name}</div>
                        <span className="text-[10px] text-muted-foreground">{c.conta}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${prodColor[c.product_type || 'PADS'] || prodColor.PADS}`}>{c.product_type || 'PADS'}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor(c.status)}`}>{c.status}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground text-xs">{formatBRL(c.budget)}/dia</td>
                      <td className="py-2.5 px-3 text-right text-xs">{(c.roas_target || 0).toFixed(1)}x</td>
                      <td className="py-2.5 px-3 text-right text-[hsl(var(--vix-danger))] font-medium">{formatBRL(c.metrics?.cost || 0)}</td>
                      <td className="py-2.5 px-3 text-right text-[hsl(var(--vix-success))] font-medium">{formatBRL(c.metrics?.total_amount || 0)}</td>
                      <td className={`py-2.5 px-3 text-right font-bold ${(c.metrics?.roas || 0) >= 3 ? 'text-[hsl(var(--vix-success))]' : (c.metrics?.roas || 0) >= 1 ? 'text-yellow-400' : 'text-[hsl(var(--vix-danger))]'}`}>{(c.metrics?.roas || 0).toFixed(2)}x</td>
                      <td className="py-2.5 px-3 text-right">{c.metrics?.units_quantity || 0}</td>
                      <td className="py-2.5 px-3 text-right">{c.metrics?.clicks || 0}</td>
                      <td className="py-2.5 px-3 text-center">
                        <button onClick={() => { setEditCamp(c); setEditBudget(String(c.budget || '')); setEditRoas(String(c.roas_target || '')); }} className="p-1 rounded hover:bg-muted transition-colors" title="Editar campanha">
                          <Edit3 className="w-3.5 h-3.5 text-primary" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Ads */}
          {topAds.length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-foreground font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" /> Top Anúncios por Investimento ({topAds.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Anúncio</th>
                      <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Conta</th>
                      <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Preço</th>
                      <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Cliques</th>
                      <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Custo</th>
                      <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Receita</th>
                      <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topAds.map((ad, i) => (
                      <tr key={`${ad.item_id}-${i}`} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            {ad.thumbnail && <img src={ad.thumbnail} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />}
                            <div className="min-w-0">
                              {ad.permalink ? <a href={ad.permalink} target="_blank" rel="noopener" className="text-primary text-xs hover:underline truncate block max-w-[180px]" title={ad.title}>{ad.title || ad.item_id}</a> : <span className="text-xs text-foreground truncate block max-w-[180px]">{ad.title || ad.item_id}</span>}
                              <span className="text-[10px] text-muted-foreground">{ad.item_id}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-muted-foreground">{ad.conta}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor(ad.status)}`}>{ad.status}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right">{ad.price ? formatBRL(ad.price) : '-'}</td>
                        <td className="py-2.5 px-3 text-right font-medium">{ad.metrics?.clicks || 0}</td>
                        <td className="py-2.5 px-3 text-right text-[hsl(var(--vix-danger))]">{formatBRL(ad.metrics?.cost || 0)}</td>
                        <td className="py-2.5 px-3 text-right text-[hsl(var(--vix-success))]">{formatBRL(ad.metrics?.total_amount || 0)}</td>
                        <td className={`py-2.5 px-3 text-right font-semibold ${(ad.metrics?.roas || 0) >= 3 ? 'text-[hsl(var(--vix-success))]' : (ad.metrics?.roas || 0) >= 1 ? 'text-yellow-400' : 'text-[hsl(var(--vix-danger))]'}`}>{(ad.metrics?.roas || 0).toFixed(2)}x</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit Campaign Modal */}
      {editCamp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditCamp(null)}>
          <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground flex items-center gap-2"><Edit3 className="w-4 h-4 text-primary" /> Editar Campanha</h3>
              <button onClick={() => setEditCamp(null)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <p className="text-sm text-foreground font-medium mb-1">{editCamp.name}</p>
                <p className="text-xs text-muted-foreground">{editCamp.conta} • {editCamp.product_type || 'PADS'} • ID: {editCamp.id}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Orçamento diário (R$)</label>
                <input type="number" step="1" min="1" value={editBudget} onChange={e => setEditBudget(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground" placeholder="Ex: 50" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">ROAS Objetivo (1x a 35x)</label>
                <input type="number" step="0.1" min="1" max="35" value={editRoas} onChange={e => setEditRoas(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground" placeholder="Ex: 3.0" />
                <p className="text-[10px] text-muted-foreground mt-1">ROAS baixo = mais vendas, menos rentabilidade. ROAS alto = menos vendas, mais rentabilidade.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
              <button onClick={() => setEditCamp(null)} className="px-4 py-2 rounded-lg border border-border text-xs font-medium hover:bg-muted">Cancelar</button>
              <button onClick={handleSaveCampaign} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
