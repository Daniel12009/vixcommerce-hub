import { useMemo, useState } from 'react';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import { normalizeConta, getContasNormalizadas, formatBRL } from '@/lib/utils-vix';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#8b5cf6'];

export function PerformanceAdsTab() {
  const sheetsData = useSheetsData();
  const allAds = sheetsData.adsItems || [];

  // Filters
  const [filterConta, setFilterConta] = useState('all');

  const contas = useMemo(() => {
    return [...new Set(allAds.map(a => a.conta).filter(Boolean))].sort();
  }, [allAds]);

  const ads = useMemo(() => {
    if (filterConta === 'all') return allAds;
    return allAds.filter(a => a.conta.toLowerCase().includes(filterConta.toLowerCase()));
  }, [allAds, filterConta]);

  // Aggregations
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

  // 3. Top Anúncios por Investimento
  const topAnunciosInvestimento = useMemo(() => {
    const map = new Map<string, { titulo: string; investimento: number; receita: number; vendas: number }>();
    ads.forEach(a => {
      const key = a.idAnuncio || 'N/A';
      const label = a.titulo?.slice(0, 40) || key;
      const cur = map.get(key) || { titulo: label, investimento: 0, receita: 0, vendas: 0 };
      cur.investimento += a.investimento;
      cur.receita += a.receita;
      cur.vendas += a.vendasQtd;
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

  // 5. Investimento por Tipo (product_ads, etc)
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

  // 6. ACOS por Campanha (Top 10 piores)
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

        {/* 3. Top Anúncios por Investimento */}
        {topAnunciosInvestimento.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
            <h3 className="text-foreground font-semibold mb-4">📈 Top Anúncios por Investimento</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topAnunciosInvestimento} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="titulo" type="category" tick={{ fontSize: 8 }} width={150} />
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
                <Pie data={investimentoPorTipo} dataKey="value" nameKey="tipo" cx="50%" cy="50%" outerRadius={90} label={({ tipo, value }) => `${tipo}: ${formatBRL(value)}`}>
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
    </div>
  );
}
