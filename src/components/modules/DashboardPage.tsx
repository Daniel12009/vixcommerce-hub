import { useState, useEffect, useCallback, useMemo } from 'react';
import { ShoppingCart, DollarSign, Receipt, Package, RefreshCw, Globe, Clock, TrendingUp, Filter } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatBRL, formatNumber } from '@/lib/utils-vix';
import { supabase } from '@/integrations/supabase/client';
import { MarketplaceTab } from './MarketplaceTab';
import { FaturamentoTab } from './FaturamentoTab';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#8b5cf6'];
const PLATFORM_COLORS: Record<string, string> = {
  'mercadolivre': '#FFE600',
  'shopee': '#EE4D2D',
  'tiny': '#1A73E8',
};

interface DashOrder {
  id: string;
  status: string;
  date_created: string;
  total_amount: number;
  buyer: string;
  items: { title: string; sku: string; quantity: number; unit_price: number }[];
  conta: string;
  plataforma?: string;
  vendedor?: string;
  canal?: string;
  error?: string;
}

type CanalFilter = 'all' | 'marketplace' | 'loja' | 'atacado_alexia' | 'showroom' | 'drop';

const PROPRIO_BUYERS = ['MONACO METAIS', 'GONTAREK'];

const classifyCanal = (order: DashOrder): string => {
  // Use canal from Tiny API if available
  if (order.canal) return order.canal;

  const lower = (order.conta || '').toLowerCase();
  
  // Standard Marketplaces are B2C (buyer is always an external person, not our company)
  // They are strictly standard retail - no dropshipping logic applies to them.
  if (order.plataforma === 'mercadolivre' || order.plataforma === 'shopee') {
    return 'marketplace';
  }

  // Explicit Dropshipping accounts (only for Tiny/Wholesale)
  if (lower.includes('thiago')) return 'drop';
  if (lower.includes('via flix') || lower.includes('viaflix')) return 'drop';

  // For Tiny/Atacado orders: if buyer is not one of our own companies = dropshipping
  const buyer = (order.buyer || '').toUpperCase();
  const isOwnBuyer = PROPRIO_BUYERS.some(b => buyer.includes(b));
  if (!isOwnBuyer && buyer.length > 0) return 'drop';

  // Own buyer or other Atacado channels: classify by conta
  if (lower.includes('alexia')) return 'atacado_alexia';
  if (lower.includes('atacado')) return 'drop';
  if (lower.includes('showroom')) return 'showroom';
  if (lower.includes('loja')) return 'loja';
  
  return 'marketplace';
};

const getPlatformLabel = (p: string) => {
  switch (p) {
    case 'mercadolivre': return 'Mercado Livre';
    case 'shopee': return 'Shopee';
    case 'tiny': return 'Tiny (Loja)';
    case 'tiktok': return 'TikTok Shop';
    case 'shein': return 'Shein';
    case 'amazon': return 'Amazon';
    case 'magalu': return 'Magalu';
    case 'americanas': return 'Americanas';
    case 'temu': return 'Temu';
    default: return p || 'Outros';
  }
};
// Module-level cache — survives component unmount/remount during navigation
let _cachedOrders: DashOrder[] | null = null;
let _cachedRefresh: string = '';
let _refreshInterval: ReturnType<typeof setInterval> | null = null;

export function DashboardPage() {
  const [orders, setOrders] = useState<DashOrder[]>(_cachedOrders || []);
  const [loading, setLoading] = useState(!_cachedOrders);
  const [lastRefresh, setLastRefresh] = useState<string>(_cachedRefresh);
  const [error, setError] = useState<string | null>(null);
  const [filterPlataforma, setFilterPlataforma] = useState('all');
  const [filterCanal, setFilterCanal] = useState<CanalFilter>('all');
  const [filterConta, setFilterConta] = useState('all');

  const fetchOrders = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setError(null);
    try {
      const [mlResult, shopeeResult, tinyResult, mktResult] = await Promise.allSettled([
        supabase.functions.invoke('mercado-livre', { body: { action: 'get_today_orders' } }),
        supabase.functions.invoke('shopee', { body: { action: 'get_today_orders' } }),
        supabase.functions.invoke('tiny', { body: { action: 'get_today_orders' } }),
        supabase.functions.invoke('tiny', { body: { action: 'get_marketplace_orders' } }),
      ]);

      const allFetched: DashOrder[] = [];
      const errors: string[] = [];

      if (mlResult.status === 'fulfilled' && mlResult.value.data) {
        const mlOrders = (mlResult.value.data.orders || [])
          .filter((o: any) => !o.error && o.status)
          .map((o: any) => ({ ...o, plataforma: 'mercadolivre' }));
        allFetched.push(...mlOrders);
        (mlResult.value.data.orders || []).filter((o: any) => o.error).forEach((e: any) => errors.push(e.error));
      } else if (mlResult.status === 'rejected') {
        errors.push(`ML: ${mlResult.reason}`);
      }

      if (shopeeResult.status === 'fulfilled' && shopeeResult.value.data) {
        const shopeeOrders = (shopeeResult.value.data.orders || [])
          .filter((o: any) => !o.error && o.status);
        allFetched.push(...shopeeOrders);
        (shopeeResult.value.data.orders || []).filter((o: any) => o.error).forEach((e: any) => errors.push(e.error));
      } else if (shopeeResult.status === 'rejected') {
        errors.push(`Shopee: ${shopeeResult.reason}`);
      }

      if (tinyResult.status === 'fulfilled' && tinyResult.value.data) {
        const tinyOrders = (tinyResult.value.data.orders || [])
          .filter((o: any) => !o.error && o.status);
        allFetched.push(...tinyOrders);
        (tinyResult.value.data.orders || []).filter((o: any) => o.error).forEach((e: any) => errors.push(e.error));
      } else if (tinyResult.status === 'rejected') {
        errors.push(`Tiny: ${tinyResult.reason}`);
      }

      if (mktResult.status === 'fulfilled' && mktResult.value.data) {
        const mktOrders = (mktResult.value.data.orders || [])
          .filter((o: any) => !o.error && o.status);
        allFetched.push(...mktOrders);
      } else if (mktResult.status === 'rejected') {
        errors.push(`Marketplace: ${mktResult.reason}`);
      }

      // Update state + module-level cache
      setOrders(allFetched);
      _cachedOrders = allFetched;
      const refreshTime = new Date().toLocaleString('pt-BR');
      setLastRefresh(refreshTime);
      _cachedRefresh = refreshTime;
      if (errors.length > 0) console.warn('Account errors:', errors);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // If we have cached data, just do a background refresh
    if (_cachedOrders && _cachedOrders.length > 0) {
      fetchOrders(true); // background refresh — no loading spinner
    } else {
      fetchOrders(false); // first load — show spinner
    }
    // Set up auto-refresh every 5 min (only if not already running)
    if (_refreshInterval) clearInterval(_refreshInterval);
    _refreshInterval = setInterval(() => fetchOrders(true), 5 * 60 * 1000);
    return () => {
      // Don't clear interval on unmount — let it keep refreshing in background
    };
  }, [fetchOrders]);

  // Filters
  const filteredOrders = useMemo(() => {
    let items = orders.filter(o => o.status !== 'cancelled');

    // Exclude internal company orders (orders to ourselves vindo do Tiny)
    const COMPRADORES_EXCLUIDOS = [
      'MONACO METAIS COMERCIAL LTDA',
      'GONTAREK COMERCIAL IMPORTACAO E EXPORTACAO LTDA',
    ];

    items = items.filter(v => {
      const comprador = (v.buyer || '').toUpperCase();
      return !COMPRADORES_EXCLUIDOS.some(excluido => comprador.includes(excluido));
    });

    // Drop orders are excluded from the default view — only visible when 'drop' filter is selected
    if (filterCanal === 'drop') {
      return items.filter(o => classifyCanal(o) === 'drop');
    }
    // Always exclude drop from regular totals
    items = items.filter(o => classifyCanal(o) !== 'drop');
    if (filterPlataforma !== 'all') {
      items = items.filter(o => (o.plataforma || '') === filterPlataforma);
    }
    if (filterCanal !== 'all') {
      items = items.filter(o => classifyCanal(o) === filterCanal);
    }
    if (filterConta !== 'all') {
      items = items.filter(o => (o.conta || 'Sem Conta') === filterConta);
    }
    return items;
  }, [orders, filterPlataforma, filterCanal, filterConta]);

  const paidOrders = filteredOrders.filter(o => ['paid', 'partially_paid', 'payment_in_process', 'payment_required'].includes(o.status));

  // Unique platforms & accounts
  const plataformas = useMemo(() => [...new Set(orders.map(o => o.plataforma || '').filter(Boolean))], [orders]);
  const contasUnicas = useMemo(() => [...new Set(orders.map(o => o.conta || 'Sem Conta'))].sort(), [orders]);

  // KPIs
  const totalPedidos = paidOrders.length;
  const totalFaturamento = paidOrders.reduce((s, o) => s + o.total_amount, 0);
  const totalUnidades = paidOrders.reduce((s, o) => s + o.items.reduce((is, item) => is + item.quantity, 0), 0);
  const ticketMedio = totalPedidos > 0 ? (totalFaturamento / totalPedidos) : 0;

  // Faturamento por Plataforma
  const fatPorPlataforma = useMemo(() => {
    const map = new Map<string, { plataforma: string; label: string; value: number; pedidos: number }>();
    paidOrders.forEach(o => {
      const p = o.plataforma || 'outros';
      const cur = map.get(p) || { plataforma: p, label: getPlatformLabel(p), value: 0, pedidos: 0 };
      cur.value += o.total_amount;
      cur.pedidos += 1;
      map.set(p, cur);
    });
    return [...map.values()].sort((a, b) => b.value - a.value);
  }, [paidOrders]);

  // Faturamento por Conta (Bar)
  const fatPorConta = useMemo(() => {
    const map = new Map<string, { conta: string; faturamento: number; pedidos: number }>();
    paidOrders.forEach(o => {
      const c = o.conta || 'Outros';
      const cur = map.get(c) || { conta: c, faturamento: 0, pedidos: 0 };
      cur.faturamento += o.total_amount;
      cur.pedidos += 1;
      map.set(c, cur);
    });
    return [...map.values()].sort((a, b) => b.faturamento - a.faturamento);
  }, [paidOrders]);

  // Vendas por Hora (Area)
  const vendasPorHora = useMemo(() => {
    const hours: { hora: string; faturamento: number; pedidos: number }[] = [];
    const horaMap = new Map<string, { hora: string; faturamento: number; pedidos: number }>();
    const currentHour = new Date().getHours();
    for (let h = 0; h <= currentHour; h++) {
      const label = `${String(h).padStart(2, '0')}h`;
      horaMap.set(label, { hora: label, faturamento: 0, pedidos: 0 });
    }
    paidOrders.forEach(o => {
      const d = new Date(o.date_created);
      const h = `${String(d.getHours()).padStart(2, '0')}h`;
      const cur = horaMap.get(h);
      if (cur) {
        cur.faturamento += o.total_amount;
        cur.pedidos += 1;
      }
    });
    horaMap.forEach(v => hours.push(v));
    return hours;
  }, [paidOrders]);

  // Top SKUs do dia
  const topSkus = useMemo(() => {
    const map = new Map<string, { sku: string; vendas: number; faturamento: number }>();
    paidOrders.forEach(o => {
      o.items.forEach(item => {
        const key = item.sku || item.title?.slice(0, 30) || 'N/A';
        const cur = map.get(key) || { sku: key, vendas: 0, faturamento: 0 };
        cur.vendas += item.quantity;
        cur.faturamento += item.unit_price * item.quantity;
        map.set(key, cur);
      });
    });
    return [...map.values()].sort((a, b) => b.vendas - a.vendas).slice(0, 10);
  }, [paidOrders]);

  // Todos os pedidos do dia
  const todosPedidosDia = useMemo(() =>
    [...paidOrders].sort((a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime()),
  [paidOrders]);

  // Drop stats
  const dropOrders = useMemo(() => orders.filter(o => ['paid','partially_paid','payment_in_process','payment_required'].includes(o.status) && classifyCanal(o) === 'drop'), [orders]);
  const dropTotal = dropOrders.reduce((s, o) => s + o.total_amount, 0);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Vendas e performance marketplace" />

      <Tabs defaultValue="vendas" className="space-y-6">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="vendas">💰 Vendas ao vivo</TabsTrigger>
          <TabsTrigger value="marketplace">📊 Marketplace</TabsTrigger>
          <TabsTrigger value="faturamento">📈 Faturamento Total</TabsTrigger>
        </TabsList>

        <TabsContent value="vendas">

      {/* Status + Filters Bar */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3 bg-card border border-border rounded-xl p-3 md:p-4 mb-6">
        <button
          onClick={() => fetchOrders(false)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>

        <div className="h-5 w-px bg-border" />

        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <select value={filterPlataforma} onChange={(e) => setFilterPlataforma(e.target.value)} className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs">
            <option value="all">Todas Plataformas</option>
            {plataformas.map(p => <option key={p} value={p}>{getPlatformLabel(p)}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <select value={filterCanal} onChange={(e) => setFilterCanal(e.target.value as CanalFilter)} className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs">
            <option value="all">Todos os Canais</option>
            <option value="marketplace">Marketplace</option>
            <option value="loja">Loja</option>
            <option value="drop">🎯 Drop / Atacado VF</option>
            <option value="atacado_alexia">Atacado Alexia</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <select value={filterConta} onChange={(e) => setFilterConta(e.target.value)} className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs">
            <option value="all">Todas as Contas</option>
            {contasUnicas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-1 ml-auto text-xs text-muted-foreground">
          {lastRefresh && (
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {lastRefresh}</span>
          )}
        </div>

        {error && <span className="text-xs text-[hsl(var(--vix-danger))]">⚠️ {error}</span>}
      </div>

      {/* Large Faturamento Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 p-4 md:p-8 mb-6">
        <div className="absolute inset-0 bg-black/10" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <p className="text-white/70 text-sm font-medium mb-1">Faturamento do Dia</p>
            <p className="text-white text-3xl md:text-5xl font-black tracking-tight">{formatBRL(totalFaturamento)}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 md:gap-6">
            <div className="text-center">
              <p className="text-white/60 text-xs">Pedidos</p>
              <p className="text-white text-xl md:text-2xl font-bold">{totalPedidos}</p>
            </div>
            <div className="text-center">
              <p className="text-white/60 text-xs">Unidades</p>
              <p className="text-white text-xl md:text-2xl font-bold">{totalUnidades}</p>
            </div>
            <div className="text-center">
              <p className="text-white/60 text-xs">Ticket Médio</p>
              <p className="text-white text-xl md:text-2xl font-bold">{formatBRL(ticketMedio)}</p>
            </div>
          </div>
        </div>
        {/* Platform badges */}
        {fatPorPlataforma.length > 0 && (
          <div className="relative z-10 flex flex-wrap gap-2 mt-4">
            {fatPorPlataforma.map(p => (
              <span key={p.plataforma} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-white text-xs font-medium backdrop-blur-sm">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PLATFORM_COLORS[p.plataforma] || '#999' }} />
                {p.label}: {formatBRL(p.value)} ({p.pedidos} ped.)
              </span>
            ))}
          </div>
        )}
      </div>

      {orders.length === 0 && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-card border border-border rounded-xl">
          <Globe className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-sm mb-2">Nenhuma venda registrada hoje ainda.</p>
          <p className="text-muted-foreground text-xs">Configure contas ML/Shopee nas tabelas do Supabase.</p>
        </div>
      )}

      {paidOrders.length > 0 && (
        <>
          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Vendas por Hora */}
            <div className="bg-card border border-border rounded-xl p-4 md:p-6 animate-fade-in min-w-0">
              <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> Faturamento por Hora
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={vendasPorHora}>
                  <defs>
                    <linearGradient id="fatGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number, name: string) => String(name).toLowerCase() === 'faturamento' ? formatBRL(v) : v} />
                  <Area type="monotone" dataKey="faturamento" stroke="#6366f1" fill="url(#fatGrad)" strokeWidth={2} name="Faturamento" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Faturamento por Conta */}
            {fatPorConta.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-4 md:p-6 animate-fade-in min-w-0">
                <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-500" /> Faturamento por Conta
                </h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={fatPorConta}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="conta" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => formatBRL(v)} />
                    <Bar dataKey="faturamento" fill="#22c55e" name="Faturamento" radius={[6, 6, 0, 0]}>
                      {fatPorConta.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Top SKUs */}
          {topSkus.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4 md:p-6 mb-6 animate-fade-in min-w-0">
              <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-500" /> Top Vendas do Dia (SKU)
              </h3>
              <ResponsiveContainer width="100%" height={Math.max(200, topSkus.length * 35)}>
                <BarChart data={topSkus} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="sku" type="category" tick={{ fontSize: 9 }} width={80} />
                  <Tooltip formatter={(v: number, name: string) => String(name).toLowerCase() === 'faturamento' ? formatBRL(v) : v} />
                  <Legend />
                  <Bar dataKey="vendas" fill="#22c55e" name="Qtd" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="faturamento" fill="#6366f1" name="Faturamento" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Últimos Pedidos - Scroll Horizontal */}
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 animate-fade-in relative">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-foreground font-semibold flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-amber-500" /> Todos os Pedidos do Dia
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full ml-2">
                  {todosPedidosDia.length}
                </span>
              </h3>
              
              {/* Drop Stats Badge */}
              {dropOrders.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full">
                  <span className="text-xs font-semibold text-amber-500">🎯 Drop: {dropOrders.length} ped.</span>
                  <span className="w-1 h-1 rounded-full bg-amber-500/50" />
                  <span className="text-xs font-semibold text-amber-500">{formatBRL(dropTotal)}</span>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30">
                  <tr className="border-b border-border">
                    <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Hora</th>
                    <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Plataforma</th>
                    <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Conta</th>
                    <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Comprador</th>
                    <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Vendedor</th>
                    <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Produto</th>
                    <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">Qtd</th>
                    <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">Valor</th>
                    <th className="text-center py-2.5 px-3 text-muted-foreground font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {todosPedidosDia.map((o) => (
                    <tr key={o.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3">{new Date(o.date_created).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PLATFORM_COLORS[o.plataforma || ''] || '#999' }} />
                          <span className="font-medium">{getPlatformLabel(o.plataforma || '')}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3">{o.conta}</td>
                      <td className="py-2.5 px-3">{o.buyer}</td>
                      <td className="py-2.5 px-3 text-xs">{o.vendedor || '-'}</td>
                      <td className="py-2.5 px-3 max-w-[180px] truncate" title={o.items.map(i => i.title).join(', ')}>
                        {o.items.map(i => i.sku || i.title?.slice(0, 25)).join(', ')}
                      </td>
                      <td className="py-2.5 px-3 text-right">{o.items.reduce((s, i) => s + i.quantity, 0)}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-[hsl(var(--vix-success))]">{formatBRL(o.total_amount)}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          o.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500' :
                          o.status === 'cancelled' ? 'bg-red-500/10 text-red-500' :
                          'bg-amber-500/10 text-amber-500'
                        }`}>
                          {o.status === 'paid' ? 'Pago' : o.status === 'cancelled' ? 'Cancelado' : classifyCanal(o) === 'drop' ? 'Drop' : o.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </>
        )}
        </TabsContent>

        <TabsContent value="marketplace">
          <MarketplaceTab />
        </TabsContent>

        <TabsContent value="faturamento">
          <FaturamentoTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
