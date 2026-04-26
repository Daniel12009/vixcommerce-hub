import { useMemo, useState, useEffect, useRef } from 'react';
import { Package, TrendingUp, TrendingDown, Target, Shield, Info, Pencil, Check, Upload, Download } from 'lucide-react';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import { useVendasSKUEstoqueFromDB } from '@/hooks/useVendasFromDB';
import { formatNumber } from '@/lib/utils-vix';
import { KpiCard } from '@/components/shared/KpiCard';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface CoberturaRow {
  sku: string;
  vmdAtual: number;
  vmdMeta: number;
  estoqueFull: number;
  estoqueTiny: number;
  estoqueTotal: number;
  estoqueSeguranca: number;
  coberturaAlvo: number;
  performance: 'oversales' | 'undersales' | 'ok';
  compraSugerida: number;
}

// Arredonda VMD para inteiro ou meio (.5) — evita 32.3333
function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

// Normaliza nomes de conta para casar entre vendas (DB) e estoque Full
// Estoque Full usa: (VIAFLIX), (GS), (MONACO)
// Vendas DB usa: "Via Flix", "VIA FLIX", "Via Fix", "Via Flix - A Casa...", "GS TORNEIRAS", "DECARION TORNEIRAS", "Monaco Metais"
function normalizeConta(c: string): string {
  if (!c) return '';
  // remove parênteses, espaços, hífens, pontuação; uppercase
  const u = c.trim().toUpperCase().replace(/[()\-\s.,]/g, '');
  // VIAFLIX, VIAFIX (typo), VIAFLIXACASADASTORNEIRAS -> VIAFLIX
  if (u.startsWith('VIAFLIX') || u.startsWith('VIAFIX')) return 'VIAFLIX';
  // GS, GSTORNEIRAS -> GS
  if (u === 'GS' || u.startsWith('GSTORNEIRAS') || u.startsWith('GS')) return 'GS';
  // DECARION..., MONACO... -> MONACO (estoque Full mapeia DECARION como MONACO)
  if (u.startsWith('DECARION') || u.startsWith('MONACO')) return 'MONACO';
  return u;
}

export function CoberturaFullTab() {
  const { estoqueFullItems } = useSheetsData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // VMD baseada nos últimos 15 dias
  const VMD_DIAS = 15;
  const dateFim = new Date().toISOString().split('T')[0];
  const dateIni = new Date(Date.now() - VMD_DIAS * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const { data: vmdSalesData } = useVendasSKUEstoqueFromDB(dateIni, dateFim);

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

    // VMD agregada por SKU (soma de TODAS as contas) — últimos 15 dias
    const sqlVmdBySku = new Map<string, number>();
    vmdSalesData.forEach(s => {
      const sku = s.sku.trim().toUpperCase();
      const vmd = (Number(s.quantidade) || 0) / VMD_DIAS;
      sqlVmdBySku.set(sku, (sqlVmdBySku.get(sku) || 0) + vmd);
    });
    console.log('[CoberturaFull] VMD 15d:', sqlVmdBySku.size, 'SKUs');

    // Estoque Full agregado por SKU (soma de todas as contas)
    const stockBySku = new Map<string, number>();
    estoqueFullItems.forEach(i => {
      const sku = i.sku.trim().toUpperCase();
      stockBySku.set(sku, (stockBySku.get(sku) || 0) + Number(i.aptasParaVenda || 0));
    });

    return Array.from(stockBySku.entries()).map(([sku, full]) => {
      const vmdAtual = sqlVmdBySku.get(sku) ?? 0;
      const vmdMeta = metasVMD[sku] || 0;

      const coberturaAlvo = 30;
      const estoqueSeguranca = Math.ceil(vmdAtual * 7);

      let performance: 'oversales' | 'undersales' | 'ok' = 'ok';
      if (vmdMeta > 0) {
        if (vmdAtual > vmdMeta * 1.2) performance = 'oversales';
        else if (vmdAtual < vmdMeta * 0.8) performance = 'undersales';
      }

      const compraSugerida = Math.max(0, Math.ceil((vmdAtual * 60) - full));

      return {
        sku, vmdAtual, vmdMeta,
        estoqueFull: full, estoqueSeguranca, coberturaAlvo,
        performance, compraSugerida,
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

  const handleSaveMeta = (sku: string) => {
    const val = parseFloat(tempMeta);
    if (isNaN(val)) { toast.error('Valor inválido'); return; }
    setMetasVMD(prev => ({ ...prev, [sku]: val }));
    setEditingSku(null);
    toast.success('Meta atualizada');
  };

  const handleUploadMetas = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws, { header: 1, defval: '' });
      
      const novasMetas: Record<string, number> = { ...metasVMD };
      let importados = 0;
      let ignorados = 0;
      
      // Detecta header (linha com "SKU" ou "VMD")
      const startRow = rows.findIndex((r: any[]) => 
        r.some(c => String(c).toUpperCase().includes('SKU'))
      );
      const dataRows = startRow >= 0 ? rows.slice(startRow + 1) : rows;
      
      dataRows.forEach((row: any[]) => {
        const sku = String(row[0] || '').trim().toUpperCase();
        const vmdRaw = String(row[1] || '').trim().replace(',', '.');
        const vmd = parseFloat(vmdRaw);
        if (!sku || isNaN(vmd) || vmd < 0) { ignorados++; return; }
        novasMetas[sku] = vmd;
        importados++;
      });
      
      setMetasVMD(novasMetas);
      toast.success(`${importados} metas importadas${ignorados > 0 ? ` (${ignorados} ignoradas)` : ''}`);
    } catch (err: any) {
      toast.error('Erro ao ler planilha: ' + err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownloadTemplate = () => {
    const skusUnicos = Array.from(new Set(mergedData.map(r => r.sku)));
    const data = [
      ['SKU', 'VMD'],
      ...skusUnicos.map(sku => [sku, metasVMD[sku] || ''])
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Metas VMD');
    XLSX.writeFile(wb, 'template_metas_vmd.xlsx');
    toast.success('Template baixado');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard title="VMD Total (15d SQL)" value={kpis.totalVmd.toFixed(1)} icon={Package} delay={0} />
        <KpiCard title="Oversales" value={String(kpis.oversales)} icon={TrendingUp} valueColor="text-[hsl(var(--vix-danger))]" delay={100} />
        <KpiCard title="Undersales" value={String(kpis.undersales)} icon={TrendingDown} valueColor="text-[hsl(var(--vix-warning))]" delay={200} />
        <KpiCard title="Objetivo Compra (60d)" value={formatNumber(kpis.totalSugerido)} icon={Target} delay={300} />
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Planejamento de Cobertura & Metas</h3>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls,.csv"
              onChange={handleUploadMetas}
              className="hidden"
            />
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Baixar Template
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" /> Importar Metas VMD (.xlsx)
            </button>
          </div>
        </div>
        <div className="px-4 py-2 border-b border-border bg-muted/10 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[hsl(var(--vix-danger))]" /> Oversales (+20% meta)</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[hsl(var(--vix-warning))]" /> Undersales (-20% meta)</span>
          <span className="ml-auto italic">Planilha: 2 colunas — A=SKU, B=VMD (decimal com . ou ,)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">SKU</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">VMD Atual (SQL)</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">
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
                <tr key={row.sku} className="border-b border-border hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{row.sku}</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">{row.vmdAtual.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">
                    {editingSku === row.sku ? (
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number" step="0.1"
                          value={tempMeta}
                          onChange={e => setTempMeta(e.target.value)}
                          className="w-16 h-7 text-right text-xs bg-muted border border-primary rounded px-1"
                          autoFocus
                          onKeyDown={e => e.key === 'Enter' && handleSaveMeta(row.sku)}
                        />
                        <button onClick={() => handleSaveMeta(row.sku)} className="p-1 hover:bg-primary/10 rounded"><Check className="w-3 h-3 text-[hsl(var(--vix-success))]" /></button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => { setEditingSku(row.sku); setTempMeta(String(row.vmdMeta)); }}
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
