import { useMemo, useState, useEffect, useRef, Fragment } from 'react';
import { Package, TrendingUp, TrendingDown, Target, Shield, Info, Pencil, Check, Upload, Download, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import { useVendasSKUEstoqueFromDB } from '@/hooks/useVendasFromDB';
import { formatNumber } from '@/lib/utils-vix';
import { KpiCard } from '@/components/shared/KpiCard';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts';

interface CoberturaRow {
  sku: string;
  vmdAtual: number;
  vmdMeta: number;
  estoqueFull: number;
  estoqueTiny: number;
  estoqueTotal: number;
  performance: 'oversales' | 'undersales' | 'ok';
}

const PERIODOS_PRESET = [7, 15, 30, 40, 60, 90, 120] as const;

// Cores fixas para contas no gráfico (por SKU)
const CONTA_COLORS: Record<string, string> = {
  VIAFLIX: 'hsl(var(--primary))',
  GS: 'hsl(var(--vix-success))',
  MONACO: 'hsl(var(--vix-warning))',
};
// Cores por origem (gráfico global)
const ORIGEM_COLORS: Record<string, string> = {
  'Mercado Livre': 'hsl(var(--primary))',
  'Shopee': '#ee4d2d',
  'Shein': '#000000',
  'Amazon Seller': '#ff9900',
  'TikTok Shop': '#25f4ee',
  'Temu': '#fb7701',
  'Atacado': 'hsl(var(--vix-success))',
  'Atacado VF': '#16a34a',
  'Loja Fisica VF': '#7c3aed',
  'Showroom': '#a855f7',
};
const FALLBACK_COLORS = ['#8b5cf6', '#ec4899', '#06b6d4', '#f59e0b', '#84cc16', '#f43f5e'];

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

function normalizeConta(c: string): string {
  if (!c) return '';
  const u = c.trim().toUpperCase().replace(/[()\-\s.,]/g, '');
  if (u.startsWith('VIAFLIX') || u.startsWith('VIAFIX')) return 'VIAFLIX';
  if (u === 'GS' || u.startsWith('GSTORNEIRAS') || u.startsWith('GS')) return 'GS';
  if (u.startsWith('DECARION') || u.startsWith('MONACO')) return 'MONACO';
  return u;
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function CoberturaFullTab() {
  const { estoqueFullItems, estoqueTinyItems } = useSheetsData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ===== Filtros =====
  const [periodo, setPeriodo] = useState<number>(15);
  const [periodoCustom, setPeriodoCustom] = useState<string>('');
  const [filtroConta, setFiltroConta] = useState<string>('all');
  const [filtroOrigem, setFiltroOrigem] = useState<string>('all');
  const [busca, setBusca] = useState<string>('');

  // Range de datas baseado no período selecionado
  const { dateIni, dateFim, diasReais } = useMemo(() => {
    const dias = periodo;
    const fim = new Date();
    const ini = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
    return {
      dateIni: ini.toISOString().split('T')[0],
      dateFim: fim.toISOString().split('T')[0],
      diasReais: dias,
    };
  }, [periodo]);

  const { data: vmdSalesData } = useVendasSKUEstoqueFromDB(dateIni, dateFim);

  // ===== Metas (localStorage) =====
  const [metasVMD, setMetasVMD] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('vix_vmd_metas') || '{}'); } catch { return {}; }
  });
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [tempMeta, setTempMeta] = useState('');
  useEffect(() => {
    localStorage.setItem('vix_vmd_metas', JSON.stringify(metasVMD));
  }, [metasVMD]);

  // ===== Sanfona expandida =====
  const [expandedSku, setExpandedSku] = useState<string | null>(null);
  const [salesBySku, setSalesBySku] = useState<Map<string, { date: string; conta: string; qtd: number }[]>>(new Map());
  const [loadingSku, setLoadingSku] = useState<string | null>(null);

  // ===== Vendas globais (todos SKUs) por dia =====
  const [globalDaily, setGlobalDaily] = useState<{ date: string; sku: string; conta: string; origem: string; qtd: number }[]>([]);
  const [loadingGlobal, setLoadingGlobal] = useState(false);

  useEffect(() => {
    let active = true;
    async function fetchGlobal() {
      setLoadingGlobal(true);
      try {
        const iniISO = dateIni;
        const fimISO = dateFim;
        const PAGE = 1000;
        let from = 0;
        let allRows: any[] = [];
        for (let p = 0; p < 200; p++) {
          const { data: rows, error } = await (supabase as any)
            .from('vendas_items')
            .select('sku, conta, origem, quantidade, data')
            .gte('data', iniISO)
            .lte('data', fimISO + 'T23:59:59')
            .range(from, from + PAGE - 1);
          if (error) throw error;
          if (!rows || rows.length === 0) break;
          allRows = allRows.concat(rows);
          if (rows.length < PAGE) break;
          from += PAGE;
        }
        if (allRows.length === 0) {
          from = 0;
          for (let p = 0; p < 200; p++) {
            const { data: rows, error } = await (supabase as any)
              .from('vendas_items')
              .select('sku, conta, origem, quantidade, data')
              .range(from, from + PAGE - 1);
            if (error) throw error;
            if (!rows || rows.length === 0) break;
            allRows = allRows.concat(rows);
            if (rows.length < PAGE) break;
            from += PAGE;
          }
        }

        const iniDate = new Date(dateIni);
        const fimDate = new Date(dateFim);
        const parseData = (d: string): Date | null => {
          if (!d) return null;
          if (/^\d{2}\/\d{2}\/\d{4}/.test(d)) {
            const [dd, mm, yy] = d.split(/[\/\s]/);
            return new Date(`${yy}-${mm}-${dd}`);
          }
          if (/^\d{4}-\d{2}-\d{2}/.test(d)) return new Date(d.split('T')[0]);
          return null;
        };

        const mapped = allRows
          .map((r: any) => {
            const dt = parseData(r.data);
            if (!dt || dt < iniDate || dt > fimDate) return null;
            return {
              date: dt.toISOString().split('T')[0],
              sku: String(r.sku || '').trim().toUpperCase(),
              conta: normalizeConta(r.conta),
              origem: (r.origem || 'Mercado Livre').trim() || 'Mercado Livre',
              qtd: Number(r.quantidade) || 0,
            };
          })
          .filter(Boolean) as { date: string; sku: string; conta: string; origem: string; qtd: number }[];

        if (active) setGlobalDaily(mapped);
      } catch (err: any) {
        console.error('[GlobalDaily] erro:', err);
      } finally {
        if (active) setLoadingGlobal(false);
      }
    }
    fetchGlobal();
    return () => { active = false; };
  }, [dateIni, dateFim]);

  // ===== VMD por SKU/Conta no período selecionado =====
  const vmdBySkuConta = useMemo(() => {
    const map = new Map<string, Map<string, number>>(); // sku -> conta -> vmd
    vmdSalesData.forEach(s => {
      const sku = s.sku.trim().toUpperCase();
      const conta = normalizeConta(s.conta);
      const vmd = (Number(s.quantidade) || 0) / diasReais;
      if (!map.has(sku)) map.set(sku, new Map());
      const inner = map.get(sku)!;
      inner.set(conta, (inner.get(conta) || 0) + vmd);
    });
    return map;
  }, [vmdSalesData, diasReais]);

  // Lista de contas disponíveis (das vendas do período)
  const contasDisponiveis = useMemo(() => {
    const set = new Set<string>();
    vmdBySkuConta.forEach(inner => inner.forEach((_, conta) => set.add(conta)));
    return Array.from(set).sort();
  }, [vmdBySkuConta]);

  // ===== Tabela principal =====
  const mergedData = useMemo<CoberturaRow[]>(() => {
    if (!estoqueFullItems) return [];

    // Soma VMD por SKU (todas as contas) — ou filtra por conta selecionada
    const sqlVmdBySku = new Map<string, number>();
    vmdBySkuConta.forEach((contasMap, sku) => {
      let total = 0;
      contasMap.forEach((vmd, conta) => {
        if (filtroConta === 'all' || conta === filtroConta) total += vmd;
      });
      if (total > 0) sqlVmdBySku.set(sku, total);
    });

    // Estoque Full por SKU
    const fullBySku = new Map<string, number>();
    estoqueFullItems.forEach(i => {
      const sku = i.sku.trim().toUpperCase();
      fullBySku.set(sku, (fullBySku.get(sku) || 0) + Number(i.aptasParaVenda || 0));
    });

    // Estoque Tiny por SKU
    const tinyBySku = new Map<string, number>();
    (estoqueTinyItems || []).forEach(i => {
      const sku = (i.sku || '').trim().toUpperCase();
      if (!sku) return;
      tinyBySku.set(sku, (tinyBySku.get(sku) || 0) + Number(i.quantidade || 0));
    });

    const allSkus = new Set<string>([...fullBySku.keys(), ...tinyBySku.keys(), ...sqlVmdBySku.keys()]);

    return Array.from(allSkus).map((sku) => {
      const full = fullBySku.get(sku) || 0;
      const tiny = tinyBySku.get(sku) || 0;
      const total = full + tiny;
      const vmdAtual = roundHalf(sqlVmdBySku.get(sku) ?? 0);
      const vmdMeta = metasVMD[sku] || 0;

      let performance: 'oversales' | 'undersales' | 'ok' = 'ok';
      if (vmdMeta > 0) {
        if (vmdAtual > vmdMeta * 1.2) performance = 'oversales';
        else if (vmdAtual < vmdMeta * 0.8) performance = 'undersales';
      }

      return { sku, vmdAtual, vmdMeta, estoqueFull: full, estoqueTiny: tiny, estoqueTotal: total, performance };
    })
      .filter(r => !busca || r.sku.toLowerCase().includes(busca.toLowerCase()))
      .sort((a, b) => b.vmdAtual - a.vmdAtual);
  }, [estoqueFullItems, estoqueTinyItems, vmdBySkuConta, metasVMD, filtroConta, busca]);

  const kpis = useMemo(() => {
    const totalVmd = mergedData.reduce((acc, curr) => acc + curr.vmdAtual, 0);
    const oversales = mergedData.filter(m => m.performance === 'oversales').length;
    const undersales = mergedData.filter(m => m.performance === 'undersales').length;
    const skusAtivos = mergedData.filter(m => m.vmdAtual > 0).length;
    return { totalVmd, oversales, undersales, skusAtivos };
  }, [mergedData]);

  // ===== Carrega vendas detalhadas ao expandir =====
  async function carregarVendasSku(sku: string) {
    if (salesBySku.has(`${sku}|${dateIni}|${dateFim}`)) return;
    setLoadingSku(sku);
    try {
      // Pagina manualmente — o Supabase limita a 1000 rows por request mesmo com .limit() maior
      const PAGE = 1000;
      let from = 0;
      let allRows: any[] = [];
      for (let p = 0; p < 50; p++) {
        const { data: rows, error } = await (supabase as any)
          .from('vendas_items')
          .select('sku, conta, quantidade, data')
          .ilike('sku', sku)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!rows || rows.length === 0) break;
        allRows = allRows.concat(rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }

      // Filtra pelo range de datas (data pode estar em DD/MM/YYYY ou ISO)
      const iniDate = new Date(dateIni);
      const fimDate = new Date(dateFim);
      const parseData = (d: string): Date | null => {
        if (!d) return null;
        if (/^\d{2}\/\d{2}\/\d{4}/.test(d)) {
          const [dd, mm, yy] = d.split(/[\/\s]/);
          return new Date(`${yy}-${mm}-${dd}`);
        }
        if (/^\d{4}-\d{2}-\d{2}/.test(d)) return new Date(d.split('T')[0]);
        return null;
      };

      const filtered = allRows
        .map((r: any) => {
          const dt = parseData(r.data);
          if (!dt || dt < iniDate || dt > fimDate) return null;
          return {
            date: dt.toISOString().split('T')[0],
            conta: normalizeConta(r.conta),
            qtd: Number(r.quantidade) || 0,
          };
        })
        .filter(Boolean) as { date: string; conta: string; qtd: number }[];

      console.log(`[Trajetoria] ${sku}: ${allRows.length} linhas brutas → ${filtered.length} no período ${dateIni}→${dateFim}`);
      setSalesBySku(prev => new Map(prev).set(`${sku}|${dateIni}|${dateFim}`, filtered));
    } catch (err: any) {
      toast.error('Erro ao carregar vendas: ' + err.message);
    } finally {
      setLoadingSku(null);
    }
  }

  function toggleExpand(sku: string) {
    if (expandedSku === sku) {
      setExpandedSku(null);
    } else {
      setExpandedSku(sku);
      carregarVendasSku(sku);
    }
  }

  // ===== Dados do gráfico para SKU expandido =====
  // Origens disponíveis (para o filtro)
  const origensDisponiveis = useMemo(() => {
    const set = new Set<string>();
    globalDaily.forEach(r => set.add(r.origem));
    return Array.from(set).sort();
  }, [globalDaily]);

  // ===== Dados do gráfico GLOBAL — agrupado por ORIGEM, respeita busca =====
  const globalChartData = useMemo(() => {
    let filtered = globalDaily;
    if (filtroConta !== 'all') filtered = filtered.filter(r => r.conta === filtroConta);
    if (filtroOrigem !== 'all') filtered = filtered.filter(r => r.origem === filtroOrigem);
    const buscaUp = busca.trim().toUpperCase();
    if (buscaUp) filtered = filtered.filter(r => r.sku.includes(buscaUp));

    const dias: string[] = [];
    const ini = new Date(dateIni);
    const fim = new Date(dateFim);
    for (let d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) {
      dias.push(d.toISOString().split('T')[0]);
    }
    const origensSet = new Set<string>();
    filtered.forEach(r => origensSet.add(r.origem));
    const origens = Array.from(origensSet).sort();

    const map = new Map<string, any>();
    dias.forEach(d => {
      const obj: any = { date: d, dateLabel: formatDateBR(d), total: 0 };
      origens.forEach(o => { obj[o] = 0; });
      map.set(d, obj);
    });
    filtered.forEach(r => {
      const row = map.get(r.date);
      if (!row) return;
      row[r.origem] = (row[r.origem] || 0) + r.qtd;
      row.total = (row.total || 0) + r.qtd;
    });

    // Meta global: se busca ativa, soma só a meta dos SKUs visíveis na tabela (que já estão filtrados por busca)
    const metaGlobal = mergedData.reduce((s, r) => s + (r.vmdMeta || 0), 0);

    const vmdPorOrigem: Record<string, number> = {};
    origens.forEach(o => {
      const total = filtered.filter(r => r.origem === o).reduce((s, r) => s + r.qtd, 0);
      vmdPorOrigem[o] = total / diasReais;
    });
    const totalGeral = filtered.reduce((s, r) => s + r.qtd, 0);
    const vmdTotal = totalGeral / diasReais;

    return { rows: Array.from(map.values()), origens, metaGlobal, vmdPorOrigem, vmdTotal };
  }, [globalDaily, filtroConta, filtroOrigem, busca, dateIni, dateFim, diasReais, mergedData]);

  const chartData = useMemo(() => {
    if (!expandedSku) return { rows: [], contas: [] as string[], vmdPorConta: {} as Record<string, number> };
    const key = `${expandedSku}|${dateIni}|${dateFim}`;
    const raw = salesBySku.get(key);
    if (!raw) return { rows: [], contas: [], vmdPorConta: {} };

    // Filtra por conta se aplicável
    const filteredRaw = filtroConta === 'all' ? raw : raw.filter(r => r.conta === filtroConta);

    // Set de datas (todos os dias do período)
    const dias: string[] = [];
    const ini = new Date(dateIni);
    const fim = new Date(dateFim);
    for (let d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) {
      dias.push(d.toISOString().split('T')[0]);
    }

    // Set de contas presentes
    const contasSet = new Set<string>();
    filteredRaw.forEach(r => contasSet.add(r.conta));
    const contas = Array.from(contasSet).sort();

    // Agrega: dia x conta -> qtd
    const map = new Map<string, Record<string, number>>();
    dias.forEach(d => {
      const obj: Record<string, number> = { date: d as any, dateLabel: formatDateBR(d) as any };
      contas.forEach(c => { obj[c] = 0; });
      obj.total = 0;
      map.set(d, obj);
    });
    filteredRaw.forEach(r => {
      const row = map.get(r.date);
      if (!row) return;
      row[r.conta] = (row[r.conta] || 0) + r.qtd;
      row.total = (row.total || 0) + r.qtd;
    });

    // VMD média por conta no período
    const vmdPorConta: Record<string, number> = {};
    contas.forEach(c => {
      const total = filteredRaw.filter(r => r.conta === c).reduce((s, r) => s + r.qtd, 0);
      vmdPorConta[c] = total / diasReais;
    });
    vmdPorConta.__total__ = filteredRaw.reduce((s, r) => s + r.qtd, 0) / diasReais;

    return { rows: Array.from(map.values()), contas, vmdPorConta };
  }, [expandedSku, salesBySku, dateIni, dateFim, diasReais, filtroConta]);

  // ===== Handlers =====
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
      let importados = 0, ignorados = 0;
      const startRow = rows.findIndex((r: any[]) => r.some(c => String(c).toUpperCase().includes('SKU')));
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
    const data = [['SKU', 'VMD'], ...skusUnicos.map(sku => [sku, metasVMD[sku] || ''])];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Metas VMD');
    XLSX.writeFile(wb, 'template_metas_vmd.xlsx');
    toast.success('Template baixado');
  };

  const aplicarPeriodoCustom = () => {
    const v = parseInt(periodoCustom, 10);
    if (isNaN(v) || v < 1 || v > 365) { toast.error('Período entre 1 e 365 dias'); return; }
    setPeriodo(v);
  };

  const colorForConta = (conta: string, idx: number) =>
    CONTA_COLORS[conta] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard title={`VMD Total (${diasReais}d SQL)`} value={kpis.totalVmd.toFixed(1)} icon={Package} delay={0} />
        <KpiCard title="Oversales" value={String(kpis.oversales)} icon={TrendingUp} valueColor="text-[hsl(var(--vix-danger))]" delay={100} />
        <KpiCard title="Undersales" value={String(kpis.undersales)} icon={TrendingDown} valueColor="text-[hsl(var(--vix-warning))]" delay={200} />
        <KpiCard title="SKUs Ativos" value={formatNumber(kpis.skusAtivos)} icon={Target} delay={300} />
      </div>

      {/* Filtros */}
      <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Período:</span>
          {PERIODOS_PRESET.map(d => (
            <button
              key={d}
              onClick={() => setPeriodo(d)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                periodo === d
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              {d}d
            </button>
          ))}
          <div className="flex items-center gap-1 ml-1">
            <input
              type="number"
              min={1}
              max={365}
              placeholder="Custom"
              value={periodoCustom}
              onChange={e => setPeriodoCustom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && aplicarPeriodoCustom()}
              className="w-20 h-7 text-xs px-2 bg-muted border border-border rounded-md"
            />
            <button
              onClick={aplicarPeriodoCustom}
              className="px-2 py-1 text-xs font-medium rounded-md bg-muted hover:bg-muted/70"
            >
              OK
            </button>
          </div>
        </div>

        <div className="h-6 w-px bg-border" />

        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Conta:</span>
          <select
            value={filtroConta}
            onChange={e => setFiltroConta(e.target.value)}
            className="h-7 text-xs px-2 bg-muted border border-border rounded-md"
          >
            <option value="all">Todas</option>
            {contasDisponiveis.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="h-6 w-px bg-border" />

        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Origem:</span>
          <select
            value={filtroOrigem}
            onChange={e => setFiltroOrigem(e.target.value)}
            className="h-7 text-xs px-2 bg-muted border border-border rounded-md"
          >
            <option value="all">Todas</option>
            {origensDisponiveis.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        <div className="h-6 w-px bg-border" />

        <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar SKU..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="flex-1 h-7 text-xs px-2 bg-muted border border-border rounded-md"
          />
        </div>
      </div>

      {/* Gráfico Global */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Vendas Globais — {diasReais} dias (todos SKUs)</h3>
          </div>
          <div className="flex items-center gap-3 flex-wrap text-xs">
            <span className="px-2 py-0.5 rounded bg-foreground/10 font-mono">
              VMD TOTAL: {globalChartData.vmdTotal.toFixed(1)}/dia
            </span>
            {globalChartData.origens.map((o, idx) => (
              <span key={o} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: ORIGEM_COLORS[o] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length] }} />
                <span className="font-mono">{o}: {(globalChartData.vmdPorOrigem[o] || 0).toFixed(1)}/dia</span>
              </span>
            ))}
            {globalChartData.metaGlobal > 0 && (
              <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-mono">
                Meta Global: {globalChartData.metaGlobal.toFixed(0)}/dia
              </span>
            )}
          </div>
        </div>
        <div className="p-4">
          {loadingGlobal ? (
            <div className="text-center text-sm text-muted-foreground py-12">Carregando vendas globais...</div>
          ) : globalChartData.rows.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-12">Sem vendas no período</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={globalChartData.rows} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="dateLabel" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {globalChartData.metaGlobal > 0 && (
                  <ReferenceLine y={globalChartData.metaGlobal} stroke="hsl(var(--primary))" strokeDasharray="4 4" label={{ value: `Meta ${globalChartData.metaGlobal.toFixed(0)}`, fontSize: 10, fill: 'hsl(var(--primary))' }} />
                )}
                <Line type="monotone" dataKey="total" name="Total" stroke="hsl(var(--foreground))" strokeWidth={2.5} dot={false} />
                {globalChartData.origens.map((o, idx) => (
                  <Line key={o} type="monotone" dataKey={o} name={o} stroke={ORIGEM_COLORS[o] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length]} strokeWidth={1.5} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Cobertura de Vendas — {diasReais} dias</h3>
          </div>
          <div className="flex items-center gap-2">
            <input type="file" ref={fileInputRef} accept=".xlsx,.xls,.csv" onChange={handleUploadMetas} className="hidden" />
            <button onClick={handleDownloadTemplate} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors">
              <Download className="w-3.5 h-3.5" /> Baixar Template
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
              <Upload className="w-3.5 h-3.5" /> Importar Metas VMD (.xlsx)
            </button>
          </div>
        </div>
        <div className="px-4 py-2 border-b border-border bg-muted/10 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[hsl(var(--vix-danger))]" /> Oversales (+20% meta)</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[hsl(var(--vix-warning))]" /> Undersales (-20% meta)</span>
          <span className="ml-auto italic">Clique no SKU para ver a trajetória de vendas no período</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="w-8 px-2 py-3"></th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">SKU</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">VMD ({diasReais}d)</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                  Meta VMD <Info className="inline w-3 h-3 ml-1 opacity-50 cursor-help" />
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Estoque Full</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Estoque Tiny</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Estoque Total</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status Performance</th>
              </tr>
            </thead>
            <tbody>
              {mergedData.map((row) => {
                const isExpanded = expandedSku === row.sku;
                return (
                  <Fragment key={row.sku}>
                    <tr
                      key={row.sku}
                      className="border-b border-border hover:bg-muted/10 transition-colors cursor-pointer"
                      onClick={() => toggleExpand(row.sku)}
                    >
                      <td className="px-2 py-3 text-center text-muted-foreground">
                        {isExpanded ? <ChevronDown className="w-4 h-4 inline" /> : <ChevronRight className="w-4 h-4 inline" />}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{row.sku}</td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">{row.vmdAtual % 1 === 0 ? row.vmdAtual : row.vmdAtual.toFixed(1)}</td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
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
                      <td className="px-4 py-3 text-right font-medium">{formatNumber(row.estoqueFull)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatNumber(row.estoqueTiny)}</td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">{formatNumber(row.estoqueTotal)}</td>
                      <td className="px-4 py-3 text-center">
                        {row.performance === 'oversales' && <span className="px-2 py-1 rounded-full bg-[hsl(var(--vix-danger)/0.1)] text-[hsl(var(--vix-danger))] text-[10px] font-bold">OVERSALES</span>}
                        {row.performance === 'undersales' && <span className="px-2 py-1 rounded-full bg-[hsl(var(--vix-warning)/0.1)] text-[hsl(var(--vix-warning))] text-[10px] font-bold">UNDERSALES</span>}
                        {row.performance === 'ok' && <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">BALANCEADO</span>}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${row.sku}-expand`} className="border-b border-border bg-muted/5">
                        <td colSpan={8} className="px-6 py-4">
                          {loadingSku === row.sku ? (
                            <div className="text-center text-sm text-muted-foreground py-8">Carregando vendas...</div>
                          ) : (
                            <div>
                              {/* Legenda VMD por conta */}
                              <div className="flex items-center gap-3 flex-wrap mb-3 text-xs">
                                <span className="font-semibold text-foreground">VMD média no período:</span>
                                <span className="px-2 py-0.5 rounded bg-foreground/10 font-mono">
                                  TOTAL: {(chartData.vmdPorConta.__total__ || 0).toFixed(2)}/dia
                                </span>
                                {chartData.contas.map((c, idx) => (
                                  <span key={c} className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: colorForConta(c, idx) }} />
                                    <span className="font-mono">{c}: {(chartData.vmdPorConta[c] || 0).toFixed(2)}/dia</span>
                                  </span>
                                ))}
                                {row.vmdMeta > 0 && (
                                  <span className="ml-auto px-2 py-0.5 rounded bg-primary/10 text-primary font-mono">
                                    Meta: {row.vmdMeta}/dia
                                  </span>
                                )}
                              </div>
                              {chartData.rows.length === 0 ? (
                                <div className="text-center text-sm text-muted-foreground py-8">Sem vendas no período</div>
                              ) : (
                                <ResponsiveContainer width="100%" height={280}>
                                  <LineChart data={chartData.rows} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                    <XAxis dataKey="dateLabel" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                                    <Tooltip
                                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    {row.vmdMeta > 0 && (
                                      <ReferenceLine y={row.vmdMeta} stroke="hsl(var(--primary))" strokeDasharray="4 4" label={{ value: `Meta ${row.vmdMeta}`, fontSize: 10, fill: 'hsl(var(--primary))' }} />
                                    )}
                                    <Line type="monotone" dataKey="total" name="Total" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} />
                                    {chartData.contas.map((c, idx) => (
                                      <Line
                                        key={c}
                                        type="monotone"
                                        dataKey={c}
                                        name={c}
                                        stroke={colorForConta(c, idx)}
                                        strokeWidth={1.5}
                                        dot={false}
                                      />
                                    ))}
                                  </LineChart>
                                </ResponsiveContainer>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {mergedData.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-12">
              Nenhum SKU encontrado com os filtros atuais.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
