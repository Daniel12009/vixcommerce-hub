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

type FullRowStatus = 'ATIVO' | 'ENVIANDO' | 'SEM ENVIO FULL' | 'INATIVO';

interface FullRow {
  sku: string;
  conta: string;
  fullML: number;
  entradaPendente: number;
  tinyLocal: number;
  vmd: number;
  coberturaDias: number;
  status: FullRowStatus;
}

const STATUS_CONFIG: Record<FullRowStatus, { label: string; icon: any; color: string; bg: string; border: string }> = {
  'ATIVO': { label: 'ATIVO', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  'ENVIANDO': { label: 'ENVIANDO', icon: Truck, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  'SEM ENVIO FULL': { label: 'SEM ENVIO FULL', icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  'INATIVO': { label: 'INATIVO', icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' }
};

export function EstoqueFullTab() {
  const { estoqueFullItems, estoqueTinyItems, vendas7dItems } = useSheetsData();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<FullRowStatus | 'all'>('all');
  const [filterConta, setFilterConta] = useState<string>('all');
  const [sortField, setSortField] = useState<keyof FullRow>('status');
  const [sortDir, setSortDir] = useState<'desc' | 'desc'>('desc');

  const normalizeConta = (s: string) => {
    if (!s) return '';
    const base = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (base.includes('VIAFLIX') || base.includes('VIAFIX')) return 'VIAFLIX';
    if (base.includes('GSTORNEIRAS') || base.includes('GS')) return 'GS';
    if (base.includes('MONACO') || base.includes('DECARION')) return 'MONACO';
    return base;
  };

  const vmdBySkuAndConta = useMemo(() => {
    const map = new Map<string, number>();
    if (!vendas7dItems) return map;
    vendas7dItems.forEach(item => {
      if (!item.sku) return;
      const sku = item.sku.trim().toUpperCase();
      const normConta = normalizeConta(item.conta || '');
      const qty = Number(item.quantidade || 0);
      const key = `${sku}||${normConta}`;
      map.set(key, (map.get(key) || 0) + qty);
    });
    const vmdMap = new Map<string, number>();
    map.forEach((total, key) => vmdMap.set(key, total / 7));
    return vmdMap;
  }, [vendas7dItems]);

  const mergedData = useMemo<FullRow[]>(() => {
    // Debug: Log unique account names from raw data
    if (estoqueFullItems && estoqueFullItems.length > 0) {
      const rawContas = [...new Set(estoqueFullItems.map(i => i.conta))];
      console.log('[AnunciosFull] Contas brutas no estoque_full:', rawContas);
    }

    const MAIN_ACCOUNTS = ['VIAFLIX', 'GS', 'MONACO'];
    const tinyMap = new Map<string, number>();
    (estoqueTinyItems || []).forEach(i => {
      const sku = (i.sku || '').trim().toUpperCase();
      if (sku) tinyMap.set(sku, (tinyMap.get(sku) || 0) + Number(i.quantidade || 0));
    });

    // 1. Group existing Full data by SKU and Account
    const fullDataBySku = new Map<string, Map<string, { fullML: number; entradaPendente: number }>>();
    const allSkus = new Set<string>([...tinyMap.keys()]);

    (estoqueFullItems || []).forEach(item => {
      const sku = (item.sku || '').trim().toUpperCase();
      if (!sku) return;
      allSkus.add(sku);

      const normConta = normalizeConta(item.conta || '');
      if (!normConta) return;

      const skuMap = fullDataBySku.get(sku) || new Map<string, { fullML: number; entradaPendente: number }>();
      const current = skuMap.get(normConta) || { fullML: 0, entradaPendente: 0 };
      
      current.fullML += Number(item.aptasParaVenda || 0);
      current.entradaPendente += Number(item.entradaPendente || 0);
      
      skuMap.set(normConta, current);
      fullDataBySku.set(sku, skuMap);
    });

    const rows: FullRow[] = [];

    // 2. Iterate through all unique SKUs and ensure rows for VIAFLIX, GS, MONACO
    allSkus.forEach(sku => {
      const skuFullData = fullDataBySku.get(sku);
      const tinyLocal = tinyMap.get(sku) || 0;

      // Ensure the 3 main accounts exist for every SKU
      MAIN_ACCOUNTS.forEach(conta => {
        const fullData = skuFullData?.get(conta) || { fullML: 0, entradaPendente: 0 };
        const vmd = vmdBySkuAndConta.get(`${sku}||${conta}`) || 0;
        const coberturaDias = vmd > 0 ? Number((Math.max(0, fullData.fullML) / vmd).toFixed(1)) : 999;

        let status: FullRowStatus = 'INATIVO';
        const statusFullML = Math.max(0, fullData.fullML);
        
        if (statusFullML > 0) {
          status = 'ATIVO';
        } else if (fullData.entradaPendente > 0) {
          status = 'ENVIANDO';
        } else if (tinyLocal > 0) {
          status = 'SEM ENVIO FULL';
        }

        rows.push({
          sku,
          conta,
          fullML: fullData.fullML,
          entradaPendente: fullData.entradaPendente,
          tinyLocal,
          vmd,
          coberturaDias,
          status
        });
      });

      // Also add any other accounts that might exist for this SKU but aren't in MAIN_ACCOUNTS
      if (skuFullData) {
        skuFullData.forEach((fullData, conta) => {
          if (!MAIN_ACCOUNTS.includes(conta)) {
             const vmd = vmdBySkuAndConta.get(`${sku}||${conta}`) || 0;
             const coberturaDias = vmd > 0 ? Number((Math.max(0, fullData.fullML) / vmd).toFixed(1)) : 999;
             let status: FullRowStatus = 'INATIVO';
             const statusFullML = Math.max(0, fullData.fullML);
             
             if (statusFullML > 0) status = 'ATIVO';
             else if (fullData.entradaPendente > 0) status = 'ENVIANDO';
             else if (tinyLocal > 0) status = 'SEM ENVIO FULL';

             rows.push({
               sku, conta, fullML: fullData.fullML, entradaPendente: fullData.entradaPendente,
               tinyLocal, vmd, coberturaDias, status
             });
          }
        });
      }
    });

    return rows;
  }, [estoqueFullItems, estoqueTinyItems, vmdBySkuAndConta]);

  const stats = useMemo(() => {
    return {
      total: mergedData.length,
      ativos: mergedData.filter(i => i.status === 'ATIVO').length,
      enviando: mergedData.filter(i => i.status === 'ENVIANDO').length,
      semEnvio: mergedData.filter(i => i.status === 'SEM ENVIO FULL').length,
      inativos: mergedData.filter(i => i.status === 'INATIVO').length,
      totalFull: mergedData.reduce((acc, i) => acc + Math.max(0, i.fullML), 0),
      lastUpdate: localStorage.getItem('vix_estoque_full_data_time') || '---'
    };
  }, [mergedData]);

  const displayData = useMemo(() => {
    const term = searchTerm.trim().toUpperCase();
    const filtered = mergedData.filter(row => {
      if (term && !row.sku.includes(term)) return false;
      if (filterStatus !== 'all' && row.status !== filterStatus) return false;
      if (filterConta !== 'all' && row.conta !== filterConta) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      const order: Record<FullRowStatus, number> = { 'INATIVO': 0, 'SEM ENVIO FULL': 1, 'ENVIANDO': 2, 'ATIVO': 3 };
      if (sortField === 'status') {
        const valA = order[a.status];
        const valB = order[b.status];
        if (valA !== valB) return sortDir === 'asc' ? valA - valB : valB - valA;
        return b.fullML - a.fullML;
      }
      const valA = a[sortField];
      const valB = b[sortField];
      if (typeof valA === 'string' && typeof valB === 'string') return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      return sortDir === 'asc' ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
    });
  }, [mergedData, searchTerm, filterStatus, filterConta, sortField, sortDir]);

  const toggleSort = (field: keyof FullRow) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'sku' || field === 'conta' ? 'asc' : 'desc');
    }
  };

  const sortIcon = (field: keyof FullRow) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
        <KpiCard title="Ativos" value={stats.ativos.toLocaleString()} icon={CheckCircle} valueColor="text-emerald-400" delay={0} />
        <KpiCard title="Enviando" value={stats.enviando.toLocaleString()} icon={Truck} valueColor="text-blue-400" delay={50} />
        <KpiCard title="Sem Envio" value={stats.semEnvio.toLocaleString()} icon={AlertTriangle} valueColor="text-yellow-400" delay={100} />
        <KpiCard title="Inativos" value={stats.inativos.toLocaleString()} icon={XCircle} valueColor="text-red-400" delay={150} />
        <KpiCard title="Unid. Full" value={stats.totalFull.toLocaleString()} icon={LayoutGrid} delay={200} />
        <KpiCard title="Último Upload" value={stats.lastUpdate} icon={Clock} delay={250} />
      </div>

      <div className="flex flex-wrap items-center gap-4 bg-card border border-border p-4 rounded-2xl shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Buscar SKU..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:border-primary/50 transition-colors" />
        </div>
        <div className="flex flex-wrap items-center gap-1 bg-muted/50 p-1 rounded-xl border border-border">
          {(['all', 'ATIVO', 'ENVIANDO', 'SEM ENVIO FULL', 'INATIVO'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${filterStatus === s ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {s === 'all' ? 'TODOS' : s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select value={filterConta} onChange={e => setFilterConta(e.target.value)}
            className="bg-muted/50 border border-border rounded-xl px-3 py-2 text-xs text-foreground outline-none focus:border-primary/50 cursor-pointer">
            <option value="all">Todas as Contas</option>
            <option value="VIAFLIX">VIAFLIX</option>
            <option value="GS">GS</option>
            <option value="MONACO">MONACO</option>
            <option value="LOCAL">LOCAL</option>
          </select>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left py-4 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider cursor-pointer" onClick={() => toggleSort('sku')}>SKU {sortIcon('sku')}</th>
                <th className="text-left py-4 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider cursor-pointer" onClick={() => toggleSort('conta')}>Conta {sortIcon('conta')}</th>
                <th className="text-right py-4 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider cursor-pointer" onClick={() => toggleSort('fullML')}>Full {sortIcon('fullML')}</th>
                <th className="text-right py-4 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider cursor-pointer" onClick={() => toggleSort('entradaPendente')}>Entrada {sortIcon('entradaPendente')}</th>
                <th className="text-right py-4 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider cursor-pointer" onClick={() => toggleSort('tinyLocal')}>Tiny Local {sortIcon('tinyLocal')}</th>
                <th className="text-right py-4 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider cursor-pointer" onClick={() => toggleSort('vmd')}>VMD {sortIcon('vmd')}</th>
                <th className="text-right py-4 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider cursor-pointer" onClick={() => toggleSort('coberturaDias')}>Cobertura {sortIcon('coberturaDias')}</th>
                <th className="text-center py-4 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider cursor-pointer" onClick={() => toggleSort('status')}>Status {sortIcon('status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {displayData.map((row, idx) => {
                const config = STATUS_CONFIG[row.status];
                const Icon = config.icon;
                return (
                  <tr key={`${row.sku}-${row.conta}-${idx}`} className="hover:bg-muted/30 transition-colors">
                    <td className="py-4 px-4 font-mono text-xs font-semibold text-primary">{row.sku}</td>
                    <td className="py-4 px-4 text-xs text-muted-foreground">{row.conta}</td>
                    <td className={`py-4 px-4 text-right font-bold ${row.fullML <= 0 ? 'text-red-400' : 'text-foreground'}`}>{row.fullML.toLocaleString()}</td>
                    <td className="py-4 px-4 text-right text-muted-foreground">{row.entradaPendente > 0 ? row.entradaPendente.toLocaleString() : '—'}</td>
                    <td className="py-4 px-4 text-right text-muted-foreground">{row.tinyLocal > 0 ? row.tinyLocal.toLocaleString() : '—'}</td>
                    <td className="py-4 px-4 text-right text-muted-foreground">{row.vmd.toFixed(1)}</td>
                    <td className={`py-4 px-4 text-right font-medium ${row.coberturaDias < 10 ? 'text-red-400' : row.coberturaDias < 20 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                      {row.coberturaDias >= 999 ? '∞' : `${row.coberturaDias}d`}
                    </td>
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
