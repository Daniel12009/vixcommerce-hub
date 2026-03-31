import { useMemo, useState } from 'react';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import { formatBRL } from '@/lib/utils-vix';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ScatterChart, Scatter, ZAxis, LabelList,
  AreaChart, Area
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, DollarSign, BarChart2, Percent, Target, ArrowUpDown, Users } from 'lucide-react';

const COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6',
  '#ec4899', '#14b8a6', '#8b5cf6', '#f97316', '#06b6d4',
  '#a3e635', '#fb7185', '#34d399', '#fbbf24', '#60a5fa',
];

function parseDate(d: string): Date | null {
  if (!d) return null;
  const parts = d.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (parts) return new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]));
  const iso = new Date(d);
  return !isNaN(iso.getTime()) ? iso : null;
}

function formatDateShort(d: string): string {
  const dt = parseDate(d);
  if (!dt) return d;
  return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}`;
}

function num(v: any): number {
  if (!v && v !== 0) return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const s = String(v).replace(/[R$\s%]/g, '').replace(/\./g, '').replace(',', '.');
  return parseFloat(s) || 0;
}

function DeltaArrow({ current, previous, invert }: { current: number; previous: number; invert?: boolean }) {
  if (previous === 0 && current === 0) return <Minus className="w-3 h-3 text-muted-foreground inline" />;
  if (previous === 0) return <TrendingUp className="w-3 h-3 text-emerald-500 inline" />;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const isUp = pct > 0;
  if (Math.abs(pct) < 0.5) return <Minus className="w-3 h-3 text-muted-foreground inline" />;
  const goodUp = invert ? !isUp : isUp;
  const Icon = isUp ? TrendingUp : TrendingDown;
  const color = goodUp ? 'text-emerald-500' : 'text-red-500';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${color}`}>
      <Icon className="w-3 h-3" /> {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

const isAtacado = (conta: string) =>
  conta.toLowerCase().includes('atacado') ||
  conta.toLowerCase().includes('alexia') ||
  conta.toLowerCase().includes('vf|') ||
  conta.toLowerCase().includes('|vf');

export function FaturamentoTab() {
  const sheetsData = useSheetsData();
  const allVendas = sheetsData.vendasItems || [];

  const [filterDias, setFilterDias] = useState(30);
  const [filterConta, setFilterConta] = useState('all');
  const [filterCanal, setFilterCanal] = useState<'all' | 'varejo' | 'atacado'>('all');
  const [sortField, setSortField] = useState('faturamento');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // All unique contas
  const contas = useMemo(() =>
    [...new Set(allVendas.map(v => v.conta || v.origem || '').filter(Boolean))].sort(),
    [allVendas]
  );

  // Filter by date + conta + canal
  const vendas = useMemo(() => {
    let base = allVendas;
    if (filterDias > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - filterDias);
      base = base.filter(v => {
        const d = parseDate(v.data);
        return d ? d >= cutoff : true;
      });
    }
    if (filterConta !== 'all') {
      base = base.filter(v => (v.conta || v.origem || '') === filterConta);
    }
    if (filterCanal !== 'all') {
      base = base.filter(v => {
        const c = v.conta || v.origem || '';
        return filterCanal === 'atacado' ? isAtacado(c) : !isAtacado(c);
      });
    }
    return base;
  }, [allVendas, filterDias, filterConta, filterCanal]);

  const prevVendas = useMemo(() => {
    if (filterDias <= 0) return [];
    const now = new Date();
    const cutoffCur = new Date(); cutoffCur.setDate(now.getDate() - filterDias);
    const cutoffPrev = new Date(); cutoffPrev.setDate(now.getDate() - filterDias * 2);
    let base = allVendas.filter(v => {
      const d = parseDate(v.data);
      return d ? d >= cutoffPrev && d < cutoffCur : false;
    });
    if (filterConta !== 'all') base = base.filter(v => (v.conta || v.origem || '') === filterConta);
    if (filterCanal !== 'all') base = base.filter(v => {
      const c = v.conta || v.origem || '';
      return filterCanal === 'atacado' ? isAtacado(c) : !isAtacado(c);
    });
    return base;
  }, [allVendas, filterDias, filterConta, filterCanal]);

  // ── KPIs ──
  const totalFat = useMemo(() => vendas.reduce((s, v) => s + num(v.valorTotal), 0), [vendas]);
  const totalLiq = useMemo(() => vendas.reduce((s, v) => s + num(v.liquido), 0), [vendas]);
  const totalQtd = useMemo(() => vendas.reduce((s, v) => s + num(v.quantidade), 0), [vendas]);
  const totalAds = useMemo(() => vendas.reduce((s, v) => s + num(v.ads), 0), [vendas]);
  const margem = totalFat > 0 ? (totalLiq / totalFat) * 100 : 0;
  const ticket = vendas.length > 0 ? totalFat / new Set(vendas.map(v => v.numeroPedido)).size : 0;
  const pctAds = totalFat > 0 ? (totalAds / totalFat) * 100 : 0;

  const prevFat = prevVendas.reduce((s, v) => s + num(v.valorTotal), 0);
  const prevLiq = prevVendas.reduce((s, v) => s + num(v.liquido), 0);
  const prevMargem = prevFat > 0 ? (prevLiq / prevFat) * 100 : 0;

  // ── Chart 1: Faturamento diário por conta (Stacked Area) ──
  const stackedAreaData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number>>();
    vendas.forEach(v => {
      const dateKey = formatDateShort(v.data);
      if (!dateKey) return;
      const conta = v.conta || v.origem || 'Outros';
      const row = dateMap.get(dateKey) || {};
      row[conta] = (row[conta] || 0) + num(v.valorTotal);
      dateMap.set(dateKey, row);
    });
    const sortedDates = [...dateMap.keys()].sort((a, b) => {
      const [da, ma] = a.split('/').map(Number);
      const [db, mb] = b.split('/').map(Number);
      return (ma * 100 + da) - (mb * 100 + db);
    });
    return sortedDates.map(date => ({ date, ...dateMap.get(date)! }));
  }, [vendas]);

  const contasNoChart = useMemo(() =>
    [...new Set(vendas.map(v => v.conta || v.origem || 'Outros').filter(Boolean))].sort(),
    [vendas]
  );

  // ── Chart 2: Faturamento + Margem por dia (Bar + Line) ──
  const fatMargemDia = useMemo(() => {
    const dateMap = new Map<string, { fat: number; liq: number }>();
    vendas.forEach(v => {
      const dateKey = formatDateShort(v.data);
      if (!dateKey) return;
      const row = dateMap.get(dateKey) || { fat: 0, liq: 0 };
      row.fat += num(v.valorTotal);
      row.liq += num(v.liquido);
      dateMap.set(dateKey, row);
    });
    const sortedDates = [...dateMap.keys()].sort((a, b) => {
      const [da, ma] = a.split('/').map(Number);
      const [db, mb] = b.split('/').map(Number);
      return (ma * 100 + da) - (mb * 100 + db);
    });
    return sortedDates.map(date => {
      const row = dateMap.get(date)!;
      return {
        date,
        faturamento: Math.round(row.fat),
        pctMargem: row.fat > 0 ? parseFloat(((row.liq / row.fat) * 100).toFixed(1)) : 0,
      };
    });
  }, [vendas]);

  // ── Chart 3: Scatter — QTDE vs Ticket Médio (bubble = Margem%) ──
  const scatterData = useMemo(() => {
    const skuMap = new Map<string, { qtd: number; fat: number; liq: number; pedidos: Set<string>; ads: number }>();
    vendas.forEach(v => {
      const sku = v.skuProduto || v.sku || 'N/A';
      const cur = skuMap.get(sku) || { qtd: 0, fat: 0, liq: 0, pedidos: new Set<string>(), ads: 0 };
      cur.qtd += num(v.quantidade);
      cur.fat += num(v.valorTotal);
      cur.liq += num(v.liquido);
      cur.ads += num(v.ads);
      if (v.numeroPedido) cur.pedidos.add(v.numeroPedido);
      skuMap.set(sku, cur);
    });
    return [...skuMap.entries()]
      .filter(([, d]) => d.fat > 1000)
      .map(([sku, d]) => ({
        sku,
        x: d.qtd,
        y: d.pedidos.size > 0 ? Math.round(d.fat / d.pedidos.size) : 0,
        z: d.fat > 0 ? Math.round((d.liq / d.fat) * 100) : 0, // margem%
        faturamento: d.fat,
        pctAds: d.fat > 0 ? (d.ads / d.fat) * 100 : 0,
      }))
      .sort((a, b) => b.faturamento - a.faturamento)
      .slice(0, 40);
  }, [vendas]);

  // ── Table: SKU-level ──
  const skuTable = useMemo(() => {
    const skuMap = new Map<string, { qtd: number; fat: number; liq: number; pedidos: Set<string>; ads: number; devQtd: number }>();
    const prevSkuMap = new Map<string, { fat: number; liq: number; qtd: number }>();

    vendas.forEach(v => {
      const sku = v.skuProduto || v.sku || 'N/A';
      const cur = skuMap.get(sku) || { qtd: 0, fat: 0, liq: 0, pedidos: new Set<string>(), ads: 0, devQtd: 0 };
      cur.qtd += num(v.quantidade);
      cur.fat += num(v.valorTotal);
      cur.liq += num(v.liquido);
      cur.ads += num(v.ads);
      if (v.numeroPedido) cur.pedidos.add(v.numeroPedido);
      if ((v.statusPedido || '').toLowerCase().match(/cancel|devolv/)) cur.devQtd += num(v.quantidade);
      skuMap.set(sku, cur);
    });

    prevVendas.forEach(v => {
      const sku = v.skuProduto || v.sku || 'N/A';
      const cur = prevSkuMap.get(sku) || { fat: 0, liq: 0, qtd: 0 };
      cur.fat += num(v.valorTotal);
      cur.liq += num(v.liquido);
      cur.qtd += num(v.quantidade);
      prevSkuMap.set(sku, cur);
    });

    const diasDiv = filterDias > 0 ? filterDias : 30;
    const rows = [...skuMap.entries()].map(([sku, d]) => {
      const prev = prevSkuMap.get(sku) || { fat: 0, liq: 0, qtd: 0 };
      const margem = d.fat > 0 ? (d.liq / d.fat) * 100 : 0;
      const prevMargem = prev.fat > 0 ? (prev.liq / prev.fat) * 100 : 0;
      const ticket = d.pedidos.size > 0 ? d.fat / d.pedidos.size : 0;
      const pctAds = d.fat > 0 ? (d.ads / d.fat) * 100 : 0;
      const pctDev = d.qtd > 0 ? (d.devQtd / d.qtd) * 100 : 0;
      return { sku, faturamento: d.fat, liquido: d.liq, qtd: d.qtd, qtdDia: d.qtd / diasDiv, ticket, margem, pctAds, pctDev, prevFat: prev.fat, prevLiq: prev.liq, prevQtd: prev.qtd, prevMargem };
    });

    return rows.sort((a, b) => {
      const dir = sortDir === 'desc' ? -1 : 1;
      if (sortField === 'sku') return dir * a.sku.localeCompare(b.sku);
      return dir * ((a as any)[sortField] - (b as any)[sortField]);
    });
  }, [vendas, prevVendas, filterDias, sortField, sortDir]);

  function toggleSort(field: string) {
    if (sortField === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortField(field); setSortDir('desc'); }
  }

  const hasPrev = prevVendas.length > 0;

  const CustomScatterTooltip = ({ active, payload }: any) => {
    if (active && payload?.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-xl">
          <p className="font-bold text-foreground mb-1">{d.sku}</p>
          <p className="text-muted-foreground">QTDE: <span className="text-foreground font-medium">{d.x.toLocaleString('pt-BR')}</span></p>
          <p className="text-muted-foreground">Ticket Médio: <span className="text-foreground font-medium">{formatBRL(d.y)}</span></p>
          <p className="text-muted-foreground">Margem: <span className="font-medium" style={{ color: d.z >= 15 ? '#22c55e' : d.z >= 5 ? '#f59e0b' : '#ef4444' }}>{d.z}%</span></p>
          <p className="text-muted-foreground">Faturamento: <span className="text-foreground font-medium">{formatBRL(d.faturamento)}</span></p>
        </div>
      );
    }
    return null;
  };

  if (allVendas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 mb-4">
          <BarChart2 className="w-10 h-10 text-indigo-400" />
        </div>
        <h3 className="text-foreground font-semibold mb-1">Nenhum dado de Vendas importado</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Importe a planilha de <strong>Vendas</strong> em Configurações → Planilhas para visualizar a análise de faturamento por SKU.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground font-medium">Período:</label>
          <select value={filterDias} onChange={e => setFilterDias(parseInt(e.target.value))} className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs">
            <option value={7}>Últimos 7 dias</option>
            <option value={15}>Últimos 15 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={60}>Últimos 60 dias</option>
            <option value={90}>Últimos 90 dias</option>
            <option value={0}>Todo o período</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground font-medium">Conta:</label>
          <select value={filterConta} onChange={e => setFilterConta(e.target.value)} className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs">
            <option value="all">Todas as Contas</option>
            {contas.map(c => <option key={c} value={c}>{c.length > 35 ? c.slice(0, 32) + '...' : c}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground font-medium">Canal:</label>
          <div className="flex rounded-lg overflow-hidden border border-border text-xs">
            {(['all', 'varejo', 'atacado'] as const).map(v => (
              <button key={v} onClick={() => setFilterCanal(v)}
                className={`px-3 py-1.5 capitalize transition-colors ${filterCanal === v ? 'bg-indigo-600 text-white' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
                {v === 'all' ? 'Todos' : v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <span className="text-xs text-muted-foreground ml-auto">
          {vendas.length.toLocaleString('pt-BR')} linhas | {skuTable.length} SKUs {hasPrev && '| comparando com período anterior'}
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-bl-full" />
          <DollarSign className="w-5 h-5 text-indigo-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Faturamento Bruto</p>
          <p className="text-xl font-bold text-foreground mt-1">{formatBRL(totalFat)}</p>
          {hasPrev && <div className="mt-1"><DeltaArrow current={totalFat} previous={prevFat} /></div>}
        </div>
        <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-bl-full" />
          <TrendingUp className="w-5 h-5 text-emerald-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Lucro Líquido</p>
          <p className={`text-xl font-bold mt-1 ${totalLiq >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatBRL(totalLiq)}</p>
          {hasPrev && <div className="mt-1"><DeltaArrow current={totalLiq} previous={prevLiq} /></div>}
        </div>
        <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-cyan-500/10 to-transparent rounded-bl-full" />
          <Percent className="w-5 h-5 text-cyan-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Margem Média</p>
          <p className={`text-xl font-bold mt-1 ${margem >= 15 ? 'text-emerald-400' : margem >= 5 ? 'text-amber-400' : 'text-red-400'}`}>{margem.toFixed(1)}%</p>
          {hasPrev && <div className="mt-1"><DeltaArrow current={margem} previous={prevMargem} /></div>}
        </div>
        <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-bl-full" />
          <Target className="w-5 h-5 text-amber-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ticket Médio</p>
          <p className="text-xl font-bold text-foreground mt-1">{formatBRL(ticket)}</p>
        </div>
        <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-purple-500/10 to-transparent rounded-bl-full" />
          <Users className="w-5 h-5 text-purple-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Unidades Vendidas</p>
          <p className="text-xl font-bold text-foreground mt-1">{totalQtd.toLocaleString('pt-BR')}</p>
        </div>
      </div>

      {/* Chart 1: Stacked Area — Faturamento por Conta */}
      {stackedAreaData.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4 md:p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            📊 Faturamento por Conta — Evolução Diária (Área Empilhada)
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={stackedAreaData}>
              <defs>
                {contasNoChart.map((c, i) => (
                  <linearGradient key={c} id={`grad${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.7} />
                    <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.1} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
              <Tooltip formatter={(v: number, name: string) => [formatBRL(v), name.length > 30 ? name.slice(0, 27) + '...' : name]} />
              <Legend formatter={(v) => v.length > 30 ? v.slice(0, 27) + '...' : v} />
              {contasNoChart.map((c, i) => (
                <Area
                  key={c}
                  type="monotone"
                  dataKey={c}
                  stackId="1"
                  stroke={COLORS[i % COLORS.length]}
                  fill={`url(#grad${i})`}
                  strokeWidth={1.5}
                  name={c}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Chart 2: Bar + Line — Faturamento diário + Margem% */}
      {fatMargemDia.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4 md:p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            💰 Faturamento Bruto × Margem Diária
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={fatMargemDia}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} unit="%" domain={[0, 60]} />
              <Tooltip formatter={(v: number, name: string) => name === 'Faturamento Bruto' ? formatBRL(v) : `${v}%`} labelFormatter={(l) => `Data: ${l}`} />
              <Legend />
              <Bar yAxisId="left" dataKey="faturamento" fill="#6366f1" name="Faturamento Bruto" radius={[4, 4, 0, 0]} opacity={0.85} />
              <Line yAxisId="right" type="monotone" dataKey="pctMargem" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 4, fill: '#22c55e' }} name="Margem %">
                <LabelList dataKey="pctMargem" position="top" formatter={(v: number) => `${v}%`} fill="#22c55e" fontSize={10} fontWeight={700} />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Chart 3: Scatter — QTDE vs Ticket Médio (bubble = Margem%) */}
      {scatterData.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4 md:p-6">
          <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
            🔵 Análise de Dispersão por SKU
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Eixo X = Quantidade vendida · Eixo Y = Ticket Médio · Tamanho = Faturamento · Cor = Margem (verde ≥15%, laranja ≥5%, vermelho &lt;5%)
          </p>
          <ResponsiveContainer width="100%" height={380}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" dataKey="x" name="QTDE" tick={{ fontSize: 10 }} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)} />
              <YAxis type="number" dataKey="y" name="Ticket Médio" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `R$${(v).toFixed(0)}`} />
              <ZAxis type="number" dataKey="faturamento" range={[60, 1200]} />
              <Tooltip content={<CustomScatterTooltip />} />
              <Scatter
                data={scatterData}
                fill="#6366f1"
                shape={(props: any) => {
                  const { cx, cy, r } = props;
                  const margem = props.payload?.z ?? 0;
                  const color = margem >= 15 ? '#22c55e' : margem >= 5 ? '#f59e0b' : '#ef4444';
                  return <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={0.65} stroke={color} strokeWidth={1.5} />;
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* SKU Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-indigo-400" />
            Lucratividade por SKU
          </h3>
        </div>
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/95 backdrop-blur-sm z-10">
              <tr>
                {[
                  ['sku', 'SKU Princ.'],
                  ['faturamento', 'Valor Pedido'],
                  ['qtd', 'QTDE'],
                  ['qtdDia', 'Qtd/Dia'],
                  ['liquido', 'Líquido'],
                  ['margem', 'Margem %'],
                  ['ticket', 'Ticket Médio'],
                  ['pctAds', '% Ads'],
                  ['pctDev', '% Devolv.'],
                ].map(([field, label]) => (
                  <th key={field}
                    className="text-left py-3 px-3 text-muted-foreground font-medium cursor-pointer hover:text-foreground whitespace-nowrap"
                    onClick={() => toggleSort(field)}>
                    {label} <ArrowUpDown className="w-3 h-3 inline" />
                  </th>
                ))}
                <th className="py-3 px-3 text-muted-foreground font-medium">Δ</th>
              </tr>
            </thead>
            <tbody>
              {skuTable.map((row, i) => (
                <tr key={i} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                  <td className="py-2.5 px-3 font-medium text-foreground max-w-[140px] truncate" title={row.sku}>{row.sku}</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-foreground">{formatBRL(row.faturamento)}</td>
                  <td className="py-2.5 px-3 text-right">{row.qtd.toLocaleString('pt-BR')}</td>
                  <td className="py-2.5 px-3 text-right">{row.qtdDia.toFixed(1)}</td>
                  <td className={`py-2.5 px-3 text-right font-semibold ${row.liquido >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatBRL(row.liquido)}</td>
                  <td className="py-2.5 px-3 text-right font-semibold" style={{ color: row.margem >= 15 ? '#22c55e' : row.margem >= 5 ? '#f59e0b' : '#ef4444' }}>{row.margem.toFixed(2)}%</td>
                  <td className="py-2.5 px-3 text-right">{formatBRL(row.ticket)}</td>
                  <td className="py-2.5 px-3 text-right font-semibold" style={{ color: row.pctAds <= 5 ? '#22c55e' : row.pctAds <= 10 ? '#f59e0b' : '#ef4444' }}>{row.pctAds.toFixed(2)}%</td>
                  <td className="py-2.5 px-3 text-right" style={{ color: row.pctDev > 10 ? '#ef4444' : '' }}>{row.pctDev.toFixed(1)}%</td>
                  <td className="py-2.5 px-3 text-right">{hasPrev && <DeltaArrow current={row.margem} previous={row.prevMargem} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
