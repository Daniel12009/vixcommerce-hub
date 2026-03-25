import { useState, useMemo, useCallback } from 'react';
import { Package, AlertTriangle, TrendingDown, Truck, ArrowUpDown, ArrowUp, ArrowDown, Pencil, Check, FileSpreadsheet, Search, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KpiCard } from '@/components/shared/KpiCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatNumber } from '@/lib/utils-vix';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import { EnviosTab } from './EnviosTab';

interface MergedStockRow {
  sku: string;
  venSemanal: number;
  vmd: number;
  tinyLocal: number;
  fullML: number;
  entradaPendente: number;
  emTransferencia: number;
  sugestaoEnvio: number;
  coberturaDias: number;
  status: 'ruptura' | 'critico' | 'ok';
  contas: string[];
}

type SortField = 'sku' | 'venSemanal' | 'vmd' | 'tinyLocal' | 'fullML' | 'entradaPendente' | 'emTransferencia' | 'sugestaoEnvio' | 'coberturaDias';

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
  const [diasCoberturaAlvo, setDiasCoberturaAlvo] = useState<number>(5);
  const [editingCobertura, setEditingCobertura] = useState(false);
  const [tempCobertura, setTempCobertura] = useState('5');
  const [sortField, setSortField] = useState<SortField>('coberturaDias');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'ruptura' | 'critico' | 'ok'>('all');
  const [filterConta, setFilterConta] = useState<string>('all');



  const hasFullData = !!estoqueFullItems?.length;
  const hasTinyData = !!estoqueTinyItems?.length;
  const hasAnyData = hasFullData || hasTinyData;

  const contasUnicas = useMemo(() => {
    const set = new Set<string>();
    (estoqueFullItems || []).forEach(i => {
      if (i.conta) set.add(i.conta);
    });
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
      const coberturaDias = vmd > 0 ? Number((fullML / vmd).toFixed(1)) : 999;
      const sugestaoEnvio = Math.max(0, Math.ceil((vmd * diasCoberturaAlvo) - (fullML + entradaPendente + emTransferencia)));

      let status: 'ruptura' | 'critico' | 'ok' = 'ok';
      if (fullML <= 0) status = 'ruptura';
      else if (coberturaDias < diasCoberturaAlvo) status = 'critico';

      return {
        sku,
        venSemanal: Math.round(vmd * 7),
        vmd,
        tinyLocal,
        fullML,
        entradaPendente,
        emTransferencia,
        sugestaoEnvio,
        coberturaDias,
        status,
        contas: Array.from(full?.contas || []),
      };
    });
  }, [estoqueFullItems, estoqueTinyItems, vmdBySku, diasCoberturaAlvo]);

  const totalSkus = mergedData.length;
  const skusRuptura = mergedData.filter(r => r.status === 'ruptura').length;
  const skusCriticos = mergedData.filter(r => r.status === 'critico').length;
  const skusEntradaPendente = mergedData.filter(r => r.entradaPendente > 0).length;
  const skusEmTransferencia = mergedData.filter(r => r.emTransferencia > 0).length;

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortField(field);
    setSortDir(field === 'coberturaDias' ? 'asc' : 'desc');
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="inline w-3.5 h-3.5 ml-1 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="inline w-3.5 h-3.5 ml-1" />
      : <ArrowDown className="inline w-3.5 h-3.5 ml-1" />;
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

    const filtered = mergedData.filter(row => {
      if (term && !row.sku.includes(term)) return false;
      if (filterStatus !== 'all' && row.status !== filterStatus) return false;
      if (filterConta !== 'all' && !row.contas.includes(filterConta)) return false;
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      const diff = Number(aVal) - Number(bVal);
      return sortDir === 'asc' ? diff : -diff;
    });

    return sorted;
  }, [mergedData, searchTerm, filterStatus, filterConta, sortField, sortDir]);


  const transferItems = useMemo(() => {
    if (!estoqueFullItems) return [];
    return estoqueFullItems
      .filter(i => i.emTransferencia > 0 || i.entradaPendente > 0)
      .map(i => ({ ...i, sku: i.sku.trim().toUpperCase() }))
      .sort((a, b) => (b.emTransferencia + b.entradaPendente) - (a.emTransferencia + a.entradaPendente));
  }, [estoqueFullItems]);

  return (
    <div>
      <PageHeader title="Estoque Full & Local" subtitle="Gestão logística com alertas de ruptura e controle de envios" />

      {/* Data source badges + Refresh */}
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
          <TabsTrigger value="envios">🚚 Envios & Coletas</TabsTrigger>
          <TabsTrigger value="transferencias">🔄 Transferências</TabsTrigger>
        </TabsList>

        {/* ===== ABA 1: VISÃO GERAL ===== */}
        <TabsContent value="visao-geral">
          {!hasAnyData ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center animate-fade-in">
              <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
              <h3 className="text-lg font-semibold mb-2">Nenhum dado de estoque importado</h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                Vá em <strong>Performance → Planilhas Google</strong>, adicione <strong>Estoque Full (ML)</strong> e/ou <strong>Estoque Tiny (Local)</strong>.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                <KpiCard title="Total SKUs" value={String(totalSkus)} icon={Package} delay={0} />
                <KpiCard title="Em Ruptura" value={String(skusRuptura)} icon={TrendingDown} delay={50} />
                <KpiCard title="Críticos" value={String(skusCriticos)} icon={AlertTriangle} delay={100} />
                <KpiCard title="Entrada Pendente" value={String(skusEntradaPendente)} icon={Truck} delay={150} />
                <KpiCard title="Em Transferência" value={String(skusEmTransferencia)} icon={ArrowUpDown} delay={200} />
              </div>

              {/* Controls */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
                  <span className="text-xs text-muted-foreground font-medium">Cobertura Alvo:</span>
                  {editingCobertura ? (
                    <div className="flex items-center gap-1">
                      <input type="number" min={1} max={90} value={tempCobertura} onChange={e => setTempCobertura(e.target.value)}
                        className="w-14 h-7 text-center text-sm bg-muted border border-border rounded px-1" autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') { const v = parseInt(tempCobertura); if (v > 0) setDiasCoberturaAlvo(v); setEditingCobertura(false); } }} />
                      <span className="text-xs text-muted-foreground">dias</span>
                      <button onClick={() => { const v = parseInt(tempCobertura); if (v > 0) setDiasCoberturaAlvo(v); setEditingCobertura(false); }} className="p-1 rounded hover:bg-muted transition-colors">
                        <Check className="w-3.5 h-3.5 text-[hsl(var(--vix-success))]" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { setTempCobertura(String(diasCoberturaAlvo)); setEditingCobertura(true); }} className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                      {diasCoberturaAlvo} dias <Pencil className="w-3 h-3" />
                    </button>
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

              {/* Table */}
              <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('sku')}>SKU{sortIcon('sku')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('venSemanal')}>Ven. Sem.{sortIcon('venSemanal')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('vmd')}>VMD{sortIcon('vmd')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('tinyLocal')}>Tiny{sortIcon('tinyLocal')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('fullML')}>Full{sortIcon('fullML')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('entradaPendente')}>Entrada{sortIcon('entradaPendente')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('emTransferencia')}>Transf.{sortIcon('emTransferencia')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('sugestaoEnvio')}>Sugestão{sortIcon('sugestaoEnvio')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('coberturaDias')}>Cobert.{sortIcon('coberturaDias')}</th>
                        <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayData.map(row => (
                        <tr key={row.sku} className={`border-b border-border hover:bg-muted/30 transition-colors ${row.status === 'ruptura' ? 'bg-[hsl(var(--vix-danger)/0.03)]' : row.status === 'critico' ? 'bg-[hsl(var(--vix-warning)/0.03)]' : ''}`}>
                          <td className="px-3 py-2.5 font-mono text-xs font-semibold text-primary">{row.sku}</td>
                          <td className="px-3 py-2.5 text-right text-foreground">{row.venSemanal}</td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground">{row.vmd.toFixed(1)}</td>
                          <td className="px-3 py-2.5 text-right text-foreground font-medium">{row.tinyLocal || '—'}</td>
                          <td className={`px-3 py-2.5 text-right font-medium ${row.fullML <= 0 ? 'text-[hsl(var(--vix-danger))]' : 'text-foreground'}`}>{row.fullML}</td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground">{row.entradaPendente || '—'}</td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground">{row.emTransferencia || '—'}</td>
                          <td className={`px-3 py-2.5 text-right font-semibold ${row.sugestaoEnvio > 0 ? 'text-[hsl(var(--vix-danger))]' : 'text-[hsl(var(--vix-success))]'}`}>{row.sugestaoEnvio > 0 ? `-${row.sugestaoEnvio}` : '0'}</td>
                          <td className={`px-3 py-2.5 text-right font-medium ${row.coberturaDias <= 0 ? 'text-[hsl(var(--vix-danger))]' : row.coberturaDias < diasCoberturaAlvo ? 'text-[hsl(var(--vix-warning))]' : 'text-[hsl(var(--vix-success))]'}`}>{row.coberturaDias >= 999 ? '∞' : `${row.coberturaDias}d`}</td>
                          <td className="px-3 py-2.5 text-center">{statusBadge(row.status)}</td>
                        </tr>
                      ))}
                      {displayData.length === 0 && (
                        <tr><td colSpan={10} className="py-8 text-center text-muted-foreground text-sm">{searchTerm || filterStatus !== 'all' ? 'Nenhum SKU encontrado com os filtros aplicados' : 'Nenhum dado disponível'}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* ===== ABA 2: ENVIOS & COLETAS ===== */}
        <TabsContent value="envios">
          <EnviosTab />
        </TabsContent>

        {/* ===== ABA 3: TRANSFERÊNCIAS ===== */}
        <TabsContent value="transferencias">
          {!hasFullData ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center animate-fade-in">
              <ArrowUpDown className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
              <h3 className="text-lg font-semibold mb-2">Dados de transferência não disponíveis</h3>
              <p className="text-muted-foreground text-sm">Importe a aba <strong>Full_Estoque</strong> para ver itens em transferência e entrada pendente.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
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
    </div>
  );
}
