import { useMemo, useState } from 'react';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import { useVendasFromDB, useVendasSKUFromDB } from '@/hooks/useVendasFromDB';
import { subDays, format } from 'date-fns';
import { formatBRL, normalizeConta, getContasNormalizadas } from '@/lib/utils-vix';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

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
  const allPerf = sheetsData.performanceItems || [];

  // ---- Filters ----
  const [filterConta, setFilterConta] = useState('all');
  const [filterDias, setFilterDias] = useState(30);

  const dateFim = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const dateIni = useMemo(() => format(subDays(new Date(), filterDias), 'yyyy-MM-dd'), [filterDias]);

  const { data: dbDaily, loading: loadingDaily } = useVendasFromDB(dateIni, dateFim, filterConta !== 'all' ? [filterConta] : undefined);
  const { data: dbSku, loading: loadingSku } = useVendasSKUFromDB(dateIni, dateFim, filterConta !== 'all' ? [filterConta] : undefined);

  const [filterCanal, setFilterCanal] = useState<CanalTipo>('all');
  const [filterMarketplace, setFilterMarketplace] = useState('all');

  const todasContas = useMemo(() => {
    const contasVendas = [...new Set((sheetsData.vendasItems || []).map(v => v.conta || v.origem).filter(Boolean))];
    const contasPerf = [...new Set(allPerf.map(p => p.conta).filter(Boolean))];
    return [...new Set([...contasVendas, ...contasPerf])].sort();
  }, [sheetsData.vendasItems, allPerf]);

  // Get unique marketplaces for sub-filter from DB data
  const uniqueMarketplaces = useMemo(() => {
    const set = new Set<string>();
    dbDaily.forEach(v => {
      if (v.marketplace) set.add(v.marketplace.trim());
    });
    return [...set].sort();
  }, [dbDaily]);

  // Final cleanup: removed legacy info


  const perf = useMemo(() => {
    if (filterConta === 'all') return allPerf;
    return allPerf.filter(p => normalizeConta(p.conta) === filterConta);
  }, [allPerf, filterConta]);

  // Combined local filtering
  const filteredDaily = useMemo(() => {
    return dbDaily.filter(v => {
      if (filterCanal !== 'all' && classifyCanal(v.marketplace || v.conta) !== filterCanal) return false;
      if (filterMarketplace !== 'all' && v.marketplace !== filterMarketplace) return false;
      return true;
    });
  }, [dbDaily, filterCanal, filterMarketplace]);

  const vendasPorDia = useMemo(() => {
    const dateMap = new Map<string, { dia: string; pedidos: number; faturamento: number; liquido: number }>();
    filteredDaily.forEach(v => {
      if (!v.data) return;
      const dt = new Date(v.data);
      if (isNaN(dt.getTime())) return;
      const d = format(dt, 'dd/MM');
      const cur = dateMap.get(d) || { dia: d, pedidos: 0, faturamento: 0, liquido: 0 };
      cur.pedidos += v.pedidos;
      cur.faturamento += v.faturamento_bruto;
      cur.liquido += v.lucro_liquido;
      dateMap.set(d, cur);
    });
    return [...dateMap.values()]
      .sort((a, b) => {
        const [da, ma] = a.dia.split('/').map(Number);
        const [db, mb] = b.dia.split('/').map(Number);
        return (ma * 100 + da) - (mb * 100 + db);
      });
  }, [filteredDaily]);

  const vendasPorConta = useMemo(() => {
    const map = new Map<string, { conta: string; faturamento: number; pedidos: number; liquido: number }>();
    filteredDaily.forEach(v => {
      const c = v.conta || 'Outros';
      const cur = map.get(c) || { conta: c, faturamento: 0, pedidos: 0, liquido: 0 };
      cur.faturamento += v.faturamento_bruto;
      cur.pedidos += v.pedidos;
      cur.liquido += v.lucro_liquido;
      map.set(c, cur);
    });
    return [...map.values()].sort((a, b) => b.faturamento - a.faturamento);
  }, [filteredDaily]);

  const vendasPorOrigem = useMemo(() => {
    const map = new Map<string, { origem: string; value: number }>();
    filteredDaily.forEach(v => {
      const o = v.marketplace || v.conta || 'Outros';
      const cur = map.get(o) || { origem: o, value: 0 };
      cur.value += v.faturamento_bruto;
      map.set(o, cur);
    });
    return [...map.values()]
      .sort((a, b) => b.value - a.value).slice(0, 8);
  }, [filteredDaily]);

  const topSkus = useMemo(() => {
    return dbSku
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 10)
      .map(d => ({ sku: d.sku, vendas: d.quantidade, faturamento: d.faturamento_bruto }));
  }, [dbSku]);

  // Margem from DB
  const margemPorSku = useMemo(() => {
    return dbSku
      .map(d => ({ sku: d.sku, margem: d.faturamento_bruto > 0 ? (d.liquido / d.faturamento_bruto) * 100 : 0 }))
      .filter(x => Math.abs(x.margem) > 0)
      .sort((a, b) => b.margem - a.margem);
  }, [dbSku]);

  const melhoresMargens = margemPorSku.slice(0, 10);
  const pioresMargens = [...margemPorSku].sort((a, b) => a.margem - b.margem).slice(0, 10);

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

  const hasData = dbDaily.length > 0 || dbSku.length > 0 || allPerf.length > 0;
  const isLoading = loadingDaily || loadingSku;
  const isMarketplaceView = filterCanal === 'all' || filterCanal === 'marketplace';

  if (!hasData && !isLoading) {
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
          {dbDaily.length} registros · {perf.length} anúncios
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 1. Vendas por Dia */}
        {vendasPorDia.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 animate-fade-in lg:col-span-2">
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
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 animate-fade-in">
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
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 animate-fade-in">
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
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 animate-fade-in">
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
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 animate-fade-in">
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
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 animate-fade-in">
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
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 animate-fade-in">
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
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 animate-fade-in">
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
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 animate-fade-in">
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
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 animate-fade-in">
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
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 animate-fade-in lg:col-span-2">
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
