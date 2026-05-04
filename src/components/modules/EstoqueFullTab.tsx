import React, { useState, useMemo } from 'react';
import { 
  Package, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Search, 
  Filter, 
  Truck, 
  TrendingUp, 
  Clock,
  LayoutGrid,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import { KpiCard } from '@/components/shared/KpiCard';

type FullStatusGeral = 'ATIVO' | 'PARCIAL' | 'ENVIANDO' | 'SEM ENVIO FULL' | 'INATIVO';

interface AccountStatus {
  fullML: number;
  entradaPendente: number;
  label: string;
  type: 'ativo' | 'enviando' | 'sem_envio' | 'inativo';
}

interface SkuRow {
  sku: string;
  viaflix: AccountStatus;
  gs: AccountStatus;
  monaco: AccountStatus;
  tinyLocal: number;
  vmd: number;
  statusGeral: FullStatusGeral;
}

const STATUS_GERAL_CONFIG: Record<FullStatusGeral, { label: string; icon: any; color: string; bg: string; border: string }> = {
  'ATIVO': { label: 'ATIVO', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  'PARCIAL': { label: 'PARCIAL', icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  'ENVIANDO': { label: 'ENVIANDO', icon: Truck, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  'SEM ENVIO FULL': { label: 'SEM ENVIO FULL', icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  'INATIVO': { label: 'INATIVO', icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' }
};

export function EstoqueFullTab() {
  const { estoqueFullItems, estoqueTinyItems, vendas7dItems } = useSheetsData();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<FullStatusGeral | 'all'>('all');
  const [sortField, setSortField] = useState<keyof SkuRow>('statusGeral');
  const [sortDir, setSortDir] = useState<'desc' | 'desc'>('desc');

  const ACCOUNTS = ['VIAFLIX', 'GS', 'MONACO'] as const;

  const normalizeConta = (s: string) => {
    if (!s) return '';
    const base = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (base.includes('VIAFLIX') || base.includes('VIAFIX')) return 'VIAFLIX';
    if (base.includes('GSTORNEIRAS') || base.includes('GS')) return 'GS';
    if (base.includes('MONACO') || base.includes('DECARION')) return 'MONACO';
    return base;
  };

  const vmdBySku = useMemo(() => {
    const map = new Map<string, number>();
    if (!vendas7dItems) return map;
    vendas7dItems.forEach(item => {
      if (!item.sku) return;
      const sku = item.sku.trim().toUpperCase();
      map.set(sku, (map.get(sku) || 0) + Number(item.quantidade || 0));
    });
    const vmdMap = new Map<string, number>();
    map.forEach((total, sku) => vmdMap.set(sku, total / 7));
    return vmdMap;
  }, [vendas7dItems]);

  const mergedData = useMemo<SkuRow[]>(() => {
    const skuMap = new Map<string, { full: Record<string, { q: number; e: number }>; tiny: number }>();

    // 1. Tiny Data
    (estoqueTinyItems || []).forEach(i => {
      const sku = (i.sku || '').trim().toUpperCase();
      if (!sku) return;
      const cur = skuMap.get(sku) || { full: {}, tiny: 0 };
      cur.tiny += Number(i.quantidade || 0);
      skuMap.set(sku, cur);
    });

    // 2. Full Data
    (estoqueFullItems || []).forEach(i => {
      const sku = (i.sku || '').trim().toUpperCase();
      if (!sku) return;
      const normConta = normalizeConta(i.conta || '');
      const cur = skuMap.get(sku) || { full: {}, tiny: 0 };
      if (!cur.full[normConta]) cur.full[normConta] = { q: 0, e: 0 };
      cur.full[normConta].q += Number(i.aptasParaVenda || 0);
      cur.full[normConta].e += Number(i.entradaPendente || 0);
      skuMap.set(sku, cur);
    });

    return Array.from(skuMap.entries()).map(([sku, data]) => {
      const getAccStatus = (acc: string): AccountStatus => {
        const info = data.full[acc];
        const q = info ? info.q : 0;
        const e = info ? info.e : 0;
        const tiny = data.tiny;

        if (q > 0) return { fullML: q, entradaPendente: e, label: String(q), type: 'ativo' };
        if (e > 0) return { fullML: q, entradaPendente: e, label: `🚚 ${e}`, type: 'enviando' };
        if (tiny > 0) return { fullML: q, entradaPendente: e, label: '⚠️ 0', type: 'sem_envio' };
        return { fullML: q, entradaPendente: e, label: '—', type: 'inativo' };
      };

      const viaflix = getAccStatus('VIAFLIX');
      const gs = getAccStatus('GS');
      const monaco = getAccStatus('MONACO');
      
      // Determination of "Accounts that sell this SKU"
      // Rule: Any account that has fullML > 0, entradaPendente > 0, OR has vmd record for this SKU
      // However, to keep it simple and match the request example, we check the 3 main accounts that HAVE records.
      const relevantAccs = [viaflix, gs, monaco].filter(a => a.type !== 'inativo');
      const activeCount = relevantAccs.filter(a => a.type === 'ativo').length;
      const sendingCount = relevantAccs.filter(a => a.type === 'enviando').length;

      let statusGeral: FullStatusGeral = 'INATIVO';
      if (relevantAccs.length > 0) {
        if (activeCount === relevantAccs.length) statusGeral = 'ATIVO';
        else if (activeCount > 0) statusGeral = 'PARCIAL';
        else if (sendingCount > 0) statusGeral = 'ENVIANDO';
        else statusGeral = 'SEM ENVIO FULL';
      }

      return {
        sku,
        viaflix,
        gs,
        monaco,
        tinyLocal: data.tiny,
        vmd: vmdBySku.get(sku) || 0,
        statusGeral
      };
    });
  }, [estoqueFullItems, estoqueTinyItems, vmdBySku]);

  const stats = useMemo(() => {
    return {
      total: mergedData.length,
      ativos: mergedData.filter(i => i.statusGeral === 'ATIVO').length,
      parcial: mergedData.filter(i => i.statusGeral === 'PARCIAL').length,
      enviando: mergedData.filter(i => i.statusGeral === 'ENVIANDO').length,
      semEnvio: mergedData.filter(i => i.statusGeral === 'SEM ENVIO FULL').length,
      inativos: mergedData.filter(i => i.statusGeral === 'INATIVO').length,
      totalFull: (estoqueFullItems || []).reduce((acc, i) => acc + Math.max(0, Number(i.aptasParaVenda || 0)), 0),
      lastUpdate: localStorage.getItem('vix_estoque_full_data_time') || '---'
    };
  }, [mergedData, estoqueFullItems]);

  const displayData = useMemo(() => {
    const term = searchTerm.trim().toUpperCase();
    const filtered = mergedData.filter(row => {
      if (term && !row.sku.includes(term)) return false;
      if (filterStatus !== 'all' && row.statusGeral !== filterStatus) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      const order: Record<FullStatusGeral, number> = { 'INATIVO': 0, 'SEM ENVIO FULL': 1, 'ENVIANDO': 2, 'PARCIAL': 3, 'ATIVO': 4 };
      if (sortField === 'statusGeral') {
        const valA = order[a.statusGeral];
        const valB = order[b.statusGeral];
        if (valA !== valB) return sortDir === 'asc' ? valA - valB : valB - valA;
        return b.vmd - a.vmd;
      }
      const valA = a[sortField];
      const valB = b[sortField];
      if (typeof valA === 'string' && typeof valB === 'string') return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      return sortDir === 'asc' ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
    });
  }, [mergedData, searchTerm, filterStatus, sortField, sortDir]);

  const renderAccCell = (st: AccountStatus) => {
    const colors = {
      ativo: 'text-emerald-400 font-bold',
      enviando: 'text-blue-400 font-medium',
      sem_envio: 'text-yellow-400 font-medium',
      inativo: 'text-red-500/50'
    };
    return <span className={colors[st.type]}>{st.label}</span>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-3">
        <KpiCard title="Ativos" value={stats.ativos.toLocaleString()} icon={CheckCircle} valueColor="text-emerald-400" delay={0} />
        <KpiCard title="Parcial" value={stats.parcial.toLocaleString()} icon={AlertTriangle} valueColor="text-orange-400" delay={50} />
        <KpiCard title="Enviando" value={stats.enviando.toLocaleString()} icon={Truck} valueColor="text-blue-400" delay={100} />
        <KpiCard title="Sem Envio" value={stats.semEnvio.toLocaleString()} icon={AlertTriangle} valueColor="text-yellow-400" delay={150} />
        <KpiCard title="Inativos" value={stats.inativos.toLocaleString()} icon={XCircle} valueColor="text-red-400" delay={200} />
        <KpiCard title="Unid. Full" value={stats.totalFull.toLocaleString()} icon={LayoutGrid} delay={250} />
        <KpiCard title="Último Upload" value={stats.lastUpdate} icon={Clock} delay={300} />
      </div>

      <div className="flex flex-wrap items-center gap-4 bg-card border border-border p-4 rounded-2xl shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Buscar SKU..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:border-primary/50 transition-colors" />
        </div>
        <div className="flex flex-wrap items-center gap-1 bg-muted/50 p-1 rounded-xl border border-border">
          {(['all', 'ATIVO', 'PARCIAL', 'ENVIANDO', 'SEM ENVIO FULL', 'INATIVO'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${filterStatus === s ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {s === 'all' ? 'TODOS' : s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left py-4 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider cursor-pointer" onClick={() => {setSortField('sku'); setSortDir(prev=>prev==='asc'?'desc':'asc')}}>SKU</th>
                <th className="text-center py-4 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">VIAFLIX</th>
                <th className="text-center py-4 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">GS</th>
                <th className="text-center py-4 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">MONACO</th>
                <th className="text-right py-4 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Tiny Local</th>
                <th className="text-right py-4 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">VMD</th>
                <th className="text-center py-4 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider cursor-pointer" onClick={() => {setSortField('statusGeral'); setSortDir(prev=>prev==='asc'?'desc':'asc')}}>Status Geral</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {displayData.map((row) => {
                const config = STATUS_GERAL_CONFIG[row.statusGeral];
                const Icon = config.icon;
                return (
                  <tr key={row.sku} className="hover:bg-muted/30 transition-colors">
                    <td className="py-4 px-4 font-mono text-xs font-semibold text-primary">{row.sku}</td>
                    <td className="py-4 px-4 text-center">{renderAccCell(row.viaflix)}</td>
                    <td className="py-4 px-4 text-center">{renderAccCell(row.gs)}</td>
                    <td className="py-4 px-4 text-center">{renderAccCell(row.monaco)}</td>
                    <td className="py-4 px-4 text-right text-muted-foreground">{row.tinyLocal.toLocaleString()}</td>
                    <td className="py-4 px-4 text-right text-muted-foreground">{row.vmd.toFixed(1)}</td>
                    <td className="py-4 px-4 text-center">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${config.bg} ${config.color} ${config.border}`}>
                        <Icon className="w-3 h-3" /> {config.label}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
