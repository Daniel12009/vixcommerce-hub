import { useState, useEffect, useCallback, useMemo } from 'react';
import { Megaphone, TrendingUp, DollarSign, RefreshCw, Loader2, BarChart3, Target, Eye, MousePointerClick, Clock, Filter, Edit3, X, Save, Calendar, ChevronRight, AlertTriangle, Info, ShoppingCart } from 'lucide-react';
import { KpiCard } from '@/components/shared/KpiCard';
import { formatBRL, formatPercent } from '@/lib/utils-vix';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, PieChart, Pie, Cell } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/* ━━━━━━━━━━━━━━━ Types ━━━━━━━━━━━━━━━ */
interface MLCampaign {
  id: string; name: string; status: string; budget: number; strategy?: string; roas_target?: number; product_type?: string;
  metrics: { clicks?: number; prints?: number; cost?: number; ctr?: number; cpc?: number; roas?: number; total_amount?: number; direct_amount?: number; indirect_amount?: number; units_quantity?: number; direct_units_quantity?: number; indirect_units_quantity?: number; cvr?: number };
  conta: string; account_id: string; advertiser_id?: number;
}
interface MLAdItem {
  item_id: string; campaign_id: string; title: string; status: string; price?: number; thumbnail?: string; permalink?: string;
  buy_box_winner?: boolean; catalog_listing?: boolean; logistic_type?: string; listing_type_id?: string; condition?: string; domain_id?: string;
  metrics: { clicks?: number; prints?: number; cost?: number; ctr?: number; cpc?: number; roas?: number; total_amount?: number; units_quantity?: number };
  conta: string; account_id?: string;
}

/* ━━━━━━━━━━━━━━━ Date helpers ━━━━━━━━━━━━━━━ */
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
const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

let _cachedAds: { campaigns: MLCampaign[]; items: MLAdItem[] } | null = null;

/* ━━━━━━━━━━━━━━━ Component ━━━━━━━━━━━━━━━ */
export function MLMarketingTab({ activeTab }: { activeTab: 'dashboard' | 'gerenciar' | 'status' }) {
  const [campaigns, setCampaigns] = useState<MLCampaign[]>(_cachedAds?.campaigns || []);
  const [adItems, setAdItems] = useState<MLAdItem[]>(_cachedAds?.items || []);
  const [loading, setLoading] = useState(!_cachedAds);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState('');
  const [filterConta, setFilterConta] = useState('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  
  // Edit state
  const [editCamp, setEditCamp] = useState<MLCampaign | null>(null);
  const [editBudget, setEditBudget] = useState('');
  const [editRoas, setEditRoas] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  
  // Catalog winner
  const [catalogInfo, setCatalogInfo] = useState<any>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedAdForCatalog, setSelectedAdForCatalog] = useState<MLAdItem | null>(null);

  /* ━━━ Fetch ━━━ */
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
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [datePreset, customFrom, customTo]);

  useEffect(() => { _cachedAds ? fetchAds(false) : fetchAds(true); }, [fetchAds]);

  /* ━━━ Save campaign ━━━ */
  const handleSaveCampaign = async () => {
    if (!editCamp) return;
    if (!confirmSave) { setConfirmSave(true); return; }
    setSaving(true);
    try {
      const body: any = { action: 'update_campaign', campaign_id: editCamp.id, account_id: editCamp.account_id };
      if (editBudget) body.budget = parseFloat(editBudget);
      if (editRoas) body.roas_target = parseFloat(editRoas);
      const { data, error: fnError } = await supabase.functions.invoke('mercado-livre', { body });
      if (fnError) {
        const msg = typeof data === 'object' && data?.error ? data.error : fnError.message;
        throw new Error(msg);
      }
      toast.success('✅ Campanha atualizada com sucesso!');
      setEditCamp(null); setConfirmSave(false);
      fetchAds(false);
    } catch (err: any) { toast.error(`Erro: ${err.message}`); setConfirmSave(false); } finally { setSaving(false); }
  };

  /* ━━━ Catalog winner lookup ━━━ */
  const fetchCatalogWinner = async (ad: MLAdItem) => {
    setSelectedAdForCatalog(ad);
    setCatalogLoading(true);
    setCatalogInfo(null);
    try {
      const { data } = await supabase.functions.invoke('mercado-livre', { body: { action: 'get_catalog_winner', item_id: ad.item_id, account_id: ad.account_id } });
      setCatalogInfo(data);
    } catch (err: any) { toast.error(`Erro: ${err.message}`); }
    finally { setCatalogLoading(false); }
  };

  /* ━━━ Filter ━━━ */
  const contas = useMemo(() => [...new Set(campaigns.map(c => c.conta).filter(Boolean))].sort(), [campaigns]);
  const fc = useMemo(() => filterConta === 'all' ? campaigns : campaigns.filter(c => c.conta === filterConta), [campaigns, filterConta]);
  const fa = useMemo(() => filterConta === 'all' ? adItems : adItems.filter(a => a.conta === filterConta), [adItems, filterConta]);

  /* ━━━ Aggregate metrics ━━━ */
  const m = useMemo(() => {
    const inv = fc.reduce((s, c) => s + (c.metrics?.cost || 0), 0);
    const clicks = fc.reduce((s, c) => s + (c.metrics?.clicks || 0), 0);
    const prints = fc.reduce((s, c) => s + (c.metrics?.prints || 0), 0);
    const receita = fc.reduce((s, c) => s + (c.metrics?.total_amount || 0), 0);
    const directAmt = fc.reduce((s, c) => s + (c.metrics?.direct_amount || 0), 0);
    const indirectAmt = fc.reduce((s, c) => s + (c.metrics?.indirect_amount || 0), 0);
    const units = fc.reduce((s, c) => s + (c.metrics?.units_quantity || 0), 0);
    const directUnits = fc.reduce((s, c) => s + (c.metrics?.direct_units_quantity || 0), 0);
    const indirectUnits = fc.reduce((s, c) => s + (c.metrics?.indirect_units_quantity || 0), 0);
    return { inv, clicks, prints, receita, directAmt, indirectAmt, units, directUnits, indirectUnits, ctr: prints > 0 ? (clicks / prints) * 100 : 0, cpc: clicks > 0 ? inv / clicks : 0, roas: inv > 0 ? receita / inv : 0, cvr: clicks > 0 ? (units / clicks) * 100 : 0 };
  }, [fc]);

  /* Charts */
  const campChart = useMemo(() => fc.map(c => ({ name: c.name.length > 20 ? c.name.slice(0, 20) + '...' : c.name, investimento: +(c.metrics?.cost || 0).toFixed(2), receita: +(c.metrics?.total_amount || 0).toFixed(2) })).sort((a, b) => b.investimento - a.investimento).slice(0, 15), [fc]);
  const statusPie = useMemo(() => {
    const map: Record<string, number> = {};
    fc.forEach(c => { map[c.status] = (map[c.status] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [fc]);
  const topAds = useMemo(() => [...fa].sort((a, b) => (b.metrics?.cost || 0) - (a.metrics?.cost || 0)).slice(0, 30), [fa]);

  const statusColor = (s: string) => {
    if (s === 'active' || s === 'enabled') return 'text-emerald-400 bg-emerald-400/10';
    if (s === 'paused') return 'text-yellow-400 bg-yellow-400/10';
    return 'text-muted-foreground bg-muted';
  };

  /* ━━━ Shared controls ━━━ */
  const Controls = (
    <div className="flex flex-wrap items-center gap-3 mb-5">
      <button onClick={() => fetchAds(false)} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        {loading ? 'Carregando...' : 'Atualizar'}
      </button>
      <div className="h-5 w-px bg-border" />
      <div className="flex items-center gap-1">
        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
        {datePresets.map(p => (
          <button key={p.key} onClick={() => setDatePreset(p.key)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${datePreset === p.key ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-foreground hover:bg-muted'}`}>{p.label}</button>
        ))}
        <button onClick={() => setDatePreset('custom')} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${datePreset === 'custom' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-foreground hover:bg-muted'}`}>Personalizado</button>
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
  );

  /* ━━━ RENDER ━━━ */
  return (
    <div>
      {Controls}

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

      {/* ━━━━━━ TAB: DASHBOARD ━━━━━━ */}
      {activeTab === 'dashboard' && fc.length > 0 && (
        <div className="animate-fade-in">
          {/* KPIs Row 1 */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-3">
            <KpiCard title="Investimento" value={formatBRL(m.inv)} icon={DollarSign} delay={0} />
            <KpiCard title="Receita Ads" value={formatBRL(m.receita)} icon={TrendingUp} delay={30} />
            <KpiCard title="ROAS" value={m.roas.toFixed(2) + 'x'} icon={Target} delay={60} />
            <KpiCard title="Vendas (un)" value={String(m.units)} icon={ShoppingCart} delay={90} />
            <KpiCard title="CVR" value={formatPercent(m.cvr)} icon={Target} delay={120} />
          </div>
          {/* KPIs Row 2 */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-6">
            <KpiCard title="Cliques" value={String(m.clicks)} icon={MousePointerClick} delay={150} />
            <KpiCard title="Impressões" value={String(m.prints)} icon={Eye} delay={180} />
            <KpiCard title="CTR" value={formatPercent(m.ctr)} icon={BarChart3} delay={210} />
            <KpiCard title="CPC Médio" value={formatBRL(m.cpc)} icon={DollarSign} delay={240} />
            <KpiCard title="Venda Direta" value={formatBRL(m.directAmt)} icon={TrendingUp} delay={270} />
          </div>

          <div className="grid lg:grid-cols-3 gap-6 mb-6">
            {/* Bar Chart */}
            {campChart.length > 0 && (
              <div className="lg:col-span-2 bg-card border border-border rounded-xl p-3 md:p-5">
                <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2 text-sm"><BarChart3 className="w-4 h-4 text-primary" /> Investimento vs Receita</h3>
                <ResponsiveContainer width="100%" height={Math.max(220, campChart.length * 28)}>
                  <BarChart data={campChart} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `R$${v}`} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} width={110} />
                    <Tooltip formatter={(v: number) => formatBRL(v)} />
                    <Legend />
                    <Bar dataKey="investimento" name="Investimento" fill="#ef4444" radius={[0, 4, 4, 0]} opacity={0.85} />
                    <Bar dataKey="receita" name="Receita" fill="#22c55e" radius={[0, 4, 4, 0]} opacity={0.85} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Pie Chart: Status */}
            {statusPie.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-3 md:p-5">
                <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2 text-sm"><Target className="w-4 h-4 text-primary" /> Status das Campanhas</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={statusPie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                      {statusPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="text-center p-2 rounded-lg bg-muted/50">
                    <p className="text-lg font-bold text-foreground">{fc.length}</p>
                    <p className="text-[10px] text-muted-foreground">Total Campanhas</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/50">
                    <p className="text-lg font-bold text-foreground">{fa.length}</p>
                    <p className="text-[10px] text-muted-foreground">Total Anúncios</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Top Ads Preview */}
          {topAds.length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-foreground font-semibold flex items-center gap-2 text-sm"><TrendingUp className="w-4 h-4 text-emerald-500" /> Top Anúncios por Investimento</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Anúncio</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground text-xs">Custo</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground text-xs">Receita</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground text-xs">ROAS</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground text-xs">Cliques</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topAds.slice(0, 10).map((ad, i) => (
                      <tr key={`${ad.item_id}-${i}`} className="border-b border-border/30 hover:bg-muted/30">
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            {ad.thumbnail && <img src={ad.thumbnail} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />}
                            <div className="min-w-0">
                              {ad.permalink ? <a href={ad.permalink} target="_blank" rel="noopener" className="text-primary text-xs hover:underline truncate block max-w-[160px]">{ad.title || ad.item_id}</a> : <span className="text-xs truncate block max-w-[160px]">{ad.title || ad.item_id}</span>}
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right text-xs text-[hsl(var(--vix-danger))]">{formatBRL(ad.metrics?.cost || 0)}</td>
                        <td className="py-2 px-3 text-right text-xs text-[hsl(var(--vix-success))]">{formatBRL(ad.metrics?.total_amount || 0)}</td>
                        <td className={`py-2 px-3 text-right text-xs font-semibold ${(ad.metrics?.roas || 0) >= 3 ? 'text-[hsl(var(--vix-success))]' : (ad.metrics?.roas || 0) >= 1 ? 'text-yellow-400' : 'text-[hsl(var(--vix-danger))]'}`}>{(ad.metrics?.roas || 0).toFixed(2)}x</td>
                        <td className="py-2 px-3 text-right text-xs">{ad.metrics?.clicks || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ━━━━━━ TAB: GERENCIAR ━━━━━━ */}
      {activeTab === 'gerenciar' && fc.length > 0 && (
        <div className="animate-fade-in space-y-6">
          {/* Campaigns Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-foreground font-semibold flex items-center gap-2 text-sm"><Megaphone className="w-4 h-4 text-amber-500" /> Campanhas ({fc.length})</h3>
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
                    <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Editar</th>
                  </tr>
                </thead>
                <tbody>
                  {fc.map(c => (
                    <tr key={`${c.id}-${c.conta}`} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-foreground max-w-[180px] truncate" title={c.name}>{c.name}</div>
                        <span className="text-[10px] text-muted-foreground">{c.conta}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${prodColor[c.product_type || 'PADS'] || prodColor.PADS}`}>{c.product_type || 'PADS'}</span></td>
                      <td className="py-2.5 px-3 text-center"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor(c.status)}`}>{c.status}</span></td>
                      <td className="py-2.5 px-3 text-right text-xs text-muted-foreground">{formatBRL(c.budget)}/dia</td>
                      <td className="py-2.5 px-3 text-right text-xs">{(c.roas_target || 0).toFixed(1)}x</td>
                      <td className="py-2.5 px-3 text-right text-[hsl(var(--vix-danger))] font-medium">{formatBRL(c.metrics?.cost || 0)}</td>
                      <td className="py-2.5 px-3 text-right text-[hsl(var(--vix-success))] font-medium">{formatBRL(c.metrics?.total_amount || 0)}</td>
                      <td className={`py-2.5 px-3 text-right font-bold ${(c.metrics?.roas || 0) >= 3 ? 'text-[hsl(var(--vix-success))]' : (c.metrics?.roas || 0) >= 1 ? 'text-yellow-400' : 'text-[hsl(var(--vix-danger))]'}`}>{(c.metrics?.roas || 0).toFixed(2)}x</td>
                      <td className="py-2.5 px-3 text-right">{c.metrics?.units_quantity || 0}</td>
                      <td className="py-2.5 px-3 text-right">{c.metrics?.clicks || 0}</td>
                      <td className="py-2.5 px-3 text-center">
                        <button onClick={() => { setEditCamp(c); setEditBudget(String(c.budget || '')); setEditRoas(String(c.roas_target || '')); }} className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors" title="Editar">
                          <Edit3 className="w-3.5 h-3.5 text-primary" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* All Ads Table */}
          {topAds.length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-foreground font-semibold flex items-center gap-2 text-sm"><TrendingUp className="w-4 h-4 text-emerald-500" /> Anúncios ({topAds.length})</h3>
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
                      <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Impressões</th>
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
                              {ad.permalink ? <a href={ad.permalink} target="_blank" rel="noopener" className="text-primary text-xs hover:underline truncate block max-w-[180px]" title={ad.title}>{ad.title || ad.item_id}</a> : <span className="text-xs truncate block max-w-[180px]">{ad.title || ad.item_id}</span>}
                              <span className="text-[10px] text-muted-foreground">{ad.item_id}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-muted-foreground">{ad.conta}</td>
                        <td className="py-2.5 px-3 text-center"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor(ad.status)}`}>{ad.status}</span></td>
                        <td className="py-2.5 px-3 text-right">{ad.price ? formatBRL(ad.price) : '-'}</td>
                        <td className="py-2.5 px-3 text-right font-medium">{ad.metrics?.clicks || 0}</td>
                        <td className="py-2.5 px-3 text-right text-muted-foreground">{ad.metrics?.prints || 0}</td>
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
        </div>
      )}

      {/* Edit Campaign Modal */}
      {editCamp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setEditCamp(null); setConfirmSave(false); }}>
          <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground flex items-center gap-2"><Edit3 className="w-4 h-4 text-primary" /> Editar Campanha</h3>
              <button onClick={() => { setEditCamp(null); setConfirmSave(false); }} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>

            {/* Confirmation overlay */}
            {confirmSave ? (
              <div className="px-5 py-5 space-y-4">
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
                  <p className="text-yellow-400 font-semibold text-sm mb-2">⚠️ Confirmar Alteração</p>
                  <p className="text-xs text-foreground mb-3">Tem certeza que deseja alterar a campanha <strong>{editCamp.name}</strong>?</p>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {editBudget && editBudget !== String(editCamp.budget) && (
                      <p>Orçamento: <span className="text-foreground">{formatBRL(editCamp.budget)}/dia</span> → <span className="text-primary font-semibold">{formatBRL(Number(editBudget))}/dia</span></p>
                    )}
                    {editRoas && editRoas !== String(editCamp.roas_target) && (
                      <p>ROAS Objetivo: <span className="text-foreground">{(editCamp.roas_target || 0).toFixed(1)}x</span> → <span className="text-primary font-semibold">{Number(editRoas).toFixed(1)}x</span></p>
                    )}
                  </div>
                </div>
                <div className="flex justify-center gap-3">
                  <button onClick={() => setConfirmSave(false)} className="px-5 py-2.5 rounded-lg border border-border text-xs font-medium hover:bg-muted">Voltar</button>
                  <button onClick={handleSaveCampaign} disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {saving ? 'Salvando...' : 'Confirmar Alteração'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="px-5 py-4 space-y-4">
                  <div>
                    <p className="text-sm text-foreground font-medium mb-1">{editCamp.name}</p>
                    <div className="flex gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${prodColor[editCamp.product_type || 'PADS']}`}>{editCamp.product_type || 'PADS'}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor(editCamp.status)}`}>{editCamp.status}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">{editCamp.conta} • ID: {editCamp.id}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-muted/50 rounded-lg p-2 text-center"><p className="text-xs text-muted-foreground">Invest.</p><p className="text-sm font-bold text-[hsl(var(--vix-danger))]">{formatBRL(editCamp.metrics?.cost || 0)}</p></div>
                    <div className="bg-muted/50 rounded-lg p-2 text-center"><p className="text-xs text-muted-foreground">Receita</p><p className="text-sm font-bold text-[hsl(var(--vix-success))]">{formatBRL(editCamp.metrics?.total_amount || 0)}</p></div>
                    <div className="bg-muted/50 rounded-lg p-2 text-center"><p className="text-xs text-muted-foreground">ROAS</p><p className="text-sm font-bold">{(editCamp.metrics?.roas || 0).toFixed(2)}x</p></div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Orçamento diário (R$)</label>
                    <input type="number" step="1" min="1" value={editBudget} onChange={e => setEditBudget(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground" placeholder="Ex: 50" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">ROAS Objetivo (1x a 35x)</label>
                    <input type="number" step="0.1" min="1" max="35" value={editRoas} onChange={e => setEditRoas(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground" placeholder="Ex: 3.0" />
                    <p className="text-[10px] text-muted-foreground mt-1">ROAS baixo → mais vendas. ROAS alto → mais rentabilidade.</p>
                  </div>
                </div>
                <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
                  <button onClick={() => { setEditCamp(null); setConfirmSave(false); }} className="px-4 py-2 rounded-lg border border-border text-xs font-medium hover:bg-muted">Cancelar</button>
                  <button onClick={handleSaveCampaign} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90">
                    <Save className="w-3.5 h-3.5" /> Salvar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* Catalog Winner Modal */}
      {selectedAdForCatalog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setSelectedAdForCatalog(null); setCatalogInfo(null); }}>
          <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-lg mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm"><Info className="w-4 h-4 text-primary" /> Detalhes do Catálogo</h3>
              <button onClick={() => { setSelectedAdForCatalog(null); setCatalogInfo(null); }} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center gap-3 mb-4">
                {selectedAdForCatalog.thumbnail && <img src={selectedAdForCatalog.thumbnail} alt="" className="w-12 h-12 rounded object-cover" />}
                <div>
                  <p className="text-sm font-medium text-foreground">{selectedAdForCatalog.title}</p>
                  <p className="text-[10px] text-muted-foreground">{selectedAdForCatalog.item_id} • {selectedAdForCatalog.conta}</p>
                </div>
              </div>

              {catalogLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="ml-2 text-sm text-muted-foreground">Buscando dados do catálogo...</span>
                </div>
              )}

              {catalogInfo && !catalogLoading && (
                <div className="space-y-3">
                  {!catalogInfo.catalog && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-center">
                      <AlertTriangle className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
                      <p className="text-xs text-foreground">Este item não é de catálogo.</p>
                    </div>
                  )}

                  {catalogInfo.catalog && (
                    <>
                      <div className="bg-muted/50 rounded-xl p-3">
                        <p className="text-xs text-muted-foreground">Produto Catálogo</p>
                        <p className="text-sm font-medium text-foreground">{catalogInfo.product_name}</p>
                        <p className="text-[10px] text-muted-foreground">ID: {catalogInfo.catalog_product_id}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-muted/50 rounded-lg p-2 text-center">
                          <p className="text-[10px] text-muted-foreground">Envio</p>
                          <p className="text-xs font-semibold text-foreground">{catalogInfo.item_status?.shipping === 'fulfillment' ? '📦 Full' : catalogInfo.item_status?.shipping || '-'}</p>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-2 text-center">
                          <p className="text-[10px] text-muted-foreground">Tipo</p>
                          <p className="text-xs font-semibold text-foreground">{catalogInfo.item_status?.listing_type === 'gold_pro' ? 'Premium' : catalogInfo.item_status?.listing_type || '-'}</p>
                        </div>
                      </div>

                      {catalogInfo.buy_box_winner && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                          <p className="text-xs font-semibold text-red-400 mb-1">⚠️ Vendedor ganhando o Buy Box:</p>
                          <p className="text-sm text-foreground">
                            Seller ID: {catalogInfo.buy_box_winner?.winner_item_id || catalogInfo.buy_box_winner?.item_id || 'N/A'}
                          </p>
                          {catalogInfo.buy_box_winner?.price && <p className="text-xs text-muted-foreground">Preço: {formatBRL(catalogInfo.buy_box_winner.price)}</p>}
                        </div>
                      )}

                      {catalogInfo.competitors?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">Competidores no catálogo ({catalogInfo.competitors.length}):</p>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {catalogInfo.competitors.map((c: any, i: number) => (
                              <div key={i} className="flex justify-between items-center text-xs bg-muted/30 px-3 py-1.5 rounded-lg">
                                <span className="text-foreground">{c.id || c.item_id || `Item ${i+1}`}</span>
                                {c.price && <span className="text-muted-foreground">{formatBRL(c.price)}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
