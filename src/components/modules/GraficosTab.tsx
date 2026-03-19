import { useState, useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, PieChart, Pie, Cell, Area, AreaChart, LineChart, Line } from 'recharts';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import { formatBRL, normalizeConta, getContasNormalizadas } from '@/lib/utils-vix';

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--accent))',
  'hsl(var(--vix-warning))',
  'hsl(var(--vix-info))',
  'hsl(var(--vix-success))',
  'hsl(var(--vix-danger))',
  '#8b5cf6',
  '#06b6d4',
  '#f59e0b',
  '#10b981',
];

const tooltipStyle = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--foreground))',
  fontSize: '12px',
};

const axisStyle = { fill: 'hsl(var(--muted-foreground))', fontSize: 11 };

// Marketplaces that count for margin charts (exclude showroom, atacado, loja)
const MARKETPLACE_KEYWORDS = ['mercado livre', 'shopee', 'shein', 'amazon', 'magalu', 'americanas', 'casas bahia', 'magazine'];
const ATACADO_KEYWORDS = ['atacado'];
const SHOWROOM_KEYWORDS = ['showroom'];
const LOJA_KEYWORDS = ['loja'];

type CanalTipo = 'all' | 'marketplace' | 'atacado' | 'showroom' | 'loja';

const classifyCanal = (origem: string): CanalTipo => {
  if (!origem) return 'marketplace';
  const lower = origem.toLowerCase();
  if (ATACADO_KEYWORDS.some(kw => lower.includes(kw))) return 'atacado';
  if (SHOWROOM_KEYWORDS.some(kw => lower.includes(kw))) return 'showroom';
  if (LOJA_KEYWORDS.some(kw => lower.includes(kw))) return 'loja';
  return 'marketplace';
};

const isMarketplace = (origem: string) => classifyCanal(origem) === 'marketplace';

export function GraficosTab() {
  const sheetsData = useSheetsData();
  const allVendas = sheetsData.vendasItems || [];
  const allPerf = sheetsData.performanceItems || [];

  // ---- Filters ----
  const [filterConta, setFilterConta] = useState('all');
  const [filterDias, setFilterDias] = useState(90);
  const [filterCanal, setFilterCanal] = useState<CanalTipo>('all');
  const [filterMarketplace, setFilterMarketplace] = useState('all');

  const contasVendas = useMemo(() => getContasNormalizadas(allVendas.map(v => v.conta).filter(Boolean)), [allVendas]);
  const contasPerf = useMemo(() => getContasNormalizadas(allPerf.map(p => p.conta).filter(Boolean)), [allPerf]);
  const todasContas = useMemo(() => [...new Set([...contasVendas, ...contasPerf])].sort(), [contasVendas, contasPerf]);

  // Get unique marketplaces for sub-filter
  const uniqueMarketplaces = useMemo(() => {
    const origins = new Set<string>();
    allVendas.forEach(v => {
      if (v.pedidoOrigem && classifyCanal(v.pedidoOrigem) === 'marketplace') {
        origins.add(v.pedidoOrigem);
      }
    });
    return [...origins].sort();
  }, [allVendas]);

  // Apply filters
  const vendas = useMemo(() => {
    let items = allVendas;
    if (filterConta !== 'all') {
      items = items.filter(v => normalizeConta(v.conta) === filterConta);
    }
    if (filterCanal !== 'all') {
      items = items.filter(v => classifyCanal(v.pedidoOrigem) === filterCanal);
      if (filterCanal === 'marketplace' && filterMarketplace !== 'all') {
        items = items.filter(v => v.pedidoOrigem === filterMarketplace);
      }
    }
    if (filterDias > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - filterDias);
      items = items.filter(v => {
        if (!v.data) return true;
        const parts = v.data.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (parts) {
          const d = new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]));
          return d >= cutoff;
        }
        const d = new Date(v.data);
        return !isNaN(d.getTime()) && d >= cutoff;
      });
    }
    return items;
  }, [allVendas, filterConta, filterDias, filterCanal, filterMarketplace]);

  const perf = useMemo(() => {
    if (filterConta === 'all') return allPerf;
    return allPerf.filter(p => normalizeConta(p.conta) === filterConta);
  }, [allPerf, filterConta]);

  // ---- Vendas aggregations ----
  const vendasPorDia = useMemo(() => {
    if (vendas.length === 0) return [];
    const map = new Map<string, { dia: string; pedidos: number; faturamento: number; liquido: number }>();
    vendas.forEach(v => {
      const d = v.data?.slice(0, 10) || 'N/A';
      const cur = map.get(d) || { dia: d, pedidos: 0, faturamento: 0, liquido: 0 };
      cur.pedidos += 1;
      cur.faturamento += v.valorTotal || 0;
      cur.liquido += v.liquido || 0;
      map.set(d, cur);
    });
    return [...map.values()]
      .map(x => ({ ...x, faturamento: Math.round(x.faturamento), liquido: Math.round(x.liquido) }))
      .sort((a, b) => a.dia.localeCompare(b.dia)).slice(-30);
  }, [vendas]);

  const vendasPorConta = useMemo(() => {
    if (vendas.length === 0) return [];
    const map = new Map<string, { conta: string; faturamento: number; pedidos: number; liquido: number }>();
    vendas.forEach(v => {
      const c = normalizeConta(v.conta) || 'Outros';
      const cur = map.get(c) || { conta: c, faturamento: 0, pedidos: 0, liquido: 0 };
      cur.faturamento += v.valorTotal || 0;
      cur.pedidos += 1;
      cur.liquido += v.liquido || 0;
      map.set(c, cur);
    });
    return [...map.values()]
      .map(x => ({ ...x, faturamento: Math.round(x.faturamento), liquido: Math.round(x.liquido) }))
      .sort((a, b) => b.faturamento - a.faturamento);
  }, [vendas]);

  const vendasPorOrigem = useMemo(() => {
    if (vendas.length === 0) return [];
    const map = new Map<string, { origem: string; value: number }>();
    vendas.forEach(v => {
      const o = v.pedidoOrigem || 'Outros';
      const cur = map.get(o) || { origem: o, value: 0 };
      cur.value += v.valorTotal || 0;
      map.set(o, cur);
    });
    return [...map.values()]
      .map(x => ({ ...x, value: Math.round(x.value) }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
  }, [vendas]);

  const topSkus = useMemo(() => {
    if (vendas.length === 0) return [];
    const map = new Map<string, { sku: string; vendas: number; faturamento: number }>();
    vendas.forEach(v => {
      const s = v.sku || 'N/A';
      const cur = map.get(s) || { sku: s, vendas: 0, faturamento: 0 };
      cur.vendas += v.quantidade || 1;
      cur.faturamento += v.valorTotal || 0;
      map.set(s, cur);
    });
    return [...map.values()]
      .map(x => ({ ...x, faturamento: Math.round(x.faturamento) }))
      .sort((a, b) => b.vendas - a.vendas).slice(0, 10);
  }, [vendas]);

  // Margem only from marketplaces (exclude showroom, atacado, loja)
  const margemPorSku = useMemo(() => {
    if (vendas.length === 0) return [];
    const marketplaceVendas = vendas.filter(v => isMarketplace(v.pedidoOrigem));
    const map = new Map<string, { sku: string; margem: number; count: number }>();
    marketplaceVendas.forEach(v => {
      const s = v.sku || 'N/A';
      const m = typeof v.margem === 'string' ? parseFloat(v.margem.replace(/[^0-9.,-]/g,'').replace(',','.')) : 0;
      if (isNaN(m)) return;
      const cur = map.get(s) || { sku: s, margem: 0, count: 0 };
      cur.margem += m;
      cur.count += 1;
      map.set(s, cur);
    });
    return [...map.values()]
      .map(x => ({ sku: x.sku, margem: x.count > 0 ? x.margem / x.count : 0 }))
      .filter(x => Math.abs(x.margem) > 0)
      .sort((a, b) => b.margem - a.margem);
  }, [vendas]);

  const melhoresMargens = margemPorSku.slice(0, 8);
  const pioresMargens = [...margemPorSku].sort((a, b) => a.margem - b.margem).slice(0, 8);

  // ---- Performance aggregations (using SKU) ----
  const perfPorSku = useMemo(() => {
    if (perf.length === 0) return [];
    const map = new Map<string, { sku: string; visitas: number; vendas: number; conversao: number; count: number }>();
    perf.forEach(p => {
      const s = p.sku || p.idAnuncio || 'N/A';
      const cur = map.get(s) || { sku: s, visitas: 0, vendas: 0, conversao: 0, count: 0 };
      cur.visitas += p.visitas || 0;
      cur.vendas += p.vendas || 0;
      cur.conversao += p.conversao || 0;
      cur.count += 1;
      map.set(s, cur);
    });
    return [...map.values()].map(x => ({
      ...x,
      conversao: x.count > 0 ? x.conversao / x.count : 0,
    }));
  }, [perf]);

  const topAnunciosVendas = [...perfPorSku].sort((a, b) => b.vendas - a.vendas).slice(0, 10);
  const topAnunciosConversao = [...perfPorSku].sort((a, b) => b.conversao - a.conversao).slice(0, 10);

  const perfPorConta = useMemo(() => {
    if (perf.length === 0) return [];
    const map = new Map<string, { conta: string; visitas: number; vendas: number }>();
    perf.forEach(p => {
      const c = normalizeConta(p.conta) || 'Outros';
      const cur = map.get(c) || { conta: c, visitas: 0, vendas: 0 };
      cur.visitas += p.visitas || 0;
      cur.vendas += p.vendas || 0;
      map.set(c, cur);
    });
    return [...map.values()].sort((a, b) => b.vendas - a.vendas);
  }, [perf]);

  const hasData = allVendas.length > 0 || allPerf.length > 0;
  const isMarketplaceView = filterCanal === 'all' || filterCanal === 'marketplace';

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-muted-foreground text-sm mb-2">Nenhum dado importado ainda.</p>
        <p className="text-muted-foreground text-xs">Importe dados na aba "Planilhas Google" para visualizar os gráficos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground font-medium">Conta:</label>
          <select value={filterConta} onChange={(e) => setFilterConta(e.target.value)} className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs">
            <option value="all">Todas</option>
            {todasContas.map(c => (<option key={c} value={c}>{c}</option>))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground font-medium">Período:</label>
          <select value={filterDias} onChange={(e) => setFilterDias(parseInt(e.target.value))} className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs">
            <option value={7}>Últimos 7 dias</option>
            <option value={15}>Últimos 15 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={60}>Últimos 60 dias</option>
            <option value={90}>Últimos 90 dias</option>
            <option value={0}>Todo o período</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground font-medium">Canal:</label>
          <select value={filterCanal} onChange={(e) => { setFilterCanal(e.target.value as CanalTipo); setFilterMarketplace('all'); }} className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs">
            <option value="all">Todos</option>
            <option value="marketplace">Marketplace</option>
            <option value="atacado">Atacado</option>
            <option value="showroom">Showroom</option>
            <option value="loja">Loja</option>
          </select>
        </div>
        {filterCanal === 'marketplace' && uniqueMarketplaces.length > 0 && (
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground font-medium">Marketplace:</label>
            <select value={filterMarketplace} onChange={(e) => setFilterMarketplace(e.target.value)} className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs">
              <option value="all">Todos</option>
              {uniqueMarketplaces.map(m => (<option key={m} value={m}>{m}</option>))}
            </select>
          </div>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {vendas.length} vendas · {perf.length} anúncios
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 1. Vendas por Dia */}
        {vendasPorDia.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in lg:col-span-2">
            <h3 className="text-foreground font-semibold mb-4">📈 Vendas por Dia</h3>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={vendasPorDia}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="dia" tick={axisStyle} />
                <YAxis tick={axisStyle} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Area type="monotone" dataKey="faturamento" name="Faturamento" fill="hsl(var(--primary))" stroke="hsl(var(--primary))" fillOpacity={0.3} />
                <Area type="monotone" dataKey="liquido" name="Líquido" fill="hsl(var(--vix-success))" stroke="hsl(var(--vix-success))" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 2. Pedidos por Dia */}
        {vendasPorDia.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
            <h3 className="text-foreground font-semibold mb-4">📦 Pedidos por Dia</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={vendasPorDia}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="dia" tick={axisStyle} />
                <YAxis tick={axisStyle} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="pedidos" name="Pedidos" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 3. Faturamento por Conta */}
        {vendasPorConta.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
            <h3 className="text-foreground font-semibold mb-4">🏪 Faturamento por Conta</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={vendasPorConta} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="faturamento" label={({ conta, percent }) => `${conta} ${(percent * 100).toFixed(0)}%`}>
                  {vendasPorConta.map((_, i) => (<Cell key={`pc-${i}`} fill={COLORS[i % COLORS.length]} />))}
                </Pie>
                <Tooltip formatter={(value: number) => [formatBRL(value), 'Faturamento']} contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 4. Faturamento por Marketplace */}
        {isMarketplaceView && vendasPorOrigem.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
            <h3 className="text-foreground font-semibold mb-4">🌐 Faturamento por Marketplace</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={vendasPorOrigem} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={axisStyle} tickFormatter={v => formatBRL(v)} />
                <YAxis type="category" dataKey="origem" tick={axisStyle} width={130} />
                <Tooltip formatter={(value: number) => [formatBRL(value), 'Faturamento']} contentStyle={tooltipStyle} />
                <Bar dataKey="value" name="Faturamento" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 5. Líquido por Conta */}
        {vendasPorConta.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
            <h3 className="text-foreground font-semibold mb-4">💰 Líquido por Conta</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={vendasPorConta}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="conta" tick={axisStyle} />
                <YAxis tick={axisStyle} tickFormatter={v => formatBRL(v)} />
                <Tooltip formatter={(value: number) => [formatBRL(value)]} contentStyle={tooltipStyle} />
                <Bar dataKey="liquido" name="Líquido" fill="hsl(var(--vix-success))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="faturamento" name="Faturamento" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.3} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 6. Top 10 SKUs mais vendidos */}
        {topSkus.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
            <h3 className="text-foreground font-semibold mb-4">🏆 Top 10 SKUs Mais Vendidos</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topSkus} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={axisStyle} />
                <YAxis type="category" dataKey="sku" tick={axisStyle} width={80} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="vendas" name="Unidades" fill="hsl(var(--vix-info))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 7. Melhor Margem por SKU (Marketplaces only) */}
        {isMarketplaceView && melhoresMargens.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
            <h3 className="text-foreground font-semibold mb-4">✅ Melhor Margem (Marketplaces)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={melhoresMargens} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={axisStyle} tickFormatter={v => `${v.toFixed(1)}%`} />
                <YAxis type="category" dataKey="sku" tick={axisStyle} width={80} />
                <Tooltip formatter={(value: number) => [`${value.toFixed(2)}%`, 'Margem']} contentStyle={tooltipStyle} />
                <Bar dataKey="margem" name="Margem %" fill="hsl(var(--vix-success))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 8. Pior Margem por SKU (Marketplaces only) */}
        {isMarketplaceView && pioresMargens.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
            <h3 className="text-foreground font-semibold mb-4">⚠️ Pior Margem (Marketplaces)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={pioresMargens} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={axisStyle} tickFormatter={v => `${v.toFixed(1)}%`} />
                <YAxis type="category" dataKey="sku" tick={axisStyle} width={80} />
                <Tooltip formatter={(value: number) => [`${value.toFixed(2)}%`, 'Margem']} contentStyle={tooltipStyle} />
                <Bar dataKey="margem" name="Margem %" fill="hsl(var(--vix-danger))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 9. Top Anúncios por Vendas - by SKU */}
        {isMarketplaceView && topAnunciosVendas.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
            <h3 className="text-foreground font-semibold mb-4">📊 Top Anúncios por Vendas (SKU)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topAnunciosVendas} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={axisStyle} />
                <YAxis type="category" dataKey="sku" tick={axisStyle} width={80} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="vendas" name="Vendas" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 10. Top Anúncios por Conversão - by SKU */}
        {isMarketplaceView && topAnunciosConversao.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
            <h3 className="text-foreground font-semibold mb-4">🎯 Top Anúncios por Conversão (SKU)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topAnunciosConversao} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={axisStyle} tickFormatter={v => `${v.toFixed(1)}%`} />
                <YAxis type="category" dataKey="sku" tick={axisStyle} width={80} />
                <Tooltip formatter={(value: number) => [`${value.toFixed(2)}%`, 'Conversão']} contentStyle={tooltipStyle} />
                <Bar dataKey="conversao" name="Conversão %" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 11. Visitas vs Vendas por Conta */}
        {isMarketplaceView && perfPorConta.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in lg:col-span-2">
            <h3 className="text-foreground font-semibold mb-4">🏬 Visitas vs Vendas por Conta</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={perfPorConta}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="conta" tick={axisStyle} />
                <YAxis tick={axisStyle} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Bar dataKey="visitas" name="Visitas" fill="hsl(var(--vix-info))" radius={[4, 4, 0, 0]} opacity={0.5} />
                <Bar dataKey="vendas" name="Vendas" fill="hsl(var(--vix-success))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
