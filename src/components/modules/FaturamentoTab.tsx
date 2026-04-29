import { useMemo, useState } from 'react';
import { useSheetsData } from '@/contexts/SheetsDataContext';
// DB hooks removed — all data now comes from local Google Sheets context
import { subDays, format } from 'date-fns';
import { formatBRL, getLocalDateStr } from '@/lib/utils-vix';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ScatterChart, Scatter, ZAxis, LabelList,
  AreaChart, Area
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, DollarSign, BarChart2, Percent, Target, ArrowUpDown, Users, Settings, RefreshCw, Loader2 } from 'lucide-react';
import { TaxConfigModal } from './TaxConfigModal';

const COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6',
  '#ec4899', '#14b8a6', '#8b5cf6', '#f97316', '#06b6d4',
  '#a3e635', '#fb7185', '#34d399', '#fbbf24', '#60a5fa',
];

function parseDate(d: string): Date | null {
  if (!d) return null;
  const dStr = String(d).trim();
  const parts = dStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (parts) return new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]));
  
  if (dStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const iso = new Date(dStr + 'T12:00:00');
    return !isNaN(iso.getTime()) ? iso : null;
  }
  
  const iso = new Date(dStr);
  return !isNaN(iso.getTime()) ? iso : null;
}

function formatDateShort(d: string): string {
  const dt = parseDate(d);
  if (!dt) return d;
  return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}`;
}

function DeltaArrow({ current, previous, invert }: { current: number; previous: number; invert?: boolean }) {
  if (!previous || previous === 0) {
    if (current === 0) return <Minus className="w-3 h-3 text-muted-foreground inline" />;
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-500">
        <TrendingUp className="w-3 h-3" /> —
      </span>
    );
  }
  
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(pct) < 0.5) return <Minus className="w-3 h-3 text-muted-foreground inline" />;
  
  const isUp = pct > 0;
  const goodUp = invert ? !isUp : isUp;
  const Icon = isUp ? TrendingUp : TrendingDown;
  const color = goodUp ? 'text-emerald-500' : 'text-red-500';
  
  let label = '';
  if (Math.abs(pct) > 999) {
    label = pct > 0 ? '+999%' : '-999%';
  } else {
    label = `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`;
  }

  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${color}`}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
}

const isAtacado = (conta: string) =>
  conta.toLowerCase().includes('atacado') ||
  conta.toLowerCase().includes('alexia') ||
  conta.toLowerCase().includes('vf|') ||
  conta.toLowerCase().includes('|vf');

export function FaturamentoTab() {
  const sheetsData = useSheetsData();

  const [isTaxModalOpen, setIsTaxModalOpen] = useState(false);
  const [filterDias, setFilterDias] = useState(30);
  const [filterConta, setFilterConta] = useState('all');
  const [filterMarketplace, setFilterMarketplace] = useState('all');
  // Default custom range to last 30 days so it never starts empty
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 29); return getLocalDateStr(d);
  });
  const [customTo, setCustomTo] = useState(() => getLocalDateStr(new Date()));

  const dateFim = useMemo(() => {
    if (filterDias === -1) return customTo || getLocalDateStr(new Date());
    return getLocalDateStr(new Date());
  }, [filterDias, customTo]);

  const dateIni = useMemo(() => {
    if (filterDias === -1) return customFrom || getLocalDateStr(new Date());
    const d = new Date();
    d.setDate(d.getDate() - (filterDias - 1));
    return getLocalDateStr(d);
  }, [filterDias, customFrom]);

  const dateIniPrev = useMemo(() => {
    if (filterDias === -1) {
      const d = new Date();
      d.setDate(d.getDate() - 60);
      return getLocalDateStr(d);
    }
    const d = new Date();
    d.setDate(d.getDate() - ((filterDias * 2) - 1));
    return getLocalDateStr(d);
  }, [filterDias]);

  const dateFimPrev = useMemo(() => {
    if (filterDias === -1) {
      const d = new Date();
      d.setDate(d.getDate() - 31);
      return getLocalDateStr(d);
    }
    const d = new Date();
    d.setDate(d.getDate() - filterDias);
    return getLocalDateStr(d);
  }, [filterDias]);

  // ═══════════════════════════════════════════════════════════════
  // TUDO via vendasItems (inclui Atacado, Loja Física, Showroom).
  // Usa campo `liquido` pré-calculado da planilha.
  // Ads diário via marketplaceDiaItems para rateio.
  // Agrupamento por ORIGEM COMPLETA (ex: "Mercado Livre|VIA FLIX").
  // ═══════════════════════════════════════════════════════════════

  // Devoluções por SKU no período (aba "Devoluções")
  const devSkuMap = useMemo(() => {
    const map = new Map<string, number>();
    if (sheetsData.devolucaoItems) {
      const dtIni = new Date(dateIni + 'T00:00:00');
      const dtFim = new Date(dateFim + 'T23:59:59');
      sheetsData.devolucaoItems.forEach(d => {
        const dt = parseDate(d.dataAprovacao || d.dataPlanilha);
        if (!dt || dt < dtIni || dt > dtFim) return;
        const sku = (d.skuProduto || '').trim().toUpperCase();
        if (!sku) return;
        map.set(sku, (map.get(sku) || 0) + (Number(d.quantidade) || 1));
      });
    }
    return map;
  }, [sheetsData.devolucaoItems, dateIni, dateFim]);

  // Ads diário por ORIGEM (aba "Marketplace Dia" / "Teste Luiz Ads")
  const adsDiaMap = useMemo(() => {
    const map = new Map<string, { ads: number; fat: number }>();
    if (sheetsData.marketplaceDiaItems) {
      sheetsData.marketplaceDiaItems.forEach(m => {
        const d = parseDate(m.data);
        if (!d) return;
        const origem = (m.origem || '').trim();
        const key = `${getLocalDateStr(d)}|${origem}`;
        const prev = map.get(key) || { ads: 0, fat: 0 };
        prev.ads += Number(m.ads || 0);
        prev.fat += Number(m.faturamentoBruto || 0);
        map.set(key, prev);
      });
    }
    return map;
  }, [sheetsData.marketplaceDiaItems]);

  // ── Processar vendasItems em DIÁRIO + POR SKU ──
  const { dbDaily, dbDailyPrev, dbSku, dbSkuPrev, loadingDaily, loadingSku } = useMemo(() => {
    if (!sheetsData.vendasItems) {
      return { dbDaily: [] as any[], dbDailyPrev: [] as any[], dbSku: [] as any[], dbSkuPrev: [] as any[], loadingDaily: true, loadingSku: true };
    }

    const ini  = new Date(dateIni + 'T00:00:00');
    const fim  = new Date(dateFim + 'T23:59:59');
    const iniP = new Date(dateIniPrev + 'T00:00:00');
    const fimP = new Date(dateFimPrev + 'T23:59:59');

    // Diário por data|origem
    const mapD     = new Map<string, any>();
    const mapDPrev = new Map<string, any>();
    // SKU
    const mapS     = new Map<string, any>();
    const mapSPrev = new Map<string, any>();

    for (const v of sheetsData.vendasItems) {
      const status = (v.statusPedido || '').toLowerCase();
      if (status.includes('cancel')) continue;

      const dt = parseDate(v.data);
      if (!dt) continue;
      const inCurrent = dt >= ini && dt <= fim;
      const inPrev    = dt >= iniP && dt <= fimP;
      if (!inCurrent && !inPrev) continue;

      // Montar origem completa: "Marketplace|Conta" como no Looker
      const conta = (v.conta || 'Sem Conta').trim();
      if (filterConta !== 'all' && filterConta !== conta) continue;

      const rawOrigem = (v.origem || '').trim();
      // origem completa para agrupar = se já tem pipe usa direto, senão monta
      const origem = rawOrigem.includes('|') ? rawOrigem : (rawOrigem ? `${rawOrigem}|${conta}` : conta);
      // marketplace = parte antes do pipe (para filtro)
      const pipeIdx = origem.indexOf('|');
      const marketplace = pipeIdx > 0 ? origem.substring(0, pipeIdx).trim() : origem;

      const sku  = (v.sku || v.skuProduto || 'Sem SKU').trim().toUpperCase();
      const qtd  = Number(v.quantidade || 1);
      const fat  = Number(v.valorTotal || 0);
      const liq  = Number(v.liquido || 0);
      const cmv  = Number(v.cmv || 0);
      const comis = Number(v.comissao || 0);
      const frete = Number(v.frete || 0) + Number(v.custoEnvio || 0);
      const imp   = Number(v.impostos || 0);
      const ads   = Number(v.ads || 0);
      const dateStr = getLocalDateStr(dt);

      // ─── DIÁRIO: agrupar por data + origem ───
      const targetD = inCurrent ? mapD : mapDPrev;
      const dk = `${dateStr}|${origem}`;
      if (!targetD.has(dk)) {
        targetD.set(dk, {
          data: dateStr, conta, marketplace, origem,
          faturamento_bruto: 0, lucro_liquido: 0, impostos: 0, ads: 0,
          cmv: 0, comissao: 0, frete: 0, pedidos: 0, quantidade: 0,
        });
      }
      const dd = targetD.get(dk)!;
      dd.faturamento_bruto += fat;
      dd.lucro_liquido += liq;
      dd.impostos  += imp;
      dd.cmv       += cmv;
      dd.comissao  += comis;
      dd.frete     += frete;
      dd.ads       += ads;
      dd.pedidos   += 1;
      dd.quantidade += qtd;

      // ─── POR SKU ───
      const targetS = inCurrent ? mapS : mapSPrev;
      if (!targetS.has(sku)) {
        targetS.set(sku, {
          sku, conta, marketplace: origem, origem,
          faturamento_bruto: 0, liquido: 0, quantidade: 0,
          ads: 0, cmv: 0, comissao: 0, frete: 0, impostos: 0,
          pedidos: 0, dev_qtd: 0, pct_devolucao: 0,
        });
      }
      const ss = targetS.get(sku)!;
      ss.faturamento_bruto += fat;
      ss.liquido    += liq;
      ss.cmv        += cmv;
      ss.quantidade += qtd;
      ss.comissao   += comis;
      ss.frete      += frete;
      ss.impostos   += imp;
      ss.ads        += ads;
      ss.pedidos    += 1;
    }

    // ── Inject Ads from marketplaceDiaItems if per-row ads were 0 ──
    const injectDailyAds = (target: Map<string, any>) => {
      target.forEach(row => {
        if (row.ads === 0) {
          const adEntry = adsDiaMap.get(`${row.data}|${row.origem}`);
          if (adEntry && adEntry.ads > 0) {
            row.ads = adEntry.ads;
          }
        }
      });
    };
    injectDailyAds(mapD);
    injectDailyAds(mapDPrev);

    // ── Inject Ads + Devoluções into SKU ──
    const contaAdsTotals = new Map<string, { fat: number; ads: number }>();
    mapD.forEach(d => {
      const t = contaAdsTotals.get(d.origem) || { fat: 0, ads: 0 };
      t.fat += d.faturamento_bruto;
      t.ads += d.ads;
      contaAdsTotals.set(d.origem, t);
    });

    mapS.forEach(s => {
      // Ads: rateio proporcional
      if (s.ads === 0) {
        const t = contaAdsTotals.get(s.origem);
        if (t && t.fat > 0 && t.ads > 0) {
          s.ads = (s.faturamento_bruto / t.fat) * t.ads;
        }
      }
      // Devoluções
      const devQtd = devSkuMap.get(s.sku) || 0;
      s.dev_qtd = devQtd;
      s.pct_devolucao = s.quantidade > 0 ? (devQtd / s.quantidade) * 100 : 0;
    });

    return {
      dbDaily:     Array.from(mapD.values()),
      dbDailyPrev: Array.from(mapDPrev.values()),
      dbSku:       Array.from(mapS.values()),
      dbSkuPrev:   Array.from(mapSPrev.values()),
      loadingDaily: false,
      loadingSku:   false,
    };
  }, [sheetsData.vendasItems, dateIni, dateFim, dateIniPrev, dateFimPrev, filterConta, adsDiaMap, devSkuMap]);

  const [filterCanal, setFilterCanal] = useState<'all' | 'marketplace' | 'atacado'>('all');
  const [sortField, setSortField] = useState('faturamento');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Dynamic filter lists from DB data
  const dynamicContas = useMemo(() => {
    const set = new Set<string>();
    dbDaily.forEach(v => {
      if (v.conta) set.add(v.conta.trim());
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [dbDaily]);

  const dynamicMarketplaces = useMemo(() => {
    const set = new Set<string>();
    dbDaily.forEach(v => {
      if (v.marketplace) set.add(v.marketplace.trim());
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [dbDaily]);

  // Combined local filtering for Marketplace
  const filteredDaily = useMemo(() => {
    return dbDaily.filter(v => 
      (filterMarketplace === 'all' || v.marketplace === filterMarketplace) &&
      (filterCanal === 'all' || (filterCanal === 'atacado' ? isAtacado(v.conta || '') : !isAtacado(v.conta || '')))
    );
  }, [dbDaily, filterMarketplace, filterCanal]);

  const filteredDailyPrev = useMemo(() => {
    return dbDailyPrev.filter(v => 
      (filterMarketplace === 'all' || v.marketplace === filterMarketplace) &&
      (filterCanal === 'all' || (filterCanal === 'atacado' ? isAtacado(v.conta || '') : !isAtacado(v.conta || '')))
    );
  }, [dbDailyPrev, filterMarketplace, filterCanal]);

  const filteredSku = useMemo(() => {
    return dbSku.filter(v => 
      (filterMarketplace === 'all' || v.marketplace === filterMarketplace) &&
      (filterCanal === 'all' || (filterCanal === 'atacado' ? isAtacado(v.conta || '') : !isAtacado(v.conta || '')))
    );
  }, [dbSku, filterMarketplace, filterCanal]);

  const filteredSkuPrev = useMemo(() => {
    if (!dbSkuPrev) return [];
    return dbSkuPrev.filter(v => 
      (filterMarketplace === 'all' || v.marketplace === filterMarketplace) &&
      (filterCanal === 'all' || (filterCanal === 'atacado' ? isAtacado(v.conta || '') : !isAtacado(v.conta || '')))
    );
  }, [dbSkuPrev, filterMarketplace, filterCanal]);

  // Final cleanup: removed legacy Sheets-based filtering

  // ── KPIs ──
  const totalFat = useMemo(() => filteredDaily.reduce((s, v) => s + v.faturamento_bruto, 0), [filteredDaily]);
  const totalLiq = useMemo(() => filteredDaily.reduce((s, v) => s + v.lucro_liquido, 0), [filteredDaily]);
  const totalQtd = useMemo(() => filteredDaily.reduce((s, v) => s + v.quantidade, 0), [filteredDaily]);
  const totalAds = useMemo(() => filteredDaily.reduce((s, v) => s + v.ads, 0), [filteredDaily]);
  const margem = totalFat > 0 ? (totalLiq / totalFat) * 100 : 0;
  const totalPedidos = useMemo(() => filteredDaily.reduce((s, v) => s + v.pedidos, 0), [filteredDaily]);
  const ticket = totalPedidos > 0 ? totalFat / totalPedidos : 0;

  const prevFat = filteredDailyPrev.reduce((s, v) => s + v.faturamento_bruto, 0);
  const prevLiq = filteredDailyPrev.reduce((s, v) => s + v.lucro_liquido, 0);
  const prevMargem = prevFat > 0 ? (prevLiq / prevFat) * 100 : 0;

  // ── Chart 1: Faturamento diário por conta (Stacked Area) ──
  const stackedAreaData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number>>();
    filteredDaily.forEach(v => {
      const dateKey = formatDateShort(v.data);
      if (!dateKey) return;
      const label = v.origem || v.conta || 'Outros';
      const row = dateMap.get(dateKey) || {};
      row[label] = (row[label] || 0) + v.faturamento_bruto;
      dateMap.set(dateKey, row);
    });
    const sortedDates = [...dateMap.keys()].sort((a, b) => {
      const [da, ma] = a.split('/').map(Number);
      const [db, mb] = b.split('/').map(Number);
      return (ma * 100 + da) - (mb * 100 + db);
    });
    const result = sortedDates.map(date => ({ date, ...dateMap.get(date)! }));
    console.log('grafico data:', result.slice(-3));
    return result;
  }, [filteredDaily]);

  const contasNoChart = useMemo(() =>
    [...new Set(filteredDaily.map(v => v.origem || v.conta || 'Outros').filter(Boolean))].sort(),
    [filteredDaily]
  );

  // ── Chart 2: Faturamento + Margem por dia (Bar + Line) ──
  const fatMargemDia = useMemo(() => {
    const dateMap = new Map<string, { fat: number; liq: number }>();
    filteredDaily.forEach(v => {
      const dateKey = formatDateShort(v.data);
      if (!dateKey) return;
      const row = dateMap.get(dateKey) || { fat: 0, liq: 0 };
      row.fat += v.faturamento_bruto;
      row.liq += v.lucro_liquido;
      dateMap.set(dateKey, row);
    });
    const sortedDates = [...dateMap.keys()].sort((a, b) => {
      const [da, ma] = a.split('/').map(Number);
      const [db, mb] = b.split('/').map(Number);
      return (ma * 100 + da) - (mb * 100 + db);
    });
    return sortedDates.map(date => {
      const row = dateMap.get(date)!;
      return {
        date,
        faturamento: row.fat,
        pctMargem: row.fat > 0 ? Number(((row.liq / row.fat) * 100).toFixed(1)) : 0
      };
    });
  }, [filteredDaily]);

  // ── Chart 3: Scatter — QTDE vs Ticket Médio (bubble = Margem%) ──
  const scatterData = useMemo(() => {
    return filteredSku
      .filter(d => d.faturamento_bruto > 0 && d.quantidade > 0)
      .map(d => {
        const ticketMedio = d.pedidos > 0 ? d.faturamento_bruto / d.pedidos : d.faturamento_bruto / d.quantidade;
        const margemPct = d.faturamento_bruto > 0 ? (d.liquido / d.faturamento_bruto) * 100 : 0;
        return {
          sku: d.sku,
          x: Number(d.quantidade) || 0,
          y: Math.round(ticketMedio) || 0,
          z: Math.round(margemPct) || 0,
          faturamento: d.faturamento_bruto,
          pctAds: d.faturamento_bruto > 0 ? (d.ads / d.faturamento_bruto) * 100 : 0,
        };
      })
      .filter(d => d.x > 0 && d.y > 0 && isFinite(d.y) && isFinite(d.z))
      .sort((a, b) => b.faturamento - a.faturamento)
      .slice(0, 40);
  }, [filteredSku]);

  // ── Table: SKU-level ──
  const skuTable = useMemo(() => {
    const prevSkuMap = new Map<string, typeof dbSku[0]>();
    (dbSkuPrev || []).forEach(v => prevSkuMap.set(v.sku, v));

    const diasDiv = filterDias > 0 ? filterDias : 30;
    const rows = dbSku.map(d => {
      const prev = prevSkuMap.get(d.sku);
      const margem = d.faturamento_bruto > 0 ? (d.liquido / d.faturamento_bruto) * 100 : 0;
      const prevMargem = prev && prev.faturamento_bruto > 0 ? (prev.liquido / prev.faturamento_bruto) * 100 : 0;
      const ticket = d.pedidos > 0 ? d.faturamento_bruto / d.pedidos : 0;
      const pctAds = d.faturamento_bruto > 0 ? (d.ads / d.faturamento_bruto) * 100 : 0;
      const pctDev = Number(d.pct_devolucao || 0);
      return {
        sku: d.sku,
        faturamento: d.faturamento_bruto,
        liquido: d.liquido,
        qtd: d.quantidade,
        qtdDia: d.quantidade / diasDiv,
        ticket,
        margem,
        pctAds,
        pctDev,
        prevFat: prev?.faturamento_bruto || 0,
        prevLiq: prev?.liquido || 0,
        prevQtd: prev?.quantidade || 0,
        prevMargem
      };
    });

    return rows.sort((a, b) => {
      const dir = sortDir === 'desc' ? -1 : 1;
      if (sortField === 'sku') return dir * a.sku.localeCompare(b.sku);
      return dir * ((a as any)[sortField] - (b as any)[sortField]);
    });
  }, [dbSku, dbSkuPrev, filterDias, sortField, sortDir]);

  function toggleSort(field: string) {
    if (sortField === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortField(field); setSortDir('desc'); }
  }

  const hasPrev = dbDailyPrev.length > 0;

  const CustomScatterTooltip = ({ active, payload }: any) => {
    if (active && payload?.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-xl">
          <p className="font-bold text-foreground mb-1">{d.sku}</p>
          <p className="text-muted-foreground">QTDE: <span className="text-foreground font-medium">{d.x.toLocaleString('pt-BR')}</span></p>
          <p className="text-muted-foreground">Ticket Médio: <span className="text-foreground font-medium">{formatBRL(d.y)}</span></p>
          <p className="text-muted-foreground">Margem: <span className="font-medium" style={{ color: d.z >= 15 ? '#22c55e' : d.z >= 5 ? '#f59e0b' : '#ef4444' }}>{d.z}%</span></p>
          <p className="text-muted-foreground">Faturamento: <span className="text-foreground font-medium">{formatBRL(d.faturamento)}</span></p>
        </div>
      );
    }
    return null;
  };

  if (loadingDaily || loadingSku) {
    return (
      <div className="flex flex-col items-center justify-center py-40 animate-pulse">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground text-sm font-medium">Carregando dados das APIs...</p>
      </div>
    );
  }

  if (dbDaily.length === 0 && dbSku.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 mb-4">
          <BarChart2 className="w-10 h-10 text-indigo-400" />
        </div>
        <h3 className="text-foreground font-semibold mb-1">Nenhum dado encontrado</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Verifique o período selecionado ou se as planilhas foram carregadas corretamente.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in relative">
      {(loadingDaily || loadingSku) && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] z-50 flex items-center justify-center rounded-xl">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground font-medium">Período:</label>
          <select value={filterDias} onChange={e => setFilterDias(parseInt(e.target.value))} className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs">
            <option value={7}>Últimos 7 dias</option>
            <option value={15}>Últimos 15 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={60}>Últimos 60 dias</option>
            <option value={90}>Últimos 90 dias</option>
            <option value={0}>Todo o período</option>
            <option value={-1}>Data personalizada</option>
          </select>
          {filterDias === -1 && (
            <div className="flex items-center gap-1.5 ml-1">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="px-2 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs" />
              <span className="text-xs text-muted-foreground">até</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="px-2 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground font-medium">Conta:</label>
          <select value={filterConta} onChange={e => setFilterConta(e.target.value)} className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs">
            <option value="all">Todas as Contas</option>
            {dynamicContas.map(c => <option key={c} value={c}>{c.length > 35 ? c.slice(0, 32) + '...' : c}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground font-medium">Marketplace:</label>
          <select value={filterMarketplace} onChange={e => setFilterMarketplace(e.target.value)} className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs">
            <option value="all">Todos os Marketplaces</option>
            {dynamicMarketplaces.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground font-medium">Canal:</label>
          <div className="flex rounded-lg overflow-hidden border border-border text-xs">
            {(['all', 'marketplace', 'atacado'] as const).map(v => (
              <button key={v} onClick={() => setFilterCanal(v as any)}
                className={`px-3 py-1.5 transition-colors ${filterCanal === v ? 'bg-indigo-600 text-white' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
                {v === 'all' ? 'Todos' : v === 'marketplace' ? 'Marketplaces' : 'Atacado'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center ml-auto gap-3">
          <span className="text-xs text-muted-foreground mr-2">
            {dbDaily.length} registros | {skuTable.length} SKUs {hasPrev && '| comparando com período anterior'}
          </span>
          <button
            onClick={() => setIsTaxModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border text-foreground text-xs font-semibold rounded-lg hover:bg-muted transition-colors"
          >
            <Settings className="w-4 h-4 text-indigo-400" />
            Configurar Impostos
          </button>
        </div>
      </div>

      <TaxConfigModal isOpen={isTaxModalOpen} onClose={() => setIsTaxModalOpen(false)} />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-bl-full" />
          <DollarSign className="w-5 h-5 text-indigo-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Faturamento Bruto</p>
          <p className="text-xl font-bold text-foreground mt-1">{formatBRL(totalFat)}</p>
          {hasPrev && <div className="mt-1"><DeltaArrow current={totalFat} previous={prevFat} /></div>}
        </div>
        <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-bl-full" />
          <TrendingUp className="w-5 h-5 text-emerald-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Lucro Líquido</p>
          <p className={`text-xl font-bold mt-1 ${totalLiq >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatBRL(totalLiq)}</p>
          {hasPrev && <div className="mt-1"><DeltaArrow current={totalLiq} previous={prevLiq} /></div>}
        </div>
        <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-cyan-500/10 to-transparent rounded-bl-full" />
          <Percent className="w-5 h-5 text-cyan-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Margem Média</p>
          <p className={`text-xl font-bold mt-1 ${margem >= 15 ? 'text-emerald-400' : margem >= 5 ? 'text-amber-400' : 'text-red-400'}`}>{margem.toFixed(1)}%</p>
          {hasPrev && <div className="mt-1"><DeltaArrow current={margem} previous={prevMargem} /></div>}
        </div>
        <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-bl-full" />
          <Target className="w-5 h-5 text-amber-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ticket Médio</p>
          <p className="text-xl font-bold text-foreground mt-1">{formatBRL(ticket)}</p>
        </div>
        <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-purple-500/10 to-transparent rounded-bl-full" />
          <Users className="w-5 h-5 text-purple-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Unidades Vendidas</p>
          <p className="text-xl font-bold text-foreground mt-1">{totalQtd.toLocaleString('pt-BR')}</p>
        </div>
      </div>

      {/* Chart 1: Stacked Area — Faturamento por Conta */}
      {stackedAreaData.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4 md:p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            📊 Faturamento por Conta — Evolução Diária (Área Empilhada)
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={stackedAreaData}>
              <defs>
                {contasNoChart.map((c, i) => (
                  <linearGradient key={c} id={`grad${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.7} />
                    <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.1} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
              <Tooltip formatter={(v: number, name: string) => [formatBRL(v), name.length > 30 ? name.slice(0, 27) + '...' : name]} />
              <Legend formatter={(v) => v.length > 30 ? v.slice(0, 27) + '...' : v} />
              {contasNoChart.map((c, i) => (
                <Area
                  key={c}
                  type="monotone"
                  dataKey={c}
                  stackId="1"
                  stroke={COLORS[i % COLORS.length]}
                  fill={`url(#grad${i})`}
                  strokeWidth={1.5}
                  name={c}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Chart 2: Bar + Line — Faturamento diário + Margem% */}
      {fatMargemDia.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4 md:p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            💰 Faturamento Bruto × Margem Diária
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={fatMargemDia}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} unit="%" domain={[0, 60]} />
              <Tooltip formatter={(v: number, name: string) => name === 'Faturamento Bruto' ? formatBRL(v) : `${v}%`} labelFormatter={(l) => `Data: ${l}`} />
              <Legend />
              <Bar yAxisId="left" dataKey="faturamento" fill="#6366f1" name="Faturamento Bruto" radius={[4, 4, 0, 0]} opacity={0.85} />
              <Line yAxisId="right" type="monotone" dataKey="pctMargem" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 4, fill: '#22c55e' }} name="Margem %">
                <LabelList dataKey="pctMargem" position="top" formatter={(v: number) => `${v}%`} fill="#22c55e" fontSize={10} fontWeight={700} />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Chart 3: Scatter — QTDE vs Ticket Médio (bubble = Margem%) */}
      {scatterData.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4 md:p-6">
          <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
            🔵 Análise de Dispersão por SKU
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Eixo X = Quantidade vendida · Eixo Y = Ticket Médio · Tamanho = Faturamento · Cor = Margem (verde ≥15%, laranja ≥5%, vermelho &lt;5%)
          </p>
          <ResponsiveContainer width="100%" height={380}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" dataKey="x" name="QTDE" tick={{ fontSize: 10 }} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)} />
              <YAxis type="number" dataKey="y" name="Ticket Médio" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `R$${(v).toFixed(0)}`} />
              <ZAxis type="number" dataKey="faturamento" range={[60, 1200]} />
              <Tooltip content={<CustomScatterTooltip />} />
              <Scatter
                data={scatterData}
                fill="#6366f1"
                shape={(props: any) => {
                  const { cx, cy, width, height } = props;
                  const radius = Math.max((width || height || 20) / 2, 6);
                  const margem = props.payload?.z ?? 0;
                  const color = margem >= 15 ? '#22c55e' : margem >= 5 ? '#f59e0b' : '#ef4444';
                  return <circle cx={cx} cy={cy} r={radius} fill={color} fillOpacity={0.65} stroke={color} strokeWidth={1.5} />;
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* SKU Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-indigo-400" />
            Lucratividade por SKU
          </h3>
        </div>
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/95 backdrop-blur-sm z-10">
              <tr>
                {[
                  ['sku', 'SKU Princ.'],
                  ['faturamento', 'Valor Pedido'],
                  ['qtd', 'QTDE'],
                  ['qtdDia', 'Qtd/Dia'],
                  ['liquido', 'Líquido'],
                  ['margem', 'Margem %'],
                  ['ticket', 'Ticket Médio'],
                  ['pctAds', '% Ads'],
                  ['pctDev', '% Devolv.'],
                ].map(([field, label]) => (
                  <th key={field}
                    className="text-left py-3 px-3 text-muted-foreground font-medium cursor-pointer hover:text-foreground whitespace-nowrap"
                    onClick={() => toggleSort(field)}>
                    {label} <ArrowUpDown className="w-3 h-3 inline" />
                  </th>
                ))}
                <th className="py-3 px-3 text-muted-foreground font-medium">Δ</th>
              </tr>
            </thead>
            <tbody>
              {skuTable.map((row, i) => (
                <tr key={i} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                  <td className="py-2.5 px-3 font-medium text-foreground max-w-[140px] truncate" title={row.sku}>{row.sku}</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-foreground">{formatBRL(row.faturamento)}</td>
                  <td className="py-2.5 px-3 text-right">{row.qtd.toLocaleString('pt-BR')}</td>
                  <td className="py-2.5 px-3 text-right">{row.qtdDia.toFixed(1)}</td>
                  <td className={`py-2.5 px-3 text-right font-semibold ${row.liquido >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatBRL(row.liquido)}</td>
                  <td className="py-2.5 px-3 text-right font-semibold" style={{ color: row.margem >= 15 ? '#22c55e' : row.margem >= 5 ? '#f59e0b' : '#ef4444' }}>{row.margem.toFixed(2)}%</td>
                  <td className="py-2.5 px-3 text-right">{formatBRL(row.ticket)}</td>
                  <td className="py-2.5 px-3 text-right font-semibold" style={{ color: row.pctAds <= 5 ? '#22c55e' : row.pctAds <= 10 ? '#f59e0b' : '#ef4444' }}>{row.pctAds.toFixed(2)}%</td>
                  <td className="py-2.5 px-3 text-right" style={{ color: row.pctDev > 10 ? '#ef4444' : '' }}>{row.pctDev.toFixed(1)}%</td>
                  <td className="py-2.5 px-3 text-right">{hasPrev && <DeltaArrow current={row.margem} previous={row.prevMargem} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
