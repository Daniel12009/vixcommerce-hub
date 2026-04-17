import { useMemo, useState, useEffect } from 'react';
import { Package, TrendingUp, TrendingDown, Target, Shield, Info, Pencil, Check, X } from 'lucide-react';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import { useVendasSKUEstoqueFromDB } from '@/hooks/useVendasFromDB';
import { formatNumber } from '@/lib/utils-vix';
import { KpiCard } from '@/components/shared/KpiCard';
import { toast } from 'sonner';

interface CoberturaRow {
  sku: string;
  conta: string;
  vmdAtual: number;
  vmdMeta: number;
  estoqueFull: number;
  estoqueSeguranca: number;
  coberturaAlvo: number;
  performance: 'oversales' | 'undersales' | 'ok';
  compraSugerida: number;
}

export function CoberturaFullTab() {
  const { estoqueFullItems } = useSheetsData();
  
  // Fetch real VMD from SQL for the last 30 days
  const dateFim = new Date().toISOString().split('T')[0];
  const dateIni = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const { data: vmdSalesData, loading: loadingSales } = useVendasSKUEstoqueFromDB(dateIni, dateFim);

  // States for local overrides (persisted in localStorage)
  const [metasVMD, setMetasVMD] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('vix_vmd_metas') || '{}'); } catch { return {}; }
  });
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [tempMeta, setTempMeta] = useState('');

  useEffect(() => {
    localStorage.setItem('vix_vmd_metas', JSON.stringify(metasVMD));
  }, [metasVMD]);

  const mergedData = useMemo<CoberturaRow[]>(() => {
    if (!estoqueFullItems) return [];

    // Group sales from SQL by SKU and Account
    const sqlVmdMap = new Map<string, number>();
    vmdSalesData.forEach(s => {
      const k = `${s.sku.trim().toUpperCase()}||${s.conta.trim()}`;
      sqlVmdMap.set(k, (s.quantidade || 0) / 30);
    });

    // Group actual stock
    const stockMap = new Map<string, { full: number; conta: string; sku: string }>();
    estoqueFullItems.forEach(i => {
      const sku = i.sku.trim().toUpperCase();
      const conta = i.conta.trim();
      const k = `${sku}||${conta}`;
      const cur = stockMap.get(k) || { full: 0, conta, sku };
      cur.full += Number(i.aptasParaVenda || 0);
      stockMap.set(k, cur);
    });

    return Array.from(stockMap.values()).map(item => {
      const vmdAtual = sqlVmdMap.get(`${item.sku}||${item.conta}`) || 0;
      const vmdMeta = metasVMD[`${item.sku}||${item.conta}`] || metasVMD[item.sku] || 0;
      
      const coberturaAlvo = 30; // Default
      const estoqueSeguranca = Math.ceil(vmdAtual * 7); // 7 days security
      
      let performance: 'oversales' | 'undersales' | 'ok' = 'ok';
      if (vmdMeta > 0) {
        if (vmdAtual > vmdMeta * 1.2) performance = 'oversales';
        else if (vmdAtual < vmdMeta * 0.8) performance = 'undersales';
      }

      const compraSugerida = Math.max(0, Math.ceil((vmdAtual * 60) - item.full));

      return {
        sku: item.sku,
        conta: item.conta,
        vmdAtual,
        vmdMeta,
        estoqueFull: item.full,
        estoqueSeguranca,
        coberturaAlvo,
        performance,
        compraSugerida
      };
    }).sort((a, b) => b.vmdAtual - a.vmdAtual);
  }, [estoqueFullItems, vmdSalesData, metasVMD]);

  const kpis = useMemo(() => {
    const totalVmd = mergedData.reduce((acc, curr) => acc + curr.vmdAtual, 0);
    const oversales = mergedData.filter(m => m.performance === 'oversales').length;
    const undersales = mergedData.filter(m => m.performance === 'undersales').length;
    const totalSugerido = mergedData.reduce((acc, curr) => acc + curr.compraSugerida, 0);

    return { totalVmd, oversales, undersales, totalSugerido };
  }, [mergedData]);

  const handleSaveMeta = (sku: string, conta: string) => {
    const val = parseFloat(tempMeta);
    if (isNaN(val)) { toast.error('Valor inválido'); return; }
    setMetasVMD(prev => ({ ...prev, [`${sku}||${conta}`]: val }));
    setEditingSku(null);
    toast.success('Meta atualizada');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard title="VMD Total (30d SQL)" value={kpis.totalVmd.toFixed(1)} icon={Package} delay={0} />
        <KpiCard title="Oversales" value={String(kpis.oversales)} icon={TrendingUp} valueColor="text-[hsl(var(--vix-danger))]" delay={100} />
        <KpiCard title="Undersales" value={String(kpis.undersales)} icon={TrendingDown} valueColor="text-[hsl(var(--vix-warning))]" delay={200} />
        <KpiCard title="Objetivo Compra (60d)" value={formatNumber(kpis.totalSugerido)} icon={Target} delay={300} />
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Planejamento de Cobertura & Metas</h3>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[hsl(var(--vix-danger))]" /> Oversales (+20% meta)</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[hsl(var(--vix-warning))]" /> Undersales (-20% meta)</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Conta</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">SKU</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">VMD Atual (SQL)</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground group">
                  Meta VMD <Info className="inline w-3 h-3 ml-1 opacity-50 cursor-help" />
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Estoque Full</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Est. Segurança</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Sugestão Compra (60d)</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status Performance</th>
              </tr>
            </thead>
            <tbody>
              {mergedData.map((row) => (
                <tr key={`${row.sku}-${row.conta}`} className="border-b border-border hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-3 text-xs text-muted-foreground">{row.conta}</td>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{row.sku}</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">{row.vmdAtual.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">
                    {editingSku === `${row.sku}||${row.conta}` ? (
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number" step="0.1"
                          value={tempMeta}
                          onChange={e => setTempMeta(e.target.value)}
                          className="w-16 h-7 text-right text-xs bg-muted border border-primary rounded px-1"
                          autoFocus
                          onKeyDown={e => e.key === 'Enter' && handleSaveMeta(row.sku, row.conta)}
                        />
                        <button onClick={() => handleSaveMeta(row.sku, row.conta)} className="p-1 hover:bg-primary/10 rounded"><Check className="w-3 h-3 text-[hsl(var(--vix-success))]" /></button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => { setEditingSku(`${row.sku}||${row.conta}`); setTempMeta(String(row.vmdMeta)); }}
                        className="group flex items-center justify-end gap-1 ml-auto text-muted-foreground hover:text-primary transition-colors"
                      >
                        {row.vmdMeta > 0 ? row.vmdMeta : 'Definir'}
                        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{row.estoqueFull}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{row.estoqueSeguranca}</td>
                  <td className="px-4 py-3 text-right font-bold text-[hsl(var(--vix-success))]">{row.compraSugerida > 0 ? formatNumber(row.compraSugerida) : '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {row.performance === 'oversales' && <span className="px-2 py-1 rounded-full bg-[hsl(var(--vix-danger)/0.1)] text-[hsl(var(--vix-danger))] text-[10px] font-bold">OVERSALES</span>}
                    {row.performance === 'undersales' && <span className="px-2 py-1 rounded-full bg-[hsl(var(--vix-warning)/0.1)] text-[hsl(var(--vix-warning))] text-[10px] font-bold">UNDERSALES</span>}
                    {row.performance === 'ok' && <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">BALANCEADO</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
