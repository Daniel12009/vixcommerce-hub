import { useMemo, useState } from 'react';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import { formatBRL } from '@/lib/utils-vix';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#8b5cf6'];

function parseDate(d: string): Date | null {
  if (!d) return null;
  const parts = d.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (parts) return new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]));
  const iso = new Date(d);
  return !isNaN(iso.getTime()) ? iso : null;
}

// Delta arrow component
function Delta({ current, previous, invert, format }: { current: number; previous: number; invert?: boolean; format?: 'brl' | 'pct' | 'number' | 'x' }) {
  if (previous === 0 && current === 0) return <Minus className="w-3 h-3 text-muted-foreground inline" />;
  if (previous === 0) return <TrendingUp className="w-3 h-3 text-emerald-500 inline" />;

  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const isUp = pct > 0;
  const isDown = pct < 0;
  const isSame = Math.abs(pct) < 0.5;

  // For metrics like ACOS/CPC, going UP is bad (invert)
  const goodUp = invert ? !isUp : isUp;

  if (isSame) return <Minus className="w-3 h-3 text-muted-foreground inline" />;

  const Icon = isUp ? TrendingUp : TrendingDown;
  const color = goodUp ? 'text-emerald-500' : 'text-red-500';

  let label = `${Math.abs(pct).toFixed(0)}%`;
  if (format === 'brl') {
    const diff = Math.abs(current - previous);
    label = diff > 1000 ? `${(diff / 1000).toFixed(1)}k` : formatBRL(diff).replace('R$ ', '');
  }

  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${color}`} title={`Anterior: ${format === 'brl' ? formatBRL(previous) : format === 'pct' ? previous.toFixed(1) + '%' : format === 'x' ? previous.toFixed(2) + 'x' : previous.toLocaleString('pt-BR')}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

export function PerformanceAdsTab() {
  const sheetsData = useSheetsData();
  const allAds = sheetsData.adsItems || [];

  // Filters
  const [filterConta, setFilterConta] = useState('all');
  const [filterDias, setFilterDias] = useState(30);

  const contas = useMemo(() => {
    return [...new Set(allAds.map(a => a.conta).filter(Boolean))].sort();
  }, [allAds]);

  // Current period items
  const ads = useMemo(() => {
    let items = allAds;
    if (filterConta !== 'all') {
      items = items.filter(a => a.conta.toLowerCase().includes(filterConta.toLowerCase()));
    }
    if (filterDias > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - filterDias);
      items = items.filter(a => {
        const d = parseDate(a.dataRef);
        if (!d) return true;
        return d >= cutoff;
      });
    }
    return items;
  }, [allAds, filterConta, filterDias]);

  // Previous period items (same duration, shifted back)
  const prevAds = useMemo(() => {
    if (filterDias <= 0) return [];
    let items = allAds;
    if (filterConta !== 'all') {
      items = items.filter(a => a.conta.toLowerCase().includes(filterConta.toLowerCase()));
    }
    const now = new Date();
    const cutoffCurrent = new Date();
    cutoffCurrent.setDate(now.getDate() - filterDias);
    const cutoffPrev = new Date();
    cutoffPrev.setDate(now.getDate() - filterDias * 2);
    return items.filter(a => {
      const d = parseDate(a.dataRef);
      if (!d) return false;
      return d >= cutoffPrev && d < cutoffCurrent;
    });
  }, [allAds, filterConta, filterDias]);

  // KPI Aggregations - Current
  const totalInvestimento = useMemo(() => Math.round(ads.reduce((s, a) => s + a.investimento, 0)), [ads]);
  const totalReceita = useMemo(() => Math.round(ads.reduce((s, a) => s + a.receita, 0)), [ads]);
  const totalVendas = useMemo(() => ads.reduce((s, a) => s + a.vendasQtd, 0), [ads]);
  const totalCliques = useMemo(() => ads.reduce((s, a) => s + a.cliques, 0), [ads]);
  const totalImpressoes = useMemo(() => ads.reduce((s, a) => s + a.impressoes, 0), [ads]);
  const roasGeral = totalInvestimento > 0 ? (totalReceita / totalInvestimento).toFixed(2) : '0';
  const acosGeral = totalReceita > 0 ? ((totalInvestimento / totalReceita) * 100).toFixed(1) : '0';

  // KPI Aggregations - Previous
  const prevInvestimento = useMemo(() => Math.round(prevAds.reduce((s, a) => s + a.investimento, 0)), [prevAds]);
  const prevReceita = useMemo(() => Math.round(prevAds.reduce((s, a) => s + a.receita, 0)), [prevAds]);
  const prevVendas = useMemo(() => prevAds.reduce((s, a) => s + a.vendasQtd, 0), [prevAds]);
  const prevCliques = useMemo(() => prevAds.reduce((s, a) => s + a.cliques, 0), [prevAds]);
  const prevRoas = prevInvestimento > 0 ? prevReceita / prevInvestimento : 0;
  const prevAcos = prevReceita > 0 ? (prevInvestimento / prevReceita) * 100 : 0;

  // 1. Investimento vs Receita por Conta
  const investReceitaPorConta = useMemo(() => {
    const map = new Map<string, { conta: string; investimento: number; receita: number }>();
    ads.forEach(a => {
      const c = a.conta || 'Outros';
      const cur = map.get(c) || { conta: c, investimento: 0, receita: 0 };
      cur.investimento += a.investimento;
      cur.receita += a.receita;
      map.set(c, cur);
    });
    return [...map.values()]
      .map(x => ({ ...x, investimento: Math.round(x.investimento), receita: Math.round(x.receita) }))
      .sort((a, b) => b.receita - a.receita);
  }, [ads]);

  // 2. Top Campanhas por ROAS
  const topCampanhasRoas = useMemo(() => {
    const map = new Map<string, { campanha: string; investimento: number; receita: number; vendas: number }>();
    ads.forEach(a => {
      const key = a.campanha || a.idCampanha || 'N/A';
      const cur = map.get(key) || { campanha: key, investimento: 0, receita: 0, vendas: 0 };
      cur.investimento += a.investimento;
      cur.receita += a.receita;
      cur.vendas += a.vendasQtd;
      map.set(key, cur);
    });
    return [...map.values()]
      .map(x => ({ ...x, roas: x.investimento > 0 ? parseFloat((x.receita / x.investimento).toFixed(2)) : 0 }))
      .sort((a, b) => b.roas - a.roas)
      .slice(0, 10);
  }, [ads]);

  // 3. Top Campanhas por Investimento (changed from ad titles to campaign names)
  const topCampanhasInvestimento = useMemo(() => {
    const map = new Map<string, { campanha: string; investimento: number; receita: number; vendas: number; cliques: number }>();
    ads.forEach(a => {
      const key = a.campanha || a.idCampanha || 'N/A';
      const cur = map.get(key) || { campanha: key, investimento: 0, receita: 0, vendas: 0, cliques: 0 };
      cur.investimento += a.investimento;
      cur.receita += a.receita;
      cur.vendas += a.vendasQtd;
      cur.cliques += a.cliques;
      map.set(key, cur);
    });
    return [...map.values()]
      .map(x => ({ ...x, investimento: Math.round(x.investimento), receita: Math.round(x.receita) }))
      .sort((a, b) => b.investimento - a.investimento)
      .slice(0, 10);
  }, [ads]);

  // 4. Cliques vs Impressões por Conta
  const cliquesImpressoesPorConta = useMemo(() => {
    const map = new Map<string, { conta: string; cliques: number; impressoes: number }>();
    ads.forEach(a => {
      const c = a.conta || 'Outros';
      const cur = map.get(c) || { conta: c, cliques: 0, impressoes: 0 };
      cur.cliques += a.cliques;
      cur.impressoes += a.impressoes;
      map.set(c, cur);
    });
    return [...map.values()].sort((a, b) => b.cliques - a.cliques);
  }, [ads]);

  // 5. Investimento por Tipo (Pie)
  const investimentoPorTipo = useMemo(() => {
    const map = new Map<string, { tipo: string; value: number }>();
    ads.forEach(a => {
      const t = a.tipo || 'Outros';
      const cur = map.get(t) || { tipo: t, value: 0 };
      cur.value += a.investimento;
      map.set(t, cur);
    });
    return [...map.values()].map(x => ({ ...x, value: Math.round(x.value) }));
  }, [ads]);

  // 6. Piores ACOS
  const pioresAcos = useMemo(() => {
    const map = new Map<string, { campanha: string; investimento: number; receita: number }>();
    ads.forEach(a => {
      const key = a.campanha || a.idCampanha || 'N/A';
      const cur = map.get(key) || { campanha: key, investimento: 0, receita: 0 };
      cur.investimento += a.investimento;
      cur.receita += a.receita;
      map.set(key, cur);
    });
    return [...map.values()]
      .filter(x => x.receita > 0)
      .map(x => ({ ...x, acos: parseFloat(((x.investimento / x.receita) * 100).toFixed(1)) }))
      .sort((a, b) => b.acos - a.acos)
      .slice(0, 10);
  }, [ads]);

  // Campaign table data (full list) - Current + Previous for comparison
  const campanhaTable = useMemo(() => {
    // Current period
    const mapCur = new Map<string, { campanha: string; investimento: number; receita: number; vendas: number; cliques: number; impressoes: number }>();
    ads.forEach(a => {
      const key = a.campanha || a.idCampanha || 'N/A';
      const cur = mapCur.get(key) || { campanha: key, investimento: 0, receita: 0, vendas: 0, cliques: 0, impressoes: 0 };
      cur.investimento += a.investimento;
      cur.receita += a.receita;
      cur.vendas += a.vendasQtd;
      cur.cliques += a.cliques;
      cur.impressoes += a.impressoes;
      mapCur.set(key, cur);
    });

    // Previous period
    const mapPrev = new Map<string, { investimento: number; receita: number; vendas: number; cliques: number; impressoes: number }>();
    prevAds.forEach(a => {
      const key = a.campanha || a.idCampanha || 'N/A';
      const cur = mapPrev.get(key) || { investimento: 0, receita: 0, vendas: 0, cliques: 0, impressoes: 0 };
      cur.investimento += a.investimento;
      cur.receita += a.receita;
      cur.vendas += a.vendasQtd;
      cur.cliques += a.cliques;
      cur.impressoes += a.impressoes;
      mapPrev.set(key, cur);
    });

    return [...mapCur.values()]
      .map(x => {
        const prev = mapPrev.get(x.campanha) || { investimento: 0, receita: 0, vendas: 0, cliques: 0, impressoes: 0 };
        const roas = x.investimento > 0 ? parseFloat((x.receita / x.investimento).toFixed(2)) : 0;
        const acos = x.receita > 0 ? parseFloat(((x.investimento / x.receita) * 100).toFixed(1)) : 0;
        const ctr = x.impressoes > 0 ? parseFloat(((x.cliques / x.impressoes) * 100).toFixed(2)) : 0;
        const cpc = x.cliques > 0 ? parseFloat((x.investimento / x.cliques).toFixed(2)) : 0;
        const prevRoas = prev.investimento > 0 ? prev.receita / prev.investimento : 0;
        const prevAcos = prev.receita > 0 ? (prev.investimento / prev.receita) * 100 : 0;
        const prevCtr = prev.impressoes > 0 ? (prev.cliques / prev.impressoes) * 100 : 0;
        const prevCpc = prev.cliques > 0 ? prev.investimento / prev.cliques : 0;
        return {
          ...x,
          investimento: Math.round(x.investimento * 100) / 100,
          receita: Math.round(x.receita * 100) / 100,
          roas, acos, ctr, cpc,
          prev: {
            investimento: Math.round(prev.investimento * 100) / 100,
            receita: Math.round(prev.receita * 100) / 100,
            vendas: prev.vendas,
            cliques: prev.cliques,
            impressoes: prev.impressoes,
            roas: prevRoas, acos: prevAcos, ctr: prevCtr, cpc: prevCpc,
          },
        };
      })
      .sort((a, b) => b.investimento - a.investimento);
  }, [ads, prevAds]);

  const hasPrevData = prevAds.length > 0;

  if (allAds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-muted-foreground text-sm mb-2">📊 Nenhum dado de ADS importado ainda.</p>
        <p className="text-muted-foreground text-xs">Configure uma fonte com destino "Performance ADS" na aba Planilhas Google.</p>
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
            {contas.map(c => (<option key={c} value={c}>{c}</option>))}
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
        <span className="text-xs text-muted-foreground ml-auto">{ads.length} registros ADS {hasPrevData && `| ${prevAds.length} período anterior`}</span>
      </div>

      {/* KPI Cards with Delta */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">Investimento</p>
          <p className="text-lg font-bold text-[hsl(var(--vix-danger))]">{formatBRL(totalInvestimento)}</p>
          {hasPrevData && <Delta current={totalInvestimento} previous={prevInvestimento} invert format="brl" />}
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">Receita</p>
          <p className="text-lg font-bold text-[hsl(var(--vix-success))]">{formatBRL(totalReceita)}</p>
          {hasPrevData && <Delta current={totalReceita} previous={prevReceita} format="brl" />}
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">Vendas</p>
          <p className="text-lg font-bold text-foreground">{totalVendas}</p>
          {hasPrevData && <Delta current={totalVendas} previous={prevVendas} format="number" />}
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">ROAS</p>
          <p className="text-lg font-bold text-[hsl(var(--primary))]">{roasGeral}x</p>
          {hasPrevData && <Delta current={parseFloat(roasGeral)} previous={prevRoas} format="x" />}
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">ACOS</p>
          <p className="text-lg font-bold text-[hsl(var(--vix-warning))]">{acosGeral}%</p>
          {hasPrevData && <Delta current={parseFloat(acosGeral)} previous={prevAcos} invert format="pct" />}
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">Cliques</p>
          <p className="text-lg font-bold text-foreground">{totalCliques.toLocaleString('pt-BR')}</p>
          {hasPrevData && <Delta current={totalCliques} previous={prevCliques} format="number" />}
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Investimento vs Receita por Conta */}
        {investReceitaPorConta.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 animate-fade-in">
            <h3 className="text-foreground font-semibold mb-4">💰 Investimento vs Receita por Conta</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={investReceitaPorConta}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="conta" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Legend />
                <Bar dataKey="investimento" fill="#ef4444" name="Investimento" radius={[4, 4, 0, 0]} />
                <Bar dataKey="receita" fill="#22c55e" name="Receita" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 2. Top Campanhas por ROAS */}
        {topCampanhasRoas.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 animate-fade-in">
            <h3 className="text-foreground font-semibold mb-4">🏆 Top Campanhas por ROAS</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topCampanhasRoas} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="campanha" type="category" tick={{ fontSize: 9 }} width={120} />
                <Tooltip formatter={(v: number) => v.toFixed(2)} />
                <Bar dataKey="roas" fill="#6366f1" name="ROAS" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 3. Top Campanhas por Investimento (campaign name, not ad title) */}
        {topCampanhasInvestimento.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 animate-fade-in">
            <h3 className="text-foreground font-semibold mb-4">📈 Top Campanhas por Investimento</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topCampanhasInvestimento} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="campanha" type="category" tick={{ fontSize: 8 }} width={150} />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Legend />
                <Bar dataKey="investimento" fill="#ef4444" name="Investimento" radius={[0, 4, 4, 0]} />
                <Bar dataKey="receita" fill="#22c55e" name="Receita" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 4. Cliques vs Impressões por Conta */}
        {cliquesImpressoesPorConta.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 animate-fade-in">
            <h3 className="text-foreground font-semibold mb-4">👆 Cliques vs Impressões por Conta</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={cliquesImpressoesPorConta}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="conta" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="cliques" fill="#3b82f6" name="Cliques" radius={[4, 4, 0, 0]} />
                <Bar dataKey="impressoes" fill="#f59e0b" name="Impressões" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 5. Investimento por Tipo (Pie) */}
        {investimentoPorTipo.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 animate-fade-in">
            <h3 className="text-foreground font-semibold mb-4">🎯 Investimento por Tipo</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={investimentoPorTipo} dataKey="value" nameKey="tipo" cx="50%" cy="50%" outerRadius={90} label={({ tipo, value }: any) => `${tipo}: ${formatBRL(value)}`}>
                  {investimentoPorTipo.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatBRL(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 6. Piores ACOS */}
        {pioresAcos.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 animate-fade-in">
            <h3 className="text-foreground font-semibold mb-4">⚠️ Piores ACOS (Campanhas)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={pioresAcos} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 10 }} unit="%" />
                <YAxis dataKey="campanha" type="category" tick={{ fontSize: 9 }} width={120} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Bar dataKey="acos" fill="#ef4444" name="ACOS %" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Campaign Table with Delta Arrows */}
      {campanhaTable.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 md:p-6 animate-fade-in">
          <h3 className="text-foreground font-semibold mb-4">📋 Lista de Campanhas {hasPrevData && <span className="text-xs font-normal text-muted-foreground ml-2">comparando com período anterior</span>}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">Campanha</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium">Investimento</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium">Receita</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium">Vendas</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium">ROAS</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium">ACOS %</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium">Cliques</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium">Impressões</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium">CTR %</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium">CPC</th>
                </tr>
              </thead>
              <tbody>
                {campanhaTable.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-2 px-2 text-foreground font-medium max-w-[200px] truncate" title={row.campanha}>{row.campanha}</td>
                    <td className="py-2 px-2 text-right text-[hsl(var(--vix-danger))]">
                      {formatBRL(row.investimento)}
                      {hasPrevData && <div><Delta current={row.investimento} previous={row.prev.investimento} invert format="brl" /></div>}
                    </td>
                    <td className="py-2 px-2 text-right text-[hsl(var(--vix-success))]">
                      {formatBRL(row.receita)}
                      {hasPrevData && <div><Delta current={row.receita} previous={row.prev.receita} format="brl" /></div>}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {row.vendas}
                      {hasPrevData && <div><Delta current={row.vendas} previous={row.prev.vendas} format="number" /></div>}
                    </td>
                    <td className="py-2 px-2 text-right font-semibold" style={{ color: row.roas >= 3 ? 'hsl(var(--vix-success))' : row.roas >= 1 ? 'hsl(var(--vix-warning))' : 'hsl(var(--vix-danger))' }}>
                      {row.roas}x
                      {hasPrevData && <div><Delta current={row.roas} previous={row.prev.roas} format="x" /></div>}
                    </td>
                    <td className="py-2 px-2 text-right" style={{ color: row.acos <= 15 ? 'hsl(var(--vix-success))' : row.acos <= 30 ? 'hsl(var(--vix-warning))' : 'hsl(var(--vix-danger))' }}>
                      {row.acos}%
                      {hasPrevData && <div><Delta current={row.acos} previous={row.prev.acos} invert format="pct" /></div>}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {row.cliques.toLocaleString('pt-BR')}
                      {hasPrevData && <div><Delta current={row.cliques} previous={row.prev.cliques} format="number" /></div>}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {row.impressoes.toLocaleString('pt-BR')}
                      {hasPrevData && <div><Delta current={row.impressoes} previous={row.prev.impressoes} format="number" /></div>}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {row.ctr}%
                      {hasPrevData && <div><Delta current={row.ctr} previous={row.prev.ctr} format="pct" /></div>}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {formatBRL(row.cpc)}
                      {hasPrevData && <div><Delta current={row.cpc} previous={row.prev.cpc} invert format="brl" /></div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
