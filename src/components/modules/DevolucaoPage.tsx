import { useState, useMemo } from 'react';
import { RotateCcw, DollarSign, Package, AlertTriangle, CheckCircle2, TrendingDown, Filter, Search, ChevronDown, ChevronUp, CalendarDays } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { PageHeader } from '@/components/layout/PageHeader';
import { KpiCard } from '@/components/shared/KpiCard';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import { formatBRL } from '@/lib/utils-vix';

const COLORS = ['#6366f1', '#ef4444', '#22c55e', '#f59e0b', '#3b82f6', '#ec4899', '#14b8a6', '#8b5cf6', '#f97316', '#06b6d4'];

const STATUS_COLORS: Record<string, string> = {
  'CONCLUÍDA': 'bg-emerald-500/10 text-emerald-400',
  'EM ANDAMENTO': 'bg-amber-500/10 text-amber-400',
  'PENDENTE': 'bg-red-500/10 text-red-400',
};

const SITUACAO_COLORS: Record<string, string> = {
  'VENDÁVEL': 'bg-emerald-500/10 text-emerald-400',
  'NÃO VENDÁVEL': 'bg-red-500/10 text-red-400',
};

type TabId = 'resumo' | 'devolucoes';

export function DevolucaoPage() {
  const { devolucaoItems } = useSheetsData();
  const [activeTab, setActiveTab] = useState<TabId>('resumo');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSetor, setFilterSetor] = useState('all');
  const [filterSituacao, setFilterSituacao] = useState('all');
  const [sortCol, setSortCol] = useState<string>('dataPlanilha');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [periodDays, setPeriodDays] = useState<number | 'custom' | 'all'>(30);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const items = devolucaoItems || [];

  // Derived filter options
  const statusOptions = useMemo(() => [...new Set(items.map(i => i.statusDevolucao).filter(Boolean))], [items]);
  const setorOptions = useMemo(() => [...new Set(items.map(i => i.setor).filter(Boolean))], [items]);
  const situacaoOptions = useMemo(() => [...new Set(items.map(i => i.situacaoMercadoria).filter(Boolean))], [items]);

  // Filtered items
  const filtered = useMemo(() => {
    let result = items;
    if (filterStatus !== 'all') result = result.filter(i => i.statusDevolucao === filterStatus);
    if (filterSetor !== 'all') result = result.filter(i => i.setor === filterSetor);
    if (filterSituacao !== 'all') result = result.filter(i => i.situacaoMercadoria === filterSituacao);
    // Date filter — handles: dd/mm/yyyy, yyyy-mm-dd, mm/dd/yyyy, serial numbers
    const parseDate = (str: string): Date | null => {
      if (!str) return null;
      const s = str.trim();
      // dd/mm/yyyy
      const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dmyMatch) return new Date(+dmyMatch[3], +dmyMatch[2] - 1, +dmyMatch[1]);
      // yyyy-mm-dd
      const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) return new Date(+isoMatch[1], +isoMatch[2] - 1, +isoMatch[3]);
      // Serial number (Excel/Sheets)
      const num = Number(s);
      if (!isNaN(num) && num > 30000 && num < 60000) {
        return new Date((num - 25569) * 86400000);
      }
      // Try native parse as last resort
      const native = new Date(s);
      return isNaN(native.getTime()) ? null : native;
    };
    if (periodDays !== 'custom' && periodDays !== 'all') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - periodDays);
      cutoff.setHours(0, 0, 0, 0);
      result = result.filter(i => {
        const d = parseDate(i.dataPlanilha);
        return d ? d >= cutoff : false;
      });
    } else if (periodDays === 'custom') {
      if (dateFrom) {
        const from = new Date(dateFrom + 'T00:00:00');
        result = result.filter(i => {
          const d = parseDate(i.dataPlanilha);
          return d ? d >= from : false;
        });
      }
      if (dateTo) {
        const to = new Date(dateTo + 'T23:59:59');
        result = result.filter(i => {
          const d = parseDate(i.dataPlanilha);
          return d ? d <= to : false;
        });
      }
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(i =>
        i.pedido.toLowerCase().includes(q) ||
        i.skuProduto.toLowerCase().includes(q) ||
        i.plataforma.toLowerCase().includes(q) ||
        i.motivo.toLowerCase().includes(q) ||
        i.novoMotivo.toLowerCase().includes(q) ||
        i.colaborador.toLowerCase().includes(q)
      );
    }
    // Sort
    result = [...result].sort((a: any, b: any) => {
      const va = a[sortCol] ?? '';
      const vb = b[sortCol] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return result;
  }, [items, filterStatus, filterSetor, filterSituacao, search, sortCol, sortDir, periodDays, dateFrom, dateTo]);

  // KPIs
  const totalDevolucoes = filtered.length;
  const totalReembolso = filtered.reduce((s, i) => s + i.valorReembolso, 0);
  const totalCusto = filtered.reduce((s, i) => s + i.totalCustoMercadoria, 0);
  const totalQtd = filtered.reduce((s, i) => s + i.quantidade, 0);
  const vendaveis = filtered.filter(i => i.situacaoMercadoria === 'VENDÁVEL').length;
  const naoVendaveis = filtered.filter(i => i.situacaoMercadoria === 'NÃO VENDÁVEL').length;
  const concluidas = filtered.filter(i => i.statusDevolucao === 'CONCLUÍDA').length;

  // Charts data
  const motivoChart = useMemo(() => {
    const map = new Map<string, { motivo: string; total: number; valor: number }>();
    filtered.forEach(i => {
      const m = i.novoMotivo || i.motivo || 'Não informado';
      const cur = map.get(m) || { motivo: m, total: 0, valor: 0 };
      cur.total += 1;
      cur.valor += i.valorReembolso;
      map.set(m, cur);
    });
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 10);
  }, [filtered]);

  const setorChart = useMemo(() => {
    const map = new Map<string, { setor: string; total: number; valor: number }>();
    filtered.forEach(i => {
      const s = i.setor || 'Não informado';
      const cur = map.get(s) || { setor: s, total: 0, valor: 0 };
      cur.total += 1;
      cur.valor += i.valorReembolso;
      map.set(s, cur);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [filtered]);

  const plataformaChart = useMemo(() => {
    const map = new Map<string, { plataforma: string; total: number; valor: number }>();
    filtered.forEach(i => {
      const p = i.plataforma || 'Outros';
      const cur = map.get(p) || { plataforma: p, total: 0, valor: 0 };
      cur.total += 1;
      cur.valor += i.valorReembolso;
      map.set(p, cur);
    });
    return [...map.values()].sort((a, b) => b.valor - a.valor);
  }, [filtered]);

  const situacaoChart = useMemo(() => [
    { name: 'Vendável', value: vendaveis, color: '#22c55e' },
    { name: 'Não Vendável', value: naoVendaveis, color: '#ef4444' },
  ].filter(i => i.value > 0), [vendaveis, naoVendaveis]);

  const depositoChart = useMemo(() => {
    const map = new Map<string, { deposito: string; total: number }>();
    filtered.forEach(i => {
      const d = i.depositoDevolucao || 'Não informado';
      const cur = map.get(d) || { deposito: d, total: 0 };
      cur.total += 1;
      map.set(d, cur);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [filtered]);

  const skuChart = useMemo(() => {
    const map = new Map<string, { sku: string; total: number; qtd: number; valor: number; motivos: Map<string, number> }>();
    filtered.forEach(i => {
      const sku = i.skuProduto || 'Sem SKU';
      const cur = map.get(sku) || { sku, total: 0, qtd: 0, valor: 0, motivos: new Map() };
      cur.total += 1;
      cur.qtd += i.quantidade;
      cur.valor += i.valorReembolso;
      const motivo = i.novoMotivo || i.motivo || 'Não informado';
      cur.motivos.set(motivo, (cur.motivos.get(motivo) || 0) + 1);
      map.set(sku, cur);
    });
    return [...map.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 20)
      .map(item => {
        const topMotivo = [...item.motivos.entries()].sort((a, b) => b[1] - a[1])[0];
        return { ...item, topMotivo: topMotivo ? topMotivo[0] : '-' };
      });
  }, [filtered]);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return null;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'resumo', label: 'Resumo' },
    { id: 'devolucoes', label: 'Devoluções' },
  ];

  return (
    <div>
      <PageHeader
        title="Devolução"
        subtitle={`Controle de devoluções e trocas · ${items.length} registros`}
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-card border border-border rounded-xl p-1 mb-6 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
              activeTab === t.id
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3 bg-card border border-border rounded-xl p-4 mb-6">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Filter className="w-4 h-4" />
          <span className="text-xs font-medium">Filtros</span>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar pedido, SKU, motivo..."
            className="pl-8 pr-3 py-1.5 rounded-lg bg-muted text-foreground text-xs border-none outline-none w-56"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs border-none outline-none"
        >
          <option value="all">Todos Status</option>
          {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filterSetor}
          onChange={e => setFilterSetor(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs border-none outline-none"
        >
          <option value="all">Todos Setores</option>
          {setorOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filterSituacao}
          onChange={e => setFilterSituacao(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs border-none outline-none"
        >
          <option value="all">Todas Situações</option>
          {situacaoOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex items-center gap-1.5 ml-2">
          <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
          <button
            onClick={() => setPeriodDays('all')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              periodDays === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            Todos
          </button>
          {([7, 15, 30] as const).map(d => (
            <button
              key={d}
              onClick={() => setPeriodDays(d)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                periodDays === d
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {d}d
            </button>
          ))}
          <button
            onClick={() => setPeriodDays('custom')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              periodDays === 'custom'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            Personalizado
          </button>
          {periodDays === 'custom' && (
            <>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="px-2 py-1 rounded-lg bg-muted text-foreground text-xs border-none outline-none"
              />
              <span className="text-xs text-muted-foreground">até</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="px-2 py-1 rounded-lg bg-muted text-foreground text-xs border-none outline-none"
              />
            </>
          )}
        </div>
      </div>

      {activeTab === 'resumo' && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard title="Total Devoluções" value={totalDevolucoes.toString()} subtitle={`${totalQtd} unidades`} icon={RotateCcw} trend="" />
            <KpiCard title="Valor Reembolsado" value={formatBRL(totalReembolso)} subtitle={`Ticket: ${totalDevolucoes > 0 ? formatBRL(totalReembolso / totalDevolucoes) : 'R$ 0'}`} icon={DollarSign} trend="" />
            <KpiCard title="Custo Mercadoria" value={formatBRL(totalCusto)} subtitle={`${vendaveis} vendáveis · ${naoVendaveis} não vendáveis`} icon={Package} trend="" />
            <KpiCard title="Concluídas" value={`${concluidas}/${totalDevolucoes}`} subtitle={`${totalDevolucoes > 0 ? Math.round(concluidas/totalDevolucoes*100) : 0}% do total`} icon={CheckCircle2} trend="" />
          </div>

          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Motivo chart */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Top Motivos de Devolução</h3>
              {motivoChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={motivoChart} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis dataKey="motivo" type="category" width={160} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                      formatter={(v: number) => [v, 'Devoluções']}
                    />
                    <Bar dataKey="total" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-sm text-center py-10">Sem dados</p>
              )}
            </div>

            {/* Situação Pie */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Situação da Mercadoria</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  {situacaoChart.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={situacaoChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45} strokeWidth={0}>
                          {situacaoChart.map((entry, idx) => (
                            <Cell key={idx} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                          formatter={(v: number, name: string) => [`${v} un`, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-muted-foreground text-sm text-center py-10">Sem dados</p>
                  )}
                </div>
                <div className="flex flex-col justify-center gap-4">
                  {situacaoChart.map(s => (
                    <div key={s.name} className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ background: s.color }} />
                      <div>
                        <p className="text-xs text-muted-foreground">{s.name}</p>
                        <p className="text-lg font-bold text-foreground">{s.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Charts Row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Setor */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Por Setor</h3>
              {setorChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={setorChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="setor" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                      formatter={(v: number, name: string) => [name === 'total' ? `${v} devoluções` : formatBRL(v), name === 'total' ? 'Qtd' : 'Valor']}
                    />
                    <Legend />
                    <Bar dataKey="total" name="Qtd" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="valor" name="Valor (R$)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-sm text-center py-10">Sem dados</p>
              )}
            </div>

            {/* Plataforma */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Por Plataforma</h3>
              {plataformaChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={plataformaChart} dataKey="valor" nameKey="plataforma" cx="50%" cy="50%" outerRadius={80} innerRadius={40} strokeWidth={0}>
                      {plataformaChart.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                      formatter={(v: number, name: string) => [formatBRL(v), name]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-sm text-center py-10">Sem dados</p>
              )}
            </div>
          </div>

          {/* Depósito mini-stats */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Depósito da Devolução</h3>
            <div className="flex flex-wrap gap-3">
              {depositoChart.map(d => (
                <div key={d.deposito} className="px-4 py-3 rounded-lg bg-muted flex flex-col items-center min-w-[100px]">
                  <span className="text-2xl font-bold text-foreground">{d.total}</span>
                  <span className="text-xs text-muted-foreground mt-1">{d.deposito}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top SKUs */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Top SKUs com mais Devoluções</h3>
            {skuChart.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-xs font-semibold text-muted-foreground">#</th>
                      <th className="px-3 py-2 text-xs font-semibold text-muted-foreground">SKU</th>
                      <th className="px-3 py-2 text-xs font-semibold text-muted-foreground text-center">Devoluções</th>
                      <th className="px-3 py-2 text-xs font-semibold text-muted-foreground text-center">Unidades</th>
                      <th className="px-3 py-2 text-xs font-semibold text-muted-foreground text-right">Reembolso</th>
                      <th className="px-3 py-2 text-xs font-semibold text-muted-foreground">Principal Motivo</th>
                      <th className="px-3 py-2 text-xs font-semibold text-muted-foreground w-40"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {skuChart.map((item, idx) => {
                      const maxTotal = skuChart[0]?.total || 1;
                      const pct = (item.total / maxTotal) * 100;
                      return (
                        <tr key={item.sku} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-2 text-xs text-muted-foreground font-medium">{idx + 1}</td>
                          <td className="px-3 py-2 text-xs text-foreground font-mono font-semibold">{item.sku}</td>
                          <td className="px-3 py-2 text-xs text-foreground text-center font-bold">{item.total}</td>
                          <td className="px-3 py-2 text-xs text-foreground text-center">{item.qtd}</td>
                          <td className="px-3 py-2 text-xs text-foreground text-right font-semibold">{formatBRL(item.valor)}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground max-w-[180px] truncate" title={item.topMotivo}>{item.topMotivo}</td>
                          <td className="px-3 py-2">
                            <div className="w-full bg-muted rounded-full h-2">
                              <div
                                className="h-2 rounded-full transition-all duration-500"
                                style={{ width: `${pct}%`, background: `hsl(${Math.max(0, 120 - pct * 1.2)}, 70%, 50%)` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-10">Sem dados</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'devolucoes' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {[
                    { key: 'dataPlanilha', label: 'Data' },
                    { key: 'plataforma', label: 'Plataforma' },
                    { key: 'pedido', label: 'Pedido' },
                    { key: 'skuProduto', label: 'SKU' },
                    { key: 'valorReembolso', label: 'Reembolso' },
                    { key: 'statusDevolucao', label: 'Status' },
                    { key: 'novoMotivo', label: 'Motivo' },
                    { key: 'setor', label: 'Setor' },
                    { key: 'quantidade', label: 'Qtd' },
                    { key: 'situacaoMercadoria', label: 'Situação' },
                    { key: 'totalCustoMercadoria', label: 'Custo' },
                    { key: 'depositoDevolucao', label: 'Depósito' },
                    { key: 'colaborador', label: 'Responsável' },
                  ].map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="px-3 py-2.5 text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground whitespace-nowrap"
                    >
                      {col.label} <SortIcon col={col.key} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="text-center py-16 text-muted-foreground">
                      <RotateCcw className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhuma devolução encontrada</p>
                      <p className="text-xs mt-1">Configure a planilha de devoluções em Performance → Planilhas</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((item, idx) => (
                    <>
                      <tr
                        key={idx}
                        onClick={() => setExpandedRow(expandedRow === idx ? null : idx)}
                        className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2 text-xs text-foreground whitespace-nowrap">{item.dataPlanilha}</td>
                        <td className="px-3 py-2 text-xs text-foreground whitespace-nowrap max-w-[160px] truncate" title={item.plataforma}>{item.plataforma}</td>
                        <td className="px-3 py-2 text-xs text-foreground font-mono whitespace-nowrap">{item.pedido}</td>
                        <td className="px-3 py-2 text-xs text-foreground font-mono whitespace-nowrap">{item.skuProduto}</td>
                        <td className="px-3 py-2 text-xs text-foreground font-semibold whitespace-nowrap">{formatBRL(item.valorReembolso)}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[item.statusDevolucao] || 'bg-muted text-muted-foreground'}`}>
                            {item.statusDevolucao || '-'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-foreground max-w-[180px] truncate" title={item.novoMotivo || item.motivo}>{item.novoMotivo || item.motivo || '-'}</td>
                        <td className="px-3 py-2 text-xs text-foreground whitespace-nowrap">{item.setor || '-'}</td>
                        <td className="px-3 py-2 text-xs text-foreground text-center">{item.quantidade}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${SITUACAO_COLORS[item.situacaoMercadoria] || 'bg-muted text-muted-foreground'}`}>
                            {item.situacaoMercadoria || '-'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-foreground whitespace-nowrap">{formatBRL(item.totalCustoMercadoria)}</td>
                        <td className="px-3 py-2 text-xs text-foreground whitespace-nowrap">{item.depositoDevolucao || '-'}</td>
                        <td className="px-3 py-2 text-xs text-foreground whitespace-nowrap">{item.colaborador || '-'}</td>
                      </tr>
                      {expandedRow === idx && (
                        <tr key={`detail-${idx}`} className="bg-muted/20">
                          <td colSpan={13} className="px-6 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-2 text-xs">
                              <div><span className="text-muted-foreground">Anúncio:</span> <span className="text-foreground">{item.anuncio || '-'}</span></div>
                              <div><span className="text-muted-foreground">Data Aprovação:</span> <span className="text-foreground">{item.dataAprovacao || '-'}</span></div>
                              <div><span className="text-muted-foreground">Rastreio:</span> <span className="text-foreground">{item.rastreioCorreios || '-'}</span></div>
                              <div><span className="text-muted-foreground">Gerada Por:</span> <span className="text-foreground">{item.devolucaoGeradaPor || '-'}</span></div>
                              <div><span className="text-muted-foreground">Ação Após:</span> <span className="text-foreground">{item.acaoAposDevolucao || '-'}</span></div>
                              <div><span className="text-muted-foreground">Detalhe:</span> <span className="text-foreground">{item.detalhe || '-'}</span></div>
                              <div><span className="text-muted-foreground">Custo Devolução:</span> <span className="text-foreground">{formatBRL(item.custoDevolucao)}</span></div>
                              <div><span className="text-muted-foreground">Comissão Não Devolvida:</span> <span className="text-foreground">{formatBRL(item.comissaoNaoDevolvida)}</span></div>
                              <div><span className="text-muted-foreground">Custo Produto:</span> <span className="text-foreground">{formatBRL(item.custo)}</span></div>
                              <div><span className="text-muted-foreground">Forma Reembolso:</span> <span className="text-foreground">{item.formaReembolso || '-'}</span></div>
                              <div><span className="text-muted-foreground">Data Reembolso:</span> <span className="text-foreground">{item.dataReembolso || '-'}</span></div>
                              <div><span className="text-muted-foreground">NF Devolução:</span> <span className="text-foreground">{item.notaFiscalDevolucao || '-'}</span></div>
                              <div><span className="text-muted-foreground">Retorno:</span> <span className="text-foreground">{item.retornoDevolucao || '-'}</span></div>
                              <div><span className="text-muted-foreground">Motivo Original:</span> <span className="text-foreground">{item.motivo || '-'}</span></div>
                              <div><span className="text-muted-foreground">Detalhes Motivo:</span> <span className="text-foreground">{item.detalhesMotivo || '-'}</span></div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-border flex justify-between items-center">
              <span className="text-xs text-muted-foreground">{filtered.length} devoluções</span>
              <span className="text-xs text-muted-foreground">Total reembolso: <b className="text-foreground">{formatBRL(totalReembolso)}</b></span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
