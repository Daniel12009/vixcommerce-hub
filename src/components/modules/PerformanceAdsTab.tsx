import { useMemo, useState } from 'react';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import { formatBRL } from '@/lib/utils-vix';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#8b5cf6'];

function parseDate(d: string): Date | null {
  if (!d) return null;
  const parts = d.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (parts) return new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]));
  const iso = new Date(d);
  return !isNaN(iso.getTime()) ? iso : null;
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

  // KPI Aggregations
  const totalInvestimento = useMemo(() => Math.round(ads.reduce((s, a) => s + a.investimento, 0)), [ads]);
  const totalReceita = useMemo(() => Math.round(ads.reduce((s, a) => s + a.receita, 0)), [ads]);
  const totalVendas = useMemo(() => ads.reduce((s, a) => s + a.vendasQtd, 0), [ads]);
  const totalCliques = useMemo(() => ads.reduce((s, a) => s + a.cliques, 0), [ads]);
  const totalImpressoes = useMemo(() => ads.reduce((s, a) => s + a.impressoes, 0), [ads]);
  const roasGeral = totalInvestimento > 0 ? (totalReceita / totalInvestimento).toFixed(2) : '0';
  const acosGeral = totalReceita > 0 ? ((totalInvestimento / totalReceita) * 100).toFixed(1) : '0';

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

  // Campaign table data (full list)
  const campanhaTable = useMemo(() => {
    const map = new Map<string, { campanha: string; investimento: number; receita: number; vendas: number; cliques: number; impressoes: number; roas: number; acos: number }>();
    ads.forEach(a => {
      const key = a.campanha || a.idCampanha || 'N/A';
      const cur = map.get(key) || { campanha: key, investimento: 0, receita: 0, vendas: 0, cliques: 0, impressoes: 0, roas: 0, acos: 0 };
      cur.investimento += a.investimento;
      cur.receita += a.receita;
      cur.vendas += a.vendasQtd;
      cur.cliques += a.cliques;
      cur.impressoes += a.impressoes;
      map.set(key, cur);
    });
    return [...map.values()]
      .map(x => ({
        ...x,
        investimento: Math.round(x.investimento * 100) / 100,
        receita: Math.round(x.receita * 100) / 100,
        roas: x.investimento > 0 ? parseFloat((x.receita / x.investimento).toFixed(2)) : 0,
        acos: x.receita > 0 ? parseFloat(((x.investimento / x.receita) * 100).toFixed(1)) : 0,
        ctr: x.impressoes > 0 ? parseFloat(((x.cliques / x.impressoes) * 100).toFixed(2)) : 0,
        cpc: x.cliques > 0 ? parseFloat((x.investimento / x.cliques).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.investimento - a.investimento);
  }, [ads]);

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
        <span className="text-xs text-muted-foreground ml-auto">{ads.length} registros ADS</span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">Investimento</p>
          <p className="text-lg font-bold text-[hsl(var(--vix-danger))]">{formatBRL(totalInvestimento)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">Receita</p>
          <p className="text-lg font-bold text-[hsl(var(--vix-success))]">{formatBRL(totalReceita)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">Vendas</p>
          <p className="text-lg font-bold text-foreground">{totalVendas}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">ROAS</p>
          <p className="text-lg font-bold text-[hsl(var(--primary))]">{roasGeral}x</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">ACOS</p>
          <p className="text-lg font-bold text-[hsl(var(--vix-warning))]">{acosGeral}%</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">Cliques</p>
          <p className="text-lg font-bold text-foreground">{totalCliques.toLocaleString('pt-BR')}</p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Investimento vs Receita por Conta */}
        {investReceitaPorConta.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
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
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
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
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
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
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
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
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
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
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
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

      {/* Campaign Table */}
      {campanhaTable.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
          <h3 className="text-foreground font-semibold mb-4">📋 Lista de Campanhas</h3>
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
                    <td className="py-2 px-2 text-right text-[hsl(var(--vix-danger))]">{formatBRL(row.investimento)}</td>
                    <td className="py-2 px-2 text-right text-[hsl(var(--vix-success))]">{formatBRL(row.receita)}</td>
                    <td className="py-2 px-2 text-right">{row.vendas}</td>
                    <td className="py-2 px-2 text-right font-semibold" style={{ color: row.roas >= 3 ? 'hsl(var(--vix-success))' : row.roas >= 1 ? 'hsl(var(--vix-warning))' : 'hsl(var(--vix-danger))' }}>{row.roas}x</td>
                    <td className="py-2 px-2 text-right" style={{ color: row.acos <= 15 ? 'hsl(var(--vix-success))' : row.acos <= 30 ? 'hsl(var(--vix-warning))' : 'hsl(var(--vix-danger))' }}>{row.acos}%</td>
                    <td className="py-2 px-2 text-right">{row.cliques.toLocaleString('pt-BR')}</td>
                    <td className="py-2 px-2 text-right">{row.impressoes.toLocaleString('pt-BR')}</td>
                    <td className="py-2 px-2 text-right">{row.ctr}%</td>
                    <td className="py-2 px-2 text-right">{formatBRL(row.cpc)}</td>
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
