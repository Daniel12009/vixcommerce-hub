import { useMemo, useState } from 'react';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import { formatBRL } from '@/lib/utils-vix';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, ComposedChart, Area,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, DollarSign, BarChart2, Percent, Target, ArrowUpDown } from 'lucide-react';

const ACCOUNT_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6',
  '#ec4899', '#14b8a6', '#8b5cf6', '#f97316', '#06b6d4',
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

type SortField = 'faturamentoBruto' | 'lucroLiquidoDia' | 'pctAds' | 'origem';

export function MarketplaceTab() {
  const sheetsData = useSheetsData();
  const allItems = sheetsData.marketplaceDiaItems || [];

  const [filterDias, setFilterDias] = useState(30);
  const [sortField, setSortField] = useState<SortField>('faturamentoBruto');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Filter items by date range
  const items = useMemo(() => {
    if (filterDias <= 0) return allItems;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - filterDias);
    return allItems.filter(item => {
      const d = parseDate(item.data);
      return d ? d >= cutoff : true;
    });
  }, [allItems, filterDias]);

  // Previous period items
  const prevItems = useMemo(() => {
    if (filterDias <= 0) return [];
    const now = new Date();
    const cutoffCurrent = new Date();
    cutoffCurrent.setDate(now.getDate() - filterDias);
    const cutoffPrev = new Date();
    cutoffPrev.setDate(now.getDate() - filterDias * 2);
    return allItems.filter(item => {
      const d = parseDate(item.data);
      return d ? d >= cutoffPrev && d < cutoffCurrent : false;
    });
  }, [allItems, filterDias]);

  const hasPrev = prevItems.length > 0;

  // Unique origins (accounts)
  const origens = useMemo(() => [...new Set(items.map(i => i.origem).filter(Boolean))].sort(), [items]);

  // KPIs
  const totalFaturamento = useMemo(() => items.reduce((s, i) => s + i.faturamentoBruto, 0), [items]);
  const totalLucro = useMemo(() => items.reduce((s, i) => s + i.lucroLiquidoDia, 0), [items]);
  const totalAds = useMemo(() => items.reduce((s, i) => s + i.ads, 0), [items]);
  const avgPctAds = totalFaturamento > 0 ? (totalAds / totalFaturamento) * 100 : 0;
  const avgRoas = useMemo(() => {
    const totalAdsVal = items.reduce((s, i) => s + i.ads, 0);
    const totalRec = items.reduce((s, i) => s + i.faturamentoBruto, 0);
    return totalAdsVal > 0 ? totalRec / totalAdsVal : 0;
  }, [items]);

  // Previous KPIs
  const prevFaturamento = prevItems.reduce((s, i) => s + i.faturamentoBruto, 0);
  const prevLucro = prevItems.reduce((s, i) => s + i.lucroLiquidoDia, 0);
  const prevAdsTotal = prevItems.reduce((s, i) => s + i.ads, 0);
  const prevPctAds = prevFaturamento > 0 ? (prevAdsTotal / prevFaturamento) * 100 : 0;

  // Table: aggregate by Origem
  const origemTable = useMemo(() => {
    const mapCur = new Map<string, { origem: string; faturamentoBruto: number; lucroLiquidoDia: number; ads: number; pedidos: number }>();
    items.forEach(i => {
      const cur = mapCur.get(i.origem) || { origem: i.origem, faturamentoBruto: 0, lucroLiquidoDia: 0, ads: 0, pedidos: 0 };
      cur.faturamentoBruto += i.faturamentoBruto;
      cur.lucroLiquidoDia += i.lucroLiquidoDia;
      cur.ads += i.ads;
      cur.pedidos += i.numeroPedidos;
      mapCur.set(i.origem, cur);
    });
    const mapPrev = new Map<string, { faturamentoBruto: number; lucroLiquidoDia: number; ads: number }>();
    prevItems.forEach(i => {
      const cur = mapPrev.get(i.origem) || { faturamentoBruto: 0, lucroLiquidoDia: 0, ads: 0 };
      cur.faturamentoBruto += i.faturamentoBruto;
      cur.lucroLiquidoDia += i.lucroLiquidoDia;
      cur.ads += i.ads;
      mapPrev.set(i.origem, cur);
    });
    return [...mapCur.values()]
      .map(x => ({
        ...x,
        pctAds: x.faturamentoBruto > 0 ? (x.ads / x.faturamentoBruto) * 100 : 0,
        prev: mapPrev.get(x.origem) || { faturamentoBruto: 0, lucroLiquidoDia: 0, ads: 0 },
      }))
      .sort((a, b) => {
        const dir = sortDirection === 'desc' ? -1 : 1;
        if (sortField === 'origem') return dir * a.origem.localeCompare(b.origem);
        return dir * ((a as any)[sortField] - (b as any)[sortField]);
      });
  }, [items, prevItems, sortField, sortDirection]);

  // Chart 1: %ADS per day per account (LineChart multi-series)
  const adsPerDayByAccount = useMemo(() => {
    const dateMap = new Map<string, Record<string, number>>();
    items.forEach(i => {
      const dateKey = formatDateShort(i.data);
      const row = dateMap.get(dateKey) || {};
      if (i.faturamentoBruto > 0) {
        // Accumulate weighted ADS
        row[`ads_${i.origem}`] = (row[`ads_${i.origem}`] || 0) + i.ads;
        row[`fat_${i.origem}`] = (row[`fat_${i.origem}`] || 0) + i.faturamentoBruto;
      }
      dateMap.set(dateKey, row);
    });

    // Sort by date
    const sortedDates = [...dateMap.keys()].sort((a, b) => {
      const [da, ma] = a.split('/').map(Number);
      const [db, mb] = b.split('/').map(Number);
      return (ma * 100 + da) - (mb * 100 + db);
    });

    return sortedDates.map(dateKey => {
      const row = dateMap.get(dateKey)!;
      const result: any = { date: dateKey };
      origens.forEach(origem => {
        const ads = row[`ads_${origem}`] || 0;
        const fat = row[`fat_${origem}`] || 0;
        result[origem] = fat > 0 ? parseFloat(((ads / fat) * 100).toFixed(1)) : 0;
      });
      return result;
    });
  }, [items, origens]);

  // Chart 2: Faturamento Bruto (bars) + % Lucro Líquido (line) per day
  const fatMargemPerDay = useMemo(() => {
    const dateMap = new Map<string, { faturamento: number; lucro: number }>();
    items.forEach(i => {
      const dateKey = formatDateShort(i.data);
      const row = dateMap.get(dateKey) || { faturamento: 0, lucro: 0 };
      row.faturamento += i.faturamentoBruto;
      row.lucro += i.lucroLiquidoDia;
      dateMap.set(dateKey, row);
    });

    const sortedDates = [...dateMap.keys()].sort((a, b) => {
      const [da, ma] = a.split('/').map(Number);
      const [db, mb] = b.split('/').map(Number);
      return (ma * 100 + da) - (mb * 100 + db);
    });

    return sortedDates.map(dateKey => {
      const row = dateMap.get(dateKey)!;
      const pctLucro = row.faturamento > 0 ? parseFloat(((row.lucro / row.faturamento) * 100).toFixed(1)) : 0;
      return {
        date: dateKey,
        faturamento: Math.round(row.faturamento),
        pctLucro,
      };
    });
  }, [items]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }

  // Empty state
  if (allItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-500/10 to-indigo-500/10 mb-4">
          <BarChart2 className="w-10 h-10 text-purple-400" />
        </div>
        <h3 className="text-foreground font-semibold mb-1">Nenhum dado de Marketplace importado</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Vá em <strong>Configurações → Planilhas</strong>, adicione uma configuração com módulo
          <strong> Marketplace (Rentabilidade)</strong> e importe a aba "teste luiz ADS" da planilha.
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
        <span className="text-xs text-muted-foreground ml-auto">
          {items.length} registros | {origens.length} contas {hasPrev && `| comparando com período anterior`}
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-bl-full" />
          <DollarSign className="w-5 h-5 text-indigo-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Faturamento Bruto</p>
          <p className="text-xl font-bold text-foreground mt-1">{formatBRL(totalFaturamento)}</p>
          {hasPrev && <div className="mt-1"><DeltaArrow current={totalFaturamento} previous={prevFaturamento} /></div>}
        </div>
        <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-bl-full" />
          <TrendingUp className="w-5 h-5 text-emerald-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Lucro Líquido</p>
          <p className={`text-xl font-bold mt-1 ${totalLucro >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatBRL(totalLucro)}</p>
          {hasPrev && <div className="mt-1"><DeltaArrow current={totalLucro} previous={prevLucro} /></div>}
        </div>
        <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-bl-full" />
          <Percent className="w-5 h-5 text-amber-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">% ADS Médio</p>
          <p className="text-xl font-bold text-foreground mt-1">{avgPctAds.toFixed(1)}%</p>
          {hasPrev && <div className="mt-1"><DeltaArrow current={avgPctAds} previous={prevPctAds} invert /></div>}
        </div>
        <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-purple-500/10 to-transparent rounded-bl-full" />
          <Target className="w-5 h-5 text-purple-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">ROAS Médio</p>
          <p className="text-xl font-bold text-foreground mt-1">{avgRoas.toFixed(1)}x</p>
        </div>
      </div>

      {/* Table by Origem */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-indigo-400" />
            Resultados por Conta / Marketplace
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-left py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort('origem')}>
                  Origem <ArrowUpDown className="w-3 h-3 inline" />
                </th>
                <th className="text-right py-3 px-3 text-muted-foreground font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort('faturamentoBruto')}>
                  Faturamento Bruto <ArrowUpDown className="w-3 h-3 inline" />
                </th>
                <th className="text-right py-3 px-3 text-muted-foreground font-medium">Δ</th>
                <th className="text-right py-3 px-3 text-muted-foreground font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort('lucroLiquidoDia')}>
                  Lucro Líquido <ArrowUpDown className="w-3 h-3 inline" />
                </th>
                <th className="text-right py-3 px-3 text-muted-foreground font-medium">Δ</th>
                <th className="text-right py-3 px-3 text-muted-foreground font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort('pctAds')}>
                  % ADS <ArrowUpDown className="w-3 h-3 inline" />
                </th>
                <th className="text-right py-3 px-3 text-muted-foreground font-medium">Δ</th>
              </tr>
            </thead>
            <tbody>
              {origemTable.map((row, i) => {
                const prevPctAdsRow = row.prev.faturamentoBruto > 0 ? (row.prev.ads / row.prev.faturamentoBruto) * 100 : 0;
                return (
                  <tr key={i} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-4 font-medium text-foreground max-w-[250px] truncate" title={row.origem}>{row.origem}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-foreground">{formatBRL(row.faturamentoBruto)}</td>
                    <td className="py-2.5 px-3 text-right">
                      {hasPrev && <DeltaArrow current={row.faturamentoBruto} previous={row.prev.faturamentoBruto} />}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-semibold ${row.lucroLiquidoDia >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatBRL(row.lucroLiquidoDia)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {hasPrev && <DeltaArrow current={row.lucroLiquidoDia} previous={row.prev.lucroLiquidoDia} />}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold" style={{ color: row.pctAds <= 5 ? 'hsl(var(--vix-success))' : row.pctAds <= 10 ? 'hsl(var(--vix-warning))' : 'hsl(var(--vix-danger))' }}>
                      {row.pctAds.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {hasPrev && <DeltaArrow current={row.pctAds} previous={prevPctAdsRow} invert />}
                    </td>
                  </tr>
                );
              })}
              {/* Total row */}
              <tr className="bg-muted/30 font-bold">
                <td className="py-3 px-4 text-foreground">Total geral</td>
                <td className="py-3 px-3 text-right text-foreground">{formatBRL(totalFaturamento)}</td>
                <td className="py-3 px-3 text-right">{hasPrev && <DeltaArrow current={totalFaturamento} previous={prevFaturamento} />}</td>
                <td className={`py-3 px-3 text-right ${totalLucro >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatBRL(totalLucro)}</td>
                <td className="py-3 px-3 text-right">{hasPrev && <DeltaArrow current={totalLucro} previous={prevLucro} />}</td>
                <td className="py-3 px-3 text-right text-foreground">{avgPctAds.toFixed(2)}%</td>
                <td className="py-3 px-3 text-right">{hasPrev && <DeltaArrow current={avgPctAds} previous={prevPctAds} invert />}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6">
        {/* Chart 1: %ADS per day per account */}
        {adsPerDayByAccount.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4 md:p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              📈 % ADS por Dia por Conta
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={adsPerDayByAccount}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} unit="%" />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Legend />
                {origens.map((origem, i) => (
                  <Line
                    key={origem}
                    type="monotone"
                    dataKey={origem}
                    stroke={ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name={origem.length > 30 ? origem.slice(0, 27) + '...' : origem}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Chart 2: Faturamento Bruto + % Lucro Líquido */}
        {fatMargemPerDay.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4 md:p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              💰 Faturamento Bruto × % Lucro Líquido Dia
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={fatMargemPerDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v: number) => v > 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} unit="%" />
                <Tooltip
                  formatter={(v: number, name: string) => name === 'faturamento' ? formatBRL(v) : `${v}%`}
                  labelFormatter={(label: string) => `Data: ${label}`}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="faturamento" fill="#6366f1" name="Faturamento Bruto" radius={[4, 4, 0, 0]} opacity={0.8} />
                <Line yAxisId="right" type="monotone" dataKey="pctLucro" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4, fill: '#f59e0b' }} name="% Lucro Líquido" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
