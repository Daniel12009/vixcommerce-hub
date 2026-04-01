import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Package, AlertTriangle, TrendingDown, Truck, ArrowUpDown, ArrowUp, ArrowDown, Pencil, Check, FileSpreadsheet, Search, RefreshCw, Loader2, X, BarChart2, Activity, Shield, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KpiCard } from '@/components/shared/KpiCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatNumber } from '@/lib/utils-vix';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import { EnviosTab } from './EnviosTab';
import { ExpedicaoTab } from './ExpedicaoTab';
import { EmTransitoTab } from './EmTransitoTab';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, PieChart, Pie, Legend } from 'recharts';

interface MergedStockRow {
  sku: string;
  conta: string;           // specific account
  venSemanal: number;
  vmd: number;
  tinyLocal: number;       // global total (across all accounts)
  fullML: number;          // this account's aptas para venda
  entradaPendente: number; // this account's
  emTransferencia: number; // this account's
  sugestaoEnvio: number;
  coberturaDias: number;
  status: 'ruptura' | 'critico' | 'ok';
  contas: string[];        // kept for KPI compat
  customCobertura?: number;
}

type SortField = 'sku' | 'venSemanal' | 'vmd' | 'tinyLocal' | 'fullML' | 'entradaPendente' | 'emTransferencia' | 'sugestaoEnvio' | 'coberturaDias';

const STATUS_COLORS = {
  ruptura: 'hsl(0,72%,50%)',
  critico: 'hsl(38,92%,50%)',
  ok: 'hsl(142,76%,36%)',
};

export function EstoquePage() {
  const { estoqueFullItems, estoqueTinyItems, performanceItems, refreshModule, refreshingModule } = useSheetsData();

  const handleRefresh = useCallback(async () => {
    const [r1, r2] = await Promise.all([
      refreshModule('estoque-full'),
      refreshModule('estoque-tiny'),
    ]);
    toast.success(`Estoque atualizado! ${r1 + r2} registros importados`);
  }, [refreshModule]);
  const isRefreshing = refreshingModule === 'estoque-full' || refreshingModule === 'estoque-tiny';

  const hasAutoLoaded = useRef(false);
  useEffect(() => {
    if (hasAutoLoaded.current) return;
    if (!estoqueFullItems && !estoqueTinyItems) {
      hasAutoLoaded.current = true;
      handleRefresh();
    }
  }, [estoqueFullItems, estoqueTinyItems, handleRefresh]);

  // Master coverage + per-SKU overrides
  const [diasCoberturaAlvo, setDiasCoberturaAlvo] = useState<number>(() => {
    const saved = localStorage.getItem('vix_cobertura_master');
    return saved ? parseInt(saved) : 5;
  });
  const [skuCoberturaOverrides, setSkuCoberturaOverrides] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('vix_cobertura_overrides') || '{}'); } catch { return {}; }
  });

  // Persist master + overrides
  useEffect(() => { localStorage.setItem('vix_cobertura_master', String(diasCoberturaAlvo)); }, [diasCoberturaAlvo]);
  useEffect(() => { localStorage.setItem('vix_cobertura_overrides', JSON.stringify(skuCoberturaOverrides)); }, [skuCoberturaOverrides]);

  const [editingCobertura, setEditingCobertura] = useState(false);
  const [tempCobertura, setTempCobertura] = useState('5');
  const [sortField, setSortField] = useState<SortField>('coberturaDias');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'ruptura' | 'critico' | 'ok'>('all');
  const [filterConta, setFilterConta] = useState<string>('all');

  // Coverage change popup
  const [showCoberturaPopup, setShowCoberturaPopup] = useState(false);
  const [coberturaPopupMode, setCoberturaPopupMode] = useState<'all' | 'select'>('all');
  const [coberturaPopupValue, setCoberturaPopupValue] = useState('');
  const [coberturaSelectedSkus, setCoberturaSelectedSkus] = useState<Set<string>>(new Set());
  const [coberturaSearchTerm, setCoberturaSearchTerm] = useState('');

  const hasFullData = !!estoqueFullItems?.length;
  const hasTinyData = !!estoqueTinyItems?.length;
  const hasAnyData = hasFullData || hasTinyData;

  const contasUnicas = useMemo(() => {
    const set = new Set<string>();
    (estoqueFullItems || []).forEach(i => { if (i.conta) set.add(i.conta); });
    return Array.from(set).sort();
  }, [estoqueFullItems]);

  const vmdBySku = useMemo(() => {
    const map = new Map<string, number>();
    const grouped = new Map<string, { totalVendas: number; dias: Set<string> }>();
    (performanceItems || []).forEach(item => {
      if (!item.sku) return;
      const sku = item.sku.trim().toUpperCase();
      const dateKey = item.dataRef || 'sem-data';
      const current = grouped.get(sku) || { totalVendas: 0, dias: new Set<string>() };
      current.totalVendas += Number(item.vendas || 0);
      current.dias.add(dateKey);
      grouped.set(sku, current);
    });
    grouped.forEach((value, sku) => {
      const dias = Math.max(1, value.dias.size);
      map.set(sku, value.totalVendas / dias);
    });
    return map;
  }, [performanceItems]);

  const mergedData = useMemo<MergedStockRow[]>(() => {
    const fullMap = new Map<string, { fullML: number; entradaPendente: number; emTransferencia: number; contas: Set<string> }>();
    const tinyMap = new Map<string, number>();

    (estoqueFullItems || []).forEach(item => {
      const sku = item.sku?.trim().toUpperCase();
      if (!sku) return;
      const current = fullMap.get(sku) || { fullML: 0, entradaPendente: 0, emTransferencia: 0, contas: new Set<string>() };
      current.fullML += Number(item.aptasParaVenda || 0);
      current.entradaPendente += Number(item.entradaPendente || 0);
      current.emTransferencia += Number(item.emTransferencia || 0);
      if (item.conta) current.contas.add(item.conta);
      fullMap.set(sku, current);
    });

    (estoqueTinyItems || []).forEach(item => {
      const sku = item.sku?.trim().toUpperCase();
      if (!sku) return;
      tinyMap.set(sku, (tinyMap.get(sku) || 0) + Number(item.quantidade || 0));
    });

    const allSkus = new Set<string>([...fullMap.keys(), ...tinyMap.keys()]);

    return Array.from(allSkus).map((sku) => {
      const full = fullMap.get(sku);
      const tinyLocal = tinyMap.get(sku) || 0;
      const fullML = full?.fullML || 0;
      const entradaPendente = full?.entradaPendente || 0;
      const emTransferencia = full?.emTransferencia || 0;
      const vmd = vmdBySku.get(sku) || 0;
      const skuCobertura = skuCoberturaOverrides[sku] ?? diasCoberturaAlvo;
      const coberturaDias = vmd > 0 ? Number((fullML / vmd).toFixed(1)) : 999;
      const sugestaoEnvio = Math.max(0, Math.ceil((vmd * skuCobertura) - (fullML + entradaPendente + emTransferencia)));

      let status: 'ruptura' | 'critico' | 'ok' = 'ok';
      if (fullML <= 0) status = 'ruptura';
      else if (coberturaDias < skuCobertura) status = 'critico';

      return {
        sku, conta: '', venSemanal: Math.round(vmd * 7), vmd, tinyLocal, fullML,
        entradaPendente, emTransferencia, sugestaoEnvio, coberturaDias, status,
        contas: Array.from(full?.contas || []),
        customCobertura: skuCoberturaOverrides[sku],
      };
    });
  }, [estoqueFullItems, estoqueTinyItems, vmdBySku, diasCoberturaAlvo, skuCoberturaOverrides]);

  // Per-account rows for the table — one row per (SKU × conta)
  const perAccountData = useMemo<MergedStockRow[]>(() => {
    const tinyMap = new Map<string, number>();
    (estoqueTinyItems || []).forEach(item => {
      const sku = item.sku?.trim().toUpperCase();
      if (!sku) return;
      tinyMap.set(sku, (tinyMap.get(sku) || 0) + Number(item.quantidade || 0));
    });

    return (estoqueFullItems || []).map(item => {
      const sku = item.sku?.trim().toUpperCase() || '';
      const conta = item.conta || '';
      const fullML = Number(item.aptasParaVenda || 0);
      const entradaPendente = Number(item.entradaPendente || 0);
      const emTransferencia = Number(item.emTransferencia || 0);
      const tinyLocal = tinyMap.get(sku) || 0;
      const vmd = vmdBySku.get(sku) || 0;
      const skuCobertura = skuCoberturaOverrides[sku] ?? diasCoberturaAlvo;
      const coberturaDias = vmd > 0 ? Number((fullML / vmd).toFixed(1)) : 999;
      const sugestaoEnvio = Math.max(0, Math.ceil((vmd * skuCobertura) - (fullML + entradaPendente + emTransferencia)));
      let status: 'ruptura' | 'critico' | 'ok' = 'ok';
      if (fullML <= 0) status = 'ruptura';
      else if (coberturaDias < skuCobertura) status = 'critico';
      return {
        sku, conta, venSemanal: Math.round(vmd * 7), vmd, tinyLocal, fullML,
        entradaPendente, emTransferencia, sugestaoEnvio, coberturaDias, status,
        contas: [conta], customCobertura: skuCoberturaOverrides[sku],
      };
    });
  }, [estoqueFullItems, estoqueTinyItems, vmdBySku, diasCoberturaAlvo, skuCoberturaOverrides]);

  const totalSkus = mergedData.length;
  const skusRuptura = mergedData.filter(r => r.status === 'ruptura').length;
  const skusCriticos = mergedData.filter(r => r.status === 'critico').length;
  const skusEntradaPendente = mergedData.filter(r => r.entradaPendente > 0).length;
  const skusEmTransferencia = mergedData.filter(r => r.emTransferencia > 0).length;

  // Health per account
  const accountHealth = useMemo(() => {
    const map = new Map<string, { total: number; ruptura: number; critico: number; ok: number; totalFull: number }>();
    (estoqueFullItems || []).forEach(item => {
      if (!item.conta) return;
      const sku = item.sku?.trim().toUpperCase();
      if (!sku) return;
      const entry = map.get(item.conta) || { total: 0, ruptura: 0, critico: 0, ok: 0, totalFull: 0 };
      entry.total++;
      entry.totalFull += Number(item.aptasParaVenda || 0);
      const fullML = Number(item.aptasParaVenda || 0);
      const vmd = vmdBySku.get(sku) || 0;
      const cob = vmd > 0 ? fullML / vmd : 999;
      const skuCob = skuCoberturaOverrides[sku] ?? diasCoberturaAlvo;
      if (fullML <= 0) entry.ruptura++;
      else if (cob < skuCob) entry.critico++;
      else entry.ok++;
      map.set(item.conta, entry);
    });
    return map;
  }, [estoqueFullItems, vmdBySku, diasCoberturaAlvo, skuCoberturaOverrides]);

  // Charts data
  const statusDistribution = useMemo(() => [
    { name: 'Ruptura', value: skusRuptura, fill: STATUS_COLORS.ruptura },
    { name: 'Crítico', value: skusCriticos, fill: STATUS_COLORS.critico },
    { name: 'OK', value: totalSkus - skusRuptura - skusCriticos, fill: STATUS_COLORS.ok },
  ], [totalSkus, skusRuptura, skusCriticos]);

  // Top 15 rupture items by VMD (most impactful)
  const topRuptureItems = useMemo(() =>
    mergedData.filter(r => r.status === 'ruptura' && r.vmd > 0)
      .sort((a, b) => b.vmd - a.vmd).slice(0, 15)
  , [mergedData]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) { setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc')); return; }
    setSortField(field); setSortDir(field === 'coberturaDias' ? 'asc' : 'desc');
  };
  const sortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="inline w-3.5 h-3.5 ml-1 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="inline w-3.5 h-3.5 ml-1" /> : <ArrowDown className="inline w-3.5 h-3.5 ml-1" />;
  };
  const statusBadge = (status: 'ruptura' | 'critico' | 'ok') => {
    const c = {
      ruptura: { label: 'Ruptura', cls: 'bg-[hsl(var(--vix-danger)/0.15)] text-[hsl(var(--vix-danger))]' },
      critico: { label: 'Crítico', cls: 'bg-[hsl(var(--vix-warning)/0.15)] text-[hsl(var(--vix-warning))]' },
      ok: { label: 'OK', cls: 'bg-[hsl(var(--vix-success)/0.15)] text-[hsl(var(--vix-success))]' },
    }[status];
    return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c.cls}`}>{c.label}</span>;
  };

  const displayData = useMemo(() => {
    const term = searchTerm.trim().toUpperCase();
    // Use per-account rows for the table; filter by specific account if selected
    const filtered = perAccountData.filter(row => {
      if (term && !row.sku.includes(term)) return false;
      if (filterStatus !== 'all' && row.status !== filterStatus) return false;
      if (filterConta !== 'all' && row.conta !== filterConta) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      const aVal = a[sortField]; const bVal = b[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === 'asc' ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
    });
  }, [perAccountData, searchTerm, filterStatus, filterConta, sortField, sortDir]);

  const transferItems = useMemo(() => {
    if (!estoqueFullItems) return [];
    return estoqueFullItems.filter(i => i.emTransferencia > 0 || i.entradaPendente > 0)
      .map(i => ({ ...i, sku: i.sku.trim().toUpperCase() }))
      .sort((a, b) => (b.emTransferencia + b.entradaPendente) - (a.emTransferencia + a.entradaPendente));
  }, [estoqueFullItems]);

  // Coverage change handler
  const handleCoberturaChange = () => {
    const val = parseInt(coberturaPopupValue);
    if (!val || val < 1) { toast.error('Valor inválido'); return; }
    if (coberturaPopupMode === 'all') {
      setDiasCoberturaAlvo(val);
      setSkuCoberturaOverrides({});
      toast.success(`Cobertura master atualizada para ${val} dias (todos os SKUs)`);
    } else {
      const newOverrides = { ...skuCoberturaOverrides };
      coberturaSelectedSkus.forEach(sku => { newOverrides[sku] = val; });
      setSkuCoberturaOverrides(newOverrides);
      toast.success(`Cobertura personalizada: ${coberturaSelectedSkus.size} SKUs → ${val} dias`);
    }
    setShowCoberturaPopup(false);
    setCoberturaSelectedSkus(new Set());
    setCoberturaPopupValue('');
  };

  const healthPercent = (h: { ok: number; total: number }) => h.total > 0 ? Math.round((h.ok / h.total) * 100) : 0;

  return (
    <div>
      <PageHeader title="Estoque Full & Local" subtitle="Gestão logística com alertas de ruptura e controle de envios" />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button onClick={handleRefresh} disabled={isRefreshing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50">
          {isRefreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {isRefreshing ? 'Atualizando...' : 'Atualizar Estoque'}
        </button>
        {hasFullData && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[hsl(var(--vix-info)/0.1)] border border-[hsl(var(--vix-info)/0.2)] text-xs text-[hsl(var(--vix-info))]">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Full ML: {estoqueFullItems!.length} registros
          </div>
        )}
        {hasTinyData && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[hsl(200,80%,50%,0.1)] border border-[hsl(200,80%,50%,0.2)] text-xs text-[hsl(200,80%,50%)]">
            <Package className="w-3.5 h-3.5" /> Tiny Local: {estoqueTinyItems!.length} SKUs
          </div>
        )}
      </div>

      <Tabs defaultValue="visao-geral" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="visao-geral">📊 Visão Geral</TabsTrigger>
          <TabsTrigger value="expedicao-api">📦 Expedição (API)</TabsTrigger>
          <TabsTrigger value="em-transito">✈️ Em Trânsito (API)</TabsTrigger>
          <TabsTrigger value="envios">🚚 Envios (Planilha ML)</TabsTrigger>
          <TabsTrigger value="transferencias">🔄 Transferências</TabsTrigger>
        </TabsList>

        <TabsContent value="expedicao-api" className="mt-0">
          <ExpedicaoTab />
        </TabsContent>

        <TabsContent value="em-transito" className="mt-0">
          <EmTransitoTab />
        </TabsContent>

        <TabsContent value="visao-geral">
          {!hasAnyData ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center animate-fade-in">
              <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
              <h3 className="text-lg font-semibold mb-2">Nenhum dado de estoque importado</h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                Vá em <strong>Configurações → Planilhas</strong>, adicione <strong>Estoque Full (ML)</strong> e/ou <strong>Estoque Tiny (Local)</strong>.
              </p>
            </div>
          ) : (
            <>
              {/* KPI Row 1: Main metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                <KpiCard title="Total SKUs" value={String(totalSkus)} icon={Package} delay={0} />
                <KpiCard title="Em Ruptura" value={String(skusRuptura)} icon={TrendingDown} delay={50} />
                <KpiCard title="Críticos" value={String(skusCriticos)} icon={AlertTriangle} delay={100} />
                <KpiCard title="Entrada Pendente" value={String(skusEntradaPendente)} icon={Truck} delay={150} />
                <KpiCard title="Em Transferência" value={String(skusEmTransferencia)} icon={ArrowUpDown} delay={200} />
              </div>

              {/* KPI Row 2: Health per account */}
              {accountHealth.size > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                  {Array.from(accountHealth.entries()).map(([conta, h]) => {
                    const pct = healthPercent(h);
                    const color = pct >= 80 ? 'hsl(var(--vix-success))' : pct >= 50 ? 'hsl(var(--vix-warning))' : 'hsl(var(--vix-danger))';
                    return (
                      <div key={conta} className="bg-card border border-border rounded-xl p-4 animate-fade-in">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4" style={{ color }} />
                            <span className="text-sm font-semibold text-foreground">{conta}</span>
                          </div>
                          <span className="text-lg font-bold" style={{ color }}>{pct}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-muted overflow-hidden mb-2">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                        </div>
                        <div className="flex items-center gap-3 text-[10px]">
                          <span className="text-[hsl(var(--vix-success))]">✓ {h.ok} OK</span>
                          <span className="text-[hsl(var(--vix-warning))]">⚠ {h.critico} Crítico</span>
                          <span className="text-[hsl(var(--vix-danger))]">✕ {h.ruptura} Ruptura</span>
                          <span className="text-muted-foreground ml-auto">{formatNumber(h.totalFull)} unid. Full</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Delay Alert Box */}
              {skusRuptura > 0 && (
                <div className="bg-[hsl(var(--vix-danger)/0.05)] border border-[hsl(var(--vix-danger)/0.2)] rounded-xl p-4 mb-4 animate-fade-in">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-[hsl(var(--vix-danger))]" />
                    <span className="text-sm font-semibold text-[hsl(var(--vix-danger))]">⚠️ {skusRuptura} SKUs em ruptura</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">Itens com estoque Full zerado que precisam de reposição urgente:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {mergedData.filter(r => r.status === 'ruptura').slice(0, 20).map(r => (
                      <span key={r.sku} className="px-2 py-0.5 rounded-full bg-[hsl(var(--vix-danger)/0.1)] text-[hsl(var(--vix-danger))] text-[10px] font-mono font-semibold">{r.sku}</span>
                    ))}
                    {skusRuptura > 20 && <span className="text-[10px] text-muted-foreground self-center">+{skusRuptura - 20} mais</span>}
                  </div>
                </div>
              )}

              {/* Charts Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* Pie: Status Distribution */}
                <div className="bg-card border border-border rounded-xl p-4 animate-fade-in">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-primary" /> Distribuição por Status
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={statusDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3} label={({ name, value }) => `${name}: ${value}`}>
                        {statusDistribution.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                      <Tooltip formatter={(value: number) => [value, 'SKUs']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Bar: Top rupture items by VMD impact */}
                <div className="bg-card border border-border rounded-xl p-4 animate-fade-in">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[hsl(var(--vix-danger))]" /> Top Rupturas por Impacto (VMD)
                  </h3>
                  {topRuptureItems.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={topRuptureItems} layout="vertical" margin={{ left: 50 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis type="category" dataKey="sku" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} width={50} />
                        <Tooltip formatter={(v: number) => [v.toFixed(1), 'VMD']} />
                        <Bar dataKey="vmd" radius={[0, 4, 4, 0]}>
                          {topRuptureItems.map((_, i) => <Cell key={i} fill={STATUS_COLORS.ruptura} opacity={0.8} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                      <Check className="w-5 h-5 text-[hsl(var(--vix-success))] mr-2" /> Sem rupturas com demanda ativa
                    </div>
                  )}
                </div>
              </div>

              {/* Controls */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
                  <span className="text-xs text-muted-foreground font-medium">Cobertura Alvo:</span>
                  {editingCobertura ? (
                    <div className="flex items-center gap-1">
                      <input type="number" min={1} max={90} value={tempCobertura} onChange={e => setTempCobertura(e.target.value)}
                        className="w-14 h-7 text-center text-sm bg-muted border border-border rounded px-1" autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') { const v = parseInt(tempCobertura); if (v > 0) { setCoberturaPopupValue(tempCobertura); setShowCoberturaPopup(true); } setEditingCobertura(false); } }} />
                      <span className="text-xs text-muted-foreground">dias</span>
                      <button onClick={() => { setCoberturaPopupValue(tempCobertura); setShowCoberturaPopup(true); setEditingCobertura(false); }} className="p-1 rounded hover:bg-muted transition-colors">
                        <Check className="w-3.5 h-3.5 text-[hsl(var(--vix-success))]" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { setTempCobertura(String(diasCoberturaAlvo)); setEditingCobertura(true); }} className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                      {diasCoberturaAlvo} dias <Pencil className="w-3 h-3" />
                    </button>
                  )}
                  {Object.keys(skuCoberturaOverrides).length > 0 && (
                    <span className="text-[10px] text-[hsl(var(--vix-info))] bg-[hsl(var(--vix-info)/0.1)] px-1.5 py-0.5 rounded">{Object.keys(skuCoberturaOverrides).length} personalizados</span>
                  )}
                </div>

                {contasUnicas.length > 0 && (
                  <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
                    <span className="text-xs text-muted-foreground font-medium">Conta:</span>
                    <select value={filterConta} onChange={e => setFilterConta(e.target.value)} className="text-sm bg-transparent border-none outline-none font-semibold text-primary cursor-pointer">
                      <option value="all">Todas</option>
                      {contasUnicas.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}

                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input type="text" placeholder="Buscar SKU..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-2 h-9 text-sm bg-card border border-border rounded-lg focus:ring-1 focus:ring-primary outline-none" />
                </div>

                <div className="flex items-center gap-1">
                  {(['all', 'ruptura', 'critico', 'ok'] as const).map(s => (
                    <button key={s} onClick={() => setFilterStatus(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === s ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                      {{ all: 'Todos', ruptura: '🔴 Ruptura', critico: '🟡 Crítico', ok: '🟢 OK' }[s]}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground ml-auto">{displayData.length} de {totalSkus} SKUs</span>
              </div>

              {/* Table — per-account rows */}
              <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Conta</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('sku')}>SKU{sortIcon('sku')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('venSemanal')}>Ven. Sem.{sortIcon('venSemanal')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('vmd')}>VMD{sortIcon('vmd')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('tinyLocal')}>Tiny (Total){sortIcon('tinyLocal')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('fullML')}>Full (Conta){sortIcon('fullML')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('entradaPendente')}>Entrada{sortIcon('entradaPendente')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('emTransferencia')}>Transf.{sortIcon('emTransferencia')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('sugestaoEnvio')}>Sugestão{sortIcon('sugestaoEnvio')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('coberturaDias')}>Cobert.{sortIcon('coberturaDias')}</th>
                        <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayData.map((row, idx) => (
                        <tr key={`${row.sku}-${row.conta}-${idx}`} className={`border-b border-border hover:bg-muted/30 transition-colors ${row.status === 'ruptura' ? 'bg-[hsl(var(--vix-danger)/0.03)]' : row.status === 'critico' ? 'bg-[hsl(var(--vix-warning)/0.03)]' : ''}`}>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{row.conta}</td>
                          <td className="px-3 py-2.5 font-mono text-xs font-semibold text-primary">{row.sku}</td>
                          <td className="px-3 py-2.5 text-right text-foreground">{row.venSemanal}</td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground">{row.vmd.toFixed(1)}</td>
                          <td className="px-3 py-2.5 text-right text-foreground font-medium">{row.tinyLocal || '—'}</td>
                          <td className={`px-3 py-2.5 text-right font-medium ${row.fullML <= 0 ? 'text-[hsl(var(--vix-danger))]' : 'text-foreground'}`}>{row.fullML}</td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground">{row.entradaPendente || '—'}</td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground">{row.emTransferencia || '—'}</td>
                          <td className={`px-3 py-2.5 text-right font-semibold ${row.sugestaoEnvio > 0 ? 'text-[hsl(var(--vix-danger))]' : 'text-[hsl(var(--vix-success))]'}`}>{row.sugestaoEnvio > 0 ? `-${row.sugestaoEnvio}` : '0'}</td>
                          <td className={`px-3 py-2.5 text-right font-medium ${row.coberturaDias <= 0 ? 'text-[hsl(var(--vix-danger))]' : row.coberturaDias < diasCoberturaAlvo ? 'text-[hsl(var(--vix-warning))]' : 'text-[hsl(var(--vix-success))]'}`}>
                            {row.coberturaDias >= 999 ? '∞' : `${row.coberturaDias}d`}
                            {row.customCobertura && <span className="text-[9px] text-[hsl(var(--vix-info))] ml-0.5">⚙</span>}
                          </td>
                          <td className="px-3 py-2.5 text-center">{statusBadge(row.status)}</td>
                        </tr>
                      ))}
                      {displayData.length === 0 && (
                        <tr><td colSpan={11} className="py-8 text-center text-muted-foreground text-sm">{searchTerm || filterStatus !== 'all' ? 'Nenhum SKU encontrado com os filtros aplicados' : 'Nenhum dado disponível'}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="envios">
          <EnviosTab />
        </TabsContent>

        <TabsContent value="transferencias">
          {!hasFullData ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center animate-fade-in">
              <ArrowUpDown className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
              <h3 className="text-lg font-semibold mb-2">Dados de transferência não disponíveis</h3>
              <p className="text-muted-foreground text-sm">Importe a aba <strong>Full_Estoque</strong> para ver itens em transferência e entrada pendente.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                <KpiCard title="SKUs em Transferência" value={String(transferItems.filter(i => i.emTransferencia > 0).length)} icon={ArrowUpDown} delay={0} />
                <KpiCard title="SKUs com Entrada Pendente" value={String(transferItems.filter(i => i.entradaPendente > 0).length)} icon={Truck} delay={50} />
                <KpiCard title="Total Itens em Movimento" value={formatNumber(transferItems.reduce((s, i) => s + i.emTransferencia + i.entradaPendente, 0))} icon={Package} delay={100} />
              </div>
              <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Conta</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">SKU</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Aptas p/ Venda</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Em Transferência</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Entrada Pendente</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Status Anúncio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transferItems.map((item, idx) => (
                        <tr key={`${item.sku}-${item.conta}-${idx}`} className="border-b border-border hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">{item.conta}</td>
                          <td className="px-3 py-2.5 font-mono text-xs font-semibold text-primary">{item.sku}</td>
                          <td className="px-3 py-2.5 text-right text-foreground">{item.aptasParaVenda}</td>
                          <td className={`px-3 py-2.5 text-right font-medium ${item.emTransferencia > 0 ? 'text-[hsl(var(--vix-warning))]' : 'text-muted-foreground'}`}>{item.emTransferencia || '—'}</td>
                          <td className={`px-3 py-2.5 text-right font-medium ${item.entradaPendente > 0 ? 'text-[hsl(var(--vix-info))]' : 'text-muted-foreground'}`}>{item.entradaPendente || '—'}</td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">{item.statusAnuncio || '—'}</td>
                        </tr>
                      ))}
                      {transferItems.length === 0 && (
                        <tr><td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">Nenhum item em transferência ou com entrada pendente</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Coverage Change Popup */}
      {showCoberturaPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-foreground font-semibold text-lg">Alterar Cobertura Alvo</h3>
              <button onClick={() => setShowCoberturaPopup(false)} className="p-1 rounded hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground font-medium">Novo valor:</span>
                <input type="number" min={1} max={90} value={coberturaPopupValue} onChange={e => setCoberturaPopupValue(e.target.value)}
                  className="w-20 h-9 text-center text-sm bg-muted border border-border rounded-lg px-2" autoFocus />
                <span className="text-sm text-muted-foreground">dias</span>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/50 transition-colors">
                  <input type="radio" name="cobMode" checked={coberturaPopupMode === 'all'} onChange={() => setCoberturaPopupMode('all')} className="accent-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Alterar todos os SKUs</p>
                    <p className="text-xs text-muted-foreground">Atualiza a cobertura master e remove todas as personalizações</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/50 transition-colors">
                  <input type="radio" name="cobMode" checked={coberturaPopupMode === 'select'} onChange={() => setCoberturaPopupMode('select')} className="accent-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Somente SKUs selecionados</p>
                    <p className="text-xs text-muted-foreground">Aplica cobertura personalizada nos SKUs escolhidos abaixo</p>
                  </div>
                </label>
              </div>

              {coberturaPopupMode === 'select' && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input type="text" placeholder="Filtrar SKUs..." value={coberturaSearchTerm} onChange={e => setCoberturaSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 text-sm bg-muted border border-border rounded-lg" />
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <button onClick={() => setCoberturaSelectedSkus(new Set(mergedData.map(r => r.sku)))} className="text-[10px] text-primary hover:underline">Selecionar todos</button>
                    <button onClick={() => setCoberturaSelectedSkus(new Set())} className="text-[10px] text-muted-foreground hover:underline">Limpar</button>
                    <span className="text-[10px] text-muted-foreground ml-auto">{coberturaSelectedSkus.size} selecionados</span>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto rounded-lg border border-border divide-y divide-border">
                    {mergedData
                      .filter(r => !coberturaSearchTerm || r.sku.includes(coberturaSearchTerm.toUpperCase()))
                      .slice(0, 100)
                      .map(row => (
                        <label key={row.sku} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer text-xs">
                          <input type="checkbox" checked={coberturaSelectedSkus.has(row.sku)}
                            onChange={e => {
                              const next = new Set(coberturaSelectedSkus);
                              e.target.checked ? next.add(row.sku) : next.delete(row.sku);
                              setCoberturaSelectedSkus(next);
                            }} className="accent-primary" />
                          <span className="font-mono font-semibold text-primary">{row.sku}</span>
                          <span className="text-muted-foreground ml-auto">
                            {row.customCobertura ? `${row.customCobertura}d ⚙` : `${diasCoberturaAlvo}d`}
                          </span>
                          {statusBadge(row.status)}
                        </label>
                      ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowCoberturaPopup(false)} className="flex-1 px-4 py-2.5 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-muted transition-colors">
                  Cancelar
                </button>
                <button onClick={handleCoberturaChange}
                  disabled={coberturaPopupMode === 'select' && coberturaSelectedSkus.size === 0}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
