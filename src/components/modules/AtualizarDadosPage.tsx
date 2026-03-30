import { useState, useEffect, useMemo, useRef } from 'react';
import { RefreshCw, Wifi, WifiOff, ShoppingCart, TrendingUp, DollarSign, Package, ChevronDown, ChevronUp, Clock, CheckCircle2, XCircle, Truck, AlertTriangle, Plus, Trash2, Key, Eye, EyeOff, FileSpreadsheet, Loader2, CalendarDays, Bot, Zap, PackageX, BarChart2, Settings2, Check, Sparkles, Send, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { PageHeader } from '@/components/layout/PageHeader';
import { KpiCard } from '@/components/shared/KpiCard';
import { mockMarketplaceAccounts, mockOrders, mockAdsCampaigns, mockSalesByDay, mockRevenueByMarketplace } from '@/lib/mock-marketplace';
import { formatBRL, normalizeConta, getContasNormalizadas } from '@/lib/utils-vix';
import type { MarketplaceAccount, MarketplaceId } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, PieChart, Pie, Cell, Area, AreaChart } from 'recharts';
import { GraficosTab } from './GraficosTab';
import { PerformanceAdsTab } from './PerformanceAdsTab';
import { StatusAnunciosTab } from './StatusAnunciosTab';
import { CalculadoraTab } from './CalculadoraTab';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import { type ModuloDestino, CAMPOS_POR_MODULO, loadSheetConfigs } from '@/lib/sheets-store';

const statusConfig: Record<string, { icon: React.ElementType; label: string; class: string }> = {
  pendente: { icon: Clock, label: 'Pendente', class: 'text-[hsl(var(--vix-warning))] bg-[hsl(var(--vix-warning)/0.1)]' },
  pago: { icon: CheckCircle2, label: 'Pago', class: 'text-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)]' },
  enviado: { icon: Truck, label: 'Enviado', class: 'text-[hsl(var(--vix-info))] bg-[hsl(var(--vix-info)/0.1)]' },
  entregue: { icon: CheckCircle2, label: 'Entregue', class: 'text-[hsl(var(--vix-success))] bg-[hsl(var(--vix-success)/0.1)]' },
  cancelado: { icon: XCircle, label: 'Cancelado', class: 'text-[hsl(var(--vix-danger))] bg-[hsl(var(--vix-danger)/0.1)]' },
};

const campaignStatusColors: Record<string, string> = {
  ativo: 'text-[hsl(var(--vix-success))] bg-[hsl(var(--vix-success)/0.1)]',
  pausado: 'text-[hsl(var(--muted-foreground))] bg-muted',
  ajustar: 'text-[hsl(var(--vix-danger))] bg-[hsl(var(--vix-danger)/0.1)]',
};

const plataformaOptions = ['Mercado Livre', 'Tiny', 'Shopee', 'Amazon', 'Magalu', 'Americanas', 'Shein'];

const moduloLabels: Record<ModuloDestino, string> = {
  estoque: 'Estoque',
  'estoque-full': 'Estoque Full (ML)',
  'estoque-tiny': 'Estoque Tiny (Local)',
  financeiro: 'Financeiro',
  vendas: 'Vendas / Pedidos',
  performance: 'Performance Anúncios',
  ads: 'Performance ADS',
  devolucao: 'Devoluções',
  'marketplace-dia': 'Marketplace',
  calculadora: 'Calculadora',
};

const moduloColors: Record<ModuloDestino, string> = {
  estoque: 'bg-[hsl(var(--vix-info)/0.1)] text-[hsl(var(--vix-info))]',
  'estoque-full': 'bg-[hsl(var(--vix-info)/0.1)] text-[hsl(var(--vix-info))]',
  'estoque-tiny': 'bg-[hsl(200,80%,50%,0.1)] text-[hsl(200,80%,50%)]',
  financeiro: 'bg-[hsl(var(--vix-success)/0.1)] text-[hsl(var(--vix-success))]',
  vendas: 'bg-[hsl(var(--vix-warning)/0.1)] text-[hsl(var(--vix-warning))]',
  performance: 'bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]',
  ads: 'bg-[hsl(142,76%,36%,0.1)] text-[hsl(142,76%,36%)]',
  devolucao: 'bg-[hsl(0,72%,50%,0.1)] text-[hsl(0,72%,50%)]',
  'marketplace-dia': 'bg-[hsl(270,70%,55%,0.1)] text-[hsl(270,70%,55%)]',
  calculadora: 'bg-[hsl(220,70%,55%,0.1)] text-[hsl(220,70%,55%)]',
};

// Vendas Table Columns state
const DEFAULT_COLUMNS = [
  { id: 'numeroPedido', label: 'Pedido', visible: true },
  { id: 'data', label: 'Data', visible: true },
  { id: 'conta', label: 'Conta', visible: true },
  { id: 'sku', label: 'SKU', visible: true },
  { id: 'quantidade', label: 'Qtd', visible: true },
  { id: 'valorTotal', label: 'Valor', visible: true },
  { id: 'impostos', label: 'Impostos', visible: true, onlyImported: true },
  { id: 'comissao', label: 'Comissão', visible: true, onlyImported: true },
  { id: 'cmv', label: 'CMV', visible: true, onlyImported: true },
  { id: 'liquido', label: 'Líquido', visible: true, onlyImported: true },
  { id: 'margem', label: 'Margem', visible: true, onlyImported: true },
  { id: 'devolucao', label: 'Devolução', visible: true, onlyImported: true },
  { id: 'comprador', label: 'Comprador', visible: true, onlyMock: true },
  { id: 'status', label: 'Status', visible: true, onlyMock: true },
];

const PEDIDOS_PER_PAGE = 100;

export function AtualizarDadosPage() {
  const [accounts, setAccounts] = useState<MarketplaceAccount[]>([...mockMarketplaceAccounts]);
  const [syncingAccounts, setSyncingAccounts] = useState<Set<string>>(new Set());
  const [filterMarketplace, setFilterMarketplace] = useState<string>('all');
  const [filterConta, setFilterConta] = useState<string>('all');
  const [filterOrigem, setFilterOrigem] = useState<string>('all');
  const [filterSku, setFilterSku] = useState<string>('');
  const [filterDias, setFilterDias] = useState<number>(30);
  const [filterDataInicio, setFilterDataInicio] = useState<string>('');
  const [filterDataFim, setFilterDataFim] = useState<string>('');
  const [pedidosPage, setPedidosPage] = useState(0);
  const [perfFilterConta, setPerfFilterConta] = useState<string>('all');
  const [perfFilterPeriodo, setPerfFilterPeriodo] = useState<string>('7');
  const [perfSelectedPeriodo, setPerfSelectedPeriodo] = useState<string>('all');
  const [perfPage, setPerfPage] = useState(0);
  const [perfSortField, setPerfSortField] = useState<string>('vendas');
  const [perfSortDir, setPerfSortDir] = useState<'asc' | 'desc'>('desc');
  const [vendasSortField, setVendasSortField] = useState<string>('data');
  const [vendasSortDir, setVendasSortDir] = useState<'asc' | 'desc'>('desc');
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newAccount, setNewAccount] = useState({ nome: '', plataforma: '', loja: '', clientId: '', clientSecret: '', accessToken: '', refreshToken: '' });
  const [showSecrets, setShowSecrets] = useState(false);

  // Removed DEFAULT_COLUMNS from here
  const [tableColumns, setTableColumns] = useState(() => {
    try {
      const saved = localStorage.getItem('vix_vendas_columns');
      return saved ? JSON.parse(saved) : DEFAULT_COLUMNS;
    } catch {
      return DEFAULT_COLUMNS;
    }
  });
  const [showColConfig, setShowColConfig] = useState(false);

  const sheetsData = useSheetsData();

  // Auto-detect new custom columns from imported data
  useEffect(() => {
    if (sheetsData.vendasItems && sheetsData.vendasItems.length > 0) {
      const allKeys = new Set<string>();
      sheetsData.vendasItems.forEach(item => Object.keys(item).forEach(k => allKeys.add(k)));

      const standardKeys = [...CAMPOS_POR_MODULO['vendas'].map(c => c.key), 'devolucao'];
      const customKeys = Array.from(allKeys).filter(k => !standardKeys.includes(k) && k !== 'id');

      setTableColumns(prev => {
        const updated = [...prev];
        let changed = false;
        customKeys.forEach(ck => {
          if (!updated.find(c => c.id === ck)) {
            updated.push({ id: ck, label: ck, visible: true, isCustom: true });
            changed = true;
          }
        });
        if (changed) {
          localStorage.setItem('vix_vendas_columns', JSON.stringify(updated));
          return updated;
        }
        return prev;
      });
    }
  }, [sheetsData.vendasItems]);

  const toggleColumn = (id: string) => {
    setTableColumns(prev => {
      const next = prev.map(c => c.id === id ? { ...c, visible: !c.visible } : c);
      localStorage.setItem('vix_vendas_columns', JSON.stringify(next));
      return next;
    });
  };

  const moveColumn = (index: number, direction: 'up' | 'down') => {
    setTableColumns(prev => {
      const next = [...prev];
      if (direction === 'up' && index > 0) {
        [next[index - 1], next[index]] = [next[index], next[index - 1]];
      } else if (direction === 'down' && index < next.length - 1) {
        [next[index + 1], next[index]] = [next[index], next[index + 1]];
      }
      localStorage.setItem('vix_vendas_columns', JSON.stringify(next));
      return next;
    });
  };


  // === Original marketplace logic ===
  const handleAddAccount = () => {
    if (!newAccount.nome || !newAccount.plataforma || !newAccount.loja) return;
    const id = `custom_${Date.now()}` as MarketplaceId;
    setAccounts(prev => [...prev, { id, nome: newAccount.nome, plataforma: newAccount.plataforma, loja: newAccount.loja.toUpperCase().replace(/\s+/g, '_'), status: 'disconnected' as const, totalPedidos: 0, faturamento: 0 }]);
    setNewAccount({ nome: '', plataforma: '', loja: '', clientId: '', clientSecret: '', accessToken: '', refreshToken: '' });
    setShowSecrets(false);
    setDialogOpen(false);
  };

  const handleRemoveAccount = (id: MarketplaceId) => {
    setAccounts(prev => prev.filter(a => a.id !== id));
  };

  const totalFaturamento = accounts.reduce((s, a) => s + (a.faturamento || 0), 0);
  const totalPedidos = accounts.reduce((s, a) => s + (a.totalPedidos || 0), 0);
  const connectedCount = accounts.filter(a => a.status === 'connected').length;

  // Helper: get current date in BR timezone (UTC-3)
  const getNowBR = () => {
    const now = new Date();
    const brOffset = -3 * 60;
    return new Date(now.getTime() + (brOffset - now.getTimezoneOffset()) * 60000);
  };

  // Helper: parse date string (DD/MM/YYYY or ISO)
  const parseDate = (d: string) => {
    if (!d) return null;
    const parts = d.split('/');
    if (parts.length === 3) {
      const year = parts[2].length === 2 ? 2000 + +parts[2] : +parts[2];
      return new Date(year, +parts[1] - 1, +parts[0]);
    }
    const iso = new Date(d);
    return isNaN(iso.getTime()) ? null : iso;
  };

  // Date-ONLY filtered orders (for top KPI cards — NOT affected by marketplace/conta/origem filters)
  const dateOnlyOrders = useMemo(() => {
    if (!sheetsData.vendasItems || sheetsData.vendasItems.length === 0) return [];
    let items = sheetsData.vendasItems;
    if (showCustomDate && filterDataInicio && filterDataFim) {
      const start = new Date(filterDataInicio);
      const end = new Date(filterDataFim);
      end.setHours(23, 59, 59);
      items = items.filter(v => { const d = parseDate(v.data); return d && d >= start && d <= end; });
    } else if (!showCustomDate && filterDias > 0) {
      const cutoff = getNowBR(); cutoff.setDate(cutoff.getDate() - filterDias); cutoff.setHours(0, 0, 0, 0);
      items = items.filter(v => { const d = parseDate(v.data); return d && d >= cutoff; });
    }
    return items;
  }, [filterDias, showCustomDate, filterDataInicio, filterDataFim, sheetsData.vendasItems]);

  // Date-filtered orders (uses imported vendas if available, otherwise mock)
  const filteredOrders = useMemo(() => {
    if (sheetsData.vendasItems && sheetsData.vendasItems.length > 0) {
      let items = sheetsData.vendasItems;

      // Filter by marketplace (pedidoOrigem)
      if (filterMarketplace !== 'all') {
        items = items.filter(v => v.pedidoOrigem.toLowerCase().includes(filterMarketplace.toLowerCase()));
      }

      // Filter by conta (normalized)
      if (filterConta !== 'all') {
        items = items.filter(v => normalizeConta(v.conta) === filterConta || normalizeConta(v.contaMae) === filterConta);
      }

      // Filter by Canal/Origem category
      if (filterOrigem !== 'all') {
        items = items.filter(v => {
          const canal = (String((v as any).CANAL || (v as any).canal || (v as any).Canal || v.origem || '')).toLowerCase().trim();
          if (filterOrigem === 'Marketplace') return canal === 'ecommerce';
          if (filterOrigem === 'Atacado') return canal.includes('atacado');
          if (filterOrigem === 'Showroom') return canal.includes('showroom') || canal.includes('loja fisica') || canal.includes('loja física');
          return true;
        });
      }

      // Filter by SKU
      if (filterSku.trim()) {
        const q = filterSku.trim().toLowerCase();
        items = items.filter(v => v.sku.toLowerCase().includes(q) || v.skuProduto?.toLowerCase().includes(q) || v.numeroPedido.toLowerCase().includes(q));
      }

      // Date filter

      if (showCustomDate && filterDataInicio && filterDataFim) {
        const start = new Date(filterDataInicio);
        const end = new Date(filterDataFim);
        end.setHours(23, 59, 59);
        items = items.filter(v => {
          const d = parseDate(v.data);
          return d && d >= start && d <= end;
        });
      } else if (!showCustomDate && filterDias > 0) {
        const cutoff = getNowBR();
        cutoff.setDate(cutoff.getDate() - filterDias);
        cutoff.setHours(0, 0, 0, 0);
        items = items.filter(v => {
          const d = parseDate(v.data);
          return d && d >= cutoff;
        });
      }

      return items;
    }

    // Fallback to mock orders
    let orders = filterMarketplace === 'all'
      ? mockOrders
      : mockOrders.filter(o => o.marketplace === filterMarketplace);

    if (showCustomDate && filterDataInicio && filterDataFim) {
      orders = orders.filter(o => {
        const parts = o.data.split('/');
        if (parts.length === 3) {
          const orderDate = new Date(+parts[2], +parts[1] - 1, +parts[0]);
          const start = new Date(filterDataInicio);
          const end = new Date(filterDataFim);
          end.setHours(23, 59, 59);
          return orderDate >= start && orderDate <= end;
        }
        return true;
      });
    } else if (!showCustomDate && filterDias > 0) {
      const cutoff = getNowBR();
      cutoff.setDate(cutoff.getDate() - filterDias);
      cutoff.setHours(0, 0, 0, 0);
      orders = orders.filter(o => {
        const parts = o.data.split('/');
        if (parts.length === 3) {
          const orderDate = new Date(+parts[2], +parts[1] - 1, +parts[0]);
          return orderDate >= cutoff;
        }
        return true;
      });
    }
    return orders;
  }, [filterMarketplace, filterConta, filterOrigem, filterSku, filterDias, showCustomDate, filterDataInicio, filterDataFim, sheetsData.vendasItems]);

  const handleSync = (id: MarketplaceId) => {
    setSyncingAccounts(prev => new Set(prev).add(id));
    setTimeout(() => {
      setSyncingAccounts(prev => { const next = new Set(prev); next.delete(id); return next; });
    }, 2500);
  };

  const handleSyncAll = () => {
    accounts.filter(a => a.status === 'connected').forEach(a => handleSync(a.id));
  };

  // ──── AlertasIA sub-component ────
  function AlertasIA() {
    const { vendasItems, adsItems, estoqueItems, financeiroItems, performanceItems } = useSheetsData();
    const [activeCard, setActiveCard] = useState<string | null>(null);
    const [chatInput, setChatInput] = useState('');
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string; execute_result?: any; campaigns_data?: any; promotions_data?: any }[]>([]);
    const [aiLoading, setAiLoading] = useState(false);
    const [briefing, setBriefing] = useState('');
    const [briefingLoading, setBriefingLoading] = useState(false);
    const [briefingDone, setBriefingDone] = useState(false);
    const [mlContext, setMlContext] = useState<any>(null);
    const [mlContextLoading, setMlContextLoading] = useState(false);

    async function fetchMLContext(mode = 'all') {
      setMlContextLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const { data, error } = await supabase.functions.invoke('ai-analyst-context', {
          body: { mode },
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        if (!error && data) setMlContext(data);
        return data;
      } catch (e) {
        console.warn('ML context fetch failed:', e);
        return null;
      } finally {
        setMlContextLoading(false);
      }
    }

    function buildContextData(mode: string) {
      const resumeArray = (arr: any[] | null, fields: string[], limit = 30) =>
        (arr || []).slice(0, limit).map((item: any) =>
          Object.fromEntries(fields.map(f => [f, item[f]]))
        );

      // Dados das planilhas
      const sheetsContext: any = {};
      if (mode === 'all' || mode === 'briefing' || mode === 'ads') {
        sheetsContext.ads_planilha = resumeArray(adsItems, ['campanha', 'conta', 'investimento', 'receita', 'roas', 'acos', 'cliques', 'impressoes', 'idAnuncio'], 50);
      }
      if (mode === 'all' || mode === 'briefing' || mode === 'estoque') {
        sheetsContext.estoque_planilha = resumeArray(estoqueItems, ['skuPrincipal', 'nome', 'estoqueAtual', 'vmd', 'diasCobertura', 'necessidadeReposicao', 'conta'], 40);
      }
      if (mode === 'all' || mode === 'briefing' || mode === 'financeiro') {
        sheetsContext.financeiro = resumeArray(financeiroItems, ['skuPrincipal', 'nome', 'receita', 'margemReal', 'margemPercent', 'custo', 'taxas', 'unidadesVendidas'], 40);
      }
      if (mode === 'all' || mode === 'briefing' || mode === 'performance') {
        sheetsContext.performance = resumeArray(performanceItems, ['sku', 'titulo', 'visitas', 'vendas', 'conversao', 'preco', 'conta'], 40);
      }
      if (mode === 'all' || mode === 'briefing') {
        sheetsContext.vendas_resumo = {
          total_pedidos: vendasItems?.length || 0,
          faturamento_total: vendasItems?.reduce((s: number, v: any) => s + (v.valorTotal || 0), 0).toFixed(2),
          top_skus: resumeArray(vendasItems, ['sku', 'produto', 'quantidade', 'valorTotal', 'margem', 'liquido', 'conta'], 15),
        };
      }

      // Dados da API ML em tempo real (se disponíveis)
      const mlLiveContext = mlContext ? {
        estoque_ml_critico: mlContext.estoque_ml?.criticos?.slice(0, 20) || [],
        estoque_ml_zerado: mlContext.estoque_ml?.zerados?.slice(0, 10) || [],
        ads_live_hoje: {
          data: mlContext.ads_live?.data_referencia,
          gasto_total: mlContext.ads_live?.gasto_total_hoje?.toFixed(2),
          receita_total: mlContext.ads_live?.receita_total_hoje?.toFixed(2),
          roas_geral: mlContext.ads_live?.gasto_total_hoje > 0
            ? (mlContext.ads_live.receita_total_hoje / mlContext.ads_live.gasto_total_hoje).toFixed(2)
            : 0,
          campanhas_roas_zero: mlContext.ads_live?.roas_zero?.slice(0, 15) || [],
          top_performers: mlContext.ads_live?.top_performers?.slice(0, 10) || [],
        },
        fonte: 'API Mercado Livre — tempo real',
      } : { fonte: 'dados_ml_nao_carregados' };

      const clean = (obj: any) => JSON.parse(JSON.stringify(obj, (_, v) => v === undefined ? null : v));
      return clean({ ...sheetsContext, ml_realtime: mlLiveContext });
    }

    async function callAnalyst(mode: string, question: string) {
      setAiLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
        const { data, error } = await supabase.functions.invoke('ai-analyst', {
          body: { mode, question, context_data: buildContextData(mode), history },
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        if (error) throw new Error(error.message);
        return {
          answer: data?.answer || 'Sem resposta.',
          execute_result: data?.execute_result || null,
          campaigns_data: data?.campaigns_data || null,
          promotions_data: data?.promotions_data || null,
        };
      } catch (err: any) {
        return { answer: `Erro: ${err.message}`, execute_result: null, campaigns_data: null, promotions_data: null };
      } finally {
        setAiLoading(false);
      }
    }

    async function loadBriefing() {
      if (briefingDone) return;
      setBriefingLoading(true);
      try {
        await fetchMLContext('all').catch(() => null);
        const { data: { session } } = await supabase.auth.getSession();
        const { data, error } = await supabase.functions.invoke('ai-analyst', {
          body: { mode: 'briefing', context_data: buildContextData('briefing') },
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        if (error) throw new Error(error.message);
        setBriefing(data?.answer || '');
        setBriefingDone(true);
      } catch (err: any) {
        setBriefing(`Erro ao gerar briefing: ${err.message}`);
      } finally {
        setBriefingLoading(false);
      }
    }

    async function sendMessage() {
      if (!chatInput.trim() || !activeCard) return;
      const userMsg = chatInput.trim();
      setChatInput('');
      setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
      const result = await callAnalyst(activeCard, userMsg);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: result.answer,
        execute_result: result.execute_result,
        campaigns_data: result.campaigns_data,
        promotions_data: result.promotions_data,
      }]);
    }

    const CARDS = [
      { id: 'performance', icon: <BarChart2 className="w-5 h-5 text-yellow-500" />, bg: 'bg-yellow-500/10', title: 'Anúncios com Baixa Performance', desc: 'Visitas, conversão e vendas por anúncio', prompts: ['Quais anúncios pioraram esta semana?', 'Por que meus anúncios têm baixa conversão?', 'Quais são meus 10 melhores anúncios?'] },
      { id: 'ads', icon: <Zap className="w-5 h-5 text-red-500" />, bg: 'bg-red-500/10', title: 'ADS em Estado Crítico', desc: 'Campanhas com ROAS baixo queimando budget', prompts: ['Quais campanhas devo pausar agora?', 'Onde devo aumentar investimento?', 'Quanto perdi em campanhas ruins este mês?'] },
      { id: 'estoque', icon: <PackageX className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-500/10', title: 'Risco de Ruptura de Estoque', desc: 'Produtos com cobertura crítica vs VMD', prompts: ['Quais produtos vão rupturar esta semana?', 'Monte minha lista de compras do mês', 'O que devo enviar para o Full agora?'] },
      { id: 'financeiro', icon: <TrendingUp className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-500/10', title: 'Insights & Oportunidades', desc: 'Margem, lucratividade e oportunidades', prompts: ['Quais produtos estou vendendo no prejuízo?', 'Onde o ADS corrói minha margem?', 'Qual meu produto mais lucrativo do mês?'] },
    ];

    const activeCardData = CARDS.find(c => c.id === activeCard);

    return (
      <div className="space-y-5">
        {/* Header + Briefing */}
        <div className="bg-gradient-to-br from-primary/10 via-card to-accent/10 border border-border rounded-2xl p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/20">
                <Bot className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Análise Inteligente</h2>
                <p className="text-xs text-muted-foreground">Agente IA com seus dados reais</p>
              </div>
            </div>
            <button
              onClick={loadBriefing}
              disabled={briefingLoading || briefingDone}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {briefingLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {briefingLoading ? 'Analisando...' : briefingDone ? '✓ Briefing gerado' : 'Gerar briefing do dia'}
            </button>
            <button
              onClick={() => fetchMLContext('all')}
              disabled={mlContextLoading}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {mlContextLoading
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando ML...</>
                : <><RefreshCw className="w-3.5 h-3.5" /> Carregar dados ML</>
              }
            </button>
          </div>

          {briefingLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analisando seus dados...
            </div>
          )}

          {briefing && (
            <div className="prose prose-sm max-w-none text-foreground [&_strong]:text-foreground [&_h2]:text-foreground [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_ul]:mt-1 [&_li]:text-sm [&_li]:text-muted-foreground">
              <ReactMarkdown>{briefing}</ReactMarkdown>
            </div>
          )}
          {mlContext && (
            <div className="flex items-center gap-2 text-xs text-emerald-400 px-1 mt-2">
              <CheckCircle2 className="w-3 h-3" />
              Dados ML ao vivo carregados — {mlContext.timestamp ? new Date(mlContext.timestamp).toLocaleTimeString('pt-BR') : ''}
              {mlContext.ads_live?.gasto_total_hoje > 0 && (
                <span className="text-muted-foreground ml-2">
                  · ADS hoje: R$ {Number(mlContext.ads_live.gasto_total_hoje).toFixed(2)} investido
                </span>
              )}
            </div>
          )}
        </div>

        {/* 4 Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CARDS.map(card => (
            <div
              key={card.id}
              onClick={() => { setActiveCard(card.id); setMessages([]); setChatInput(''); }}
              className={`bg-card border rounded-xl p-4 md:p-5 cursor-pointer transition-all ${
                activeCard === card.id ? 'border-primary ring-1 ring-primary/20' : 'border-border hover:border-primary/40'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-lg ${card.bg}`}>{card.icon}</div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-foreground">{card.title}</h3>
                  <p className="text-xs text-muted-foreground">{card.desc}</p>
                </div>
                {activeCard === card.id && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium flex-shrink-0">Ativo</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {card.prompts.map((p, i) => (
                  <button
                    key={i}
                    onClick={async (e) => {
                      e.stopPropagation();
                      setActiveCard(card.id);
                      setMessages(prev => [...prev, { role: 'user', content: p }]);
                      const result = await callAnalyst(card.id, p);
                      setMessages(prev => [...prev, { role: 'assistant', content: result.answer, execute_result: result.execute_result, campaigns_data: result.campaigns_data, promotions_data: result.promotions_data }]);
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-muted/40 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Chat panel */}
        {activeCard && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
              <div className={`p-1.5 rounded-lg ${activeCardData?.bg}`}>{activeCardData?.icon}</div>
              <span className="text-sm font-medium text-foreground">{activeCardData?.title}</span>
              <button onClick={() => { setActiveCard(null); setMessages([]); }} className="ml-auto text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="p-4 space-y-3 min-h-[120px] max-h-[400px] overflow-y-auto">
              {messages.length === 0 && (
                <p className="text-xs text-muted-foreground text-center pt-4">
                  Clique em um prompt acima ou faça sua pergunta abaixo
                </p>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] px-3 py-2 rounded-xl text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <>
                        <div className="prose prose-sm max-w-none [&_strong]:font-semibold [&_ul]:mt-1 [&_li]:text-sm [&_p]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-2 [&_h3]:text-xs [&_h3]:font-semibold">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                        {msg.execute_result && (
                          <div className={`mt-2 px-3 py-2 rounded-lg text-xs font-medium ${
                            msg.execute_result.ok
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}>
                            {msg.execute_result.message}
                          </div>
                        )}
                        {msg.campaigns_data?.campaigns?.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            <p className="text-[10px] text-muted-foreground font-medium uppercase">
                              Campanhas de {msg.campaigns_data.sku} — {msg.campaigns_data.conta}
                            </p>
                            {msg.campaigns_data.campaigns.map((camp: any, ci: number) => (
                              <div key={ci} className="px-3 py-2 rounded-lg bg-background/50 border border-border text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium text-foreground truncate">{camp.name}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                    camp.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted text-muted-foreground'
                                  }`}>{camp.status === 'active' ? 'Ativa' : 'Pausada'}</span>
                                </div>
                                <div className="flex gap-3 mt-1 text-muted-foreground">
                                  <span>Budget: R$ {camp.budget}/dia</span>
                                  {camp.roas_target > 0 && <span>ROAS target: {camp.roas_target}x</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {msg.promotions_data?.promotions?.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                              Promoções ativas — {msg.promotions_data.conta}
                            </p>
                            {msg.promotions_data.promotions.map((promo: any, pi: number) => (
                              <div key={pi} className="px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs space-y-0.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium text-foreground">{promo.name || promo.type}</span>
                                  <span className="text-amber-400 font-medium">
                                    {promo.discount_value ? `-${promo.discount_value}%` : ''}
                                  </span>
                                </div>
                                <div className="text-muted-foreground flex gap-3">
                                  {promo.items_count > 0 && <span>{promo.items_count} produtos</span>}
                                  {promo.end_date && <span>até {new Date(promo.end_date).toLocaleDateString('pt-BR')}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : msg.content}
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted px-3 py-2 rounded-xl flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Analisando seus dados...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="px-4 pb-4 flex gap-2">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder={`Pergunte sobre ${activeCardData?.title.toLowerCase()}...`}
                className="flex-1 px-3 py-2 rounded-lg bg-muted text-sm text-foreground outline-none border border-border focus:border-primary/50"
                disabled={aiLoading}
              />
              <button
                onClick={sendMessage}
                disabled={aiLoading || !chatInput.trim()}
                className="px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Performance" subtitle="Análise de vendas, anúncios e métricas de desempenho" />

      {/* Date filter row at top */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1">
          {[7, 15, 30, 60, 90].map(d => (
            <button
              key={d}
              onClick={() => { setFilterDias(d); setShowCustomDate(false); setPedidosPage(0); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${!showCustomDate && filterDias === d
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
            >
              {d}d
            </button>
          ))}
          <button
            onClick={() => setShowCustomDate(prev => !prev)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${showCustomDate
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              }`}
          >
            <CalendarDays className="w-3 h-3" />
            Personalizado
          </button>
        </div>
        {showCustomDate && (
          <div className="flex items-center gap-2">
            <input type="date" value={filterDataInicio} onChange={e => { setFilterDataInicio(e.target.value); setPedidosPage(0); }} className="px-2 py-1 rounded-lg bg-card border border-border text-foreground text-xs" />
            <span className="text-xs text-muted-foreground">até</span>
            <input type="date" value={filterDataFim} onChange={e => { setFilterDataFim(e.target.value); setPedidosPage(0); }} className="px-2 py-1 rounded-lg bg-card border border-border text-foreground text-xs" />
          </div>
        )}
      </div>

      {/* KPI cards - data-driven from vendas, filtered by DATE ONLY */}
      {(() => {
        const useVendas = sheetsData.vendasItems && sheetsData.vendasItems.length > 0;
        const vendas = useVendas ? (dateOnlyOrders as any[]) : [];
        const fat = useVendas ? vendas.reduce((s: number, v: any) => s + (v.valorTotal || 0), 0) : 0;
        const ped = useVendas ? vendas.length : 0;
        const liq = vendas.reduce((s: number, v: any) => s + (v.liquido || 0), 0);
        const margemPct = fat > 0 ? ((liq / fat) * 100) : 0;
        return (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <KpiCard title="Faturamento Total" value={formatBRL(fat)} icon={DollarSign} delay={0} />
            <KpiCard title="Total Pedidos" value={ped.toLocaleString('pt-BR')} icon={ShoppingCart} delay={50} />
            <KpiCard title="Margem %" value={`${margemPct.toFixed(1)}%`} icon={TrendingUp} delay={100} />
            <KpiCard title="Contas Conectadas" value={`${connectedCount}/${accounts.length}`} icon={Wifi} delay={150} />
            <KpiCard title="Planilhas Configuradas" value={String(loadSheetConfigs().length)} icon={FileSpreadsheet} delay={200} />
          </div>
        );
      })()}

      <Tabs defaultValue="alertas" className="space-y-6">
        <TabsList className="bg-card border border-border overflow-x-auto flex-nowrap">
          <TabsTrigger value="alertas">🤖 Alertas</TabsTrigger>
          <TabsTrigger value="graficos">Gráficos</TabsTrigger>
          <TabsTrigger value="pedidos">Vendas / Pedidos</TabsTrigger>
          <TabsTrigger value="ads">Performance Anúncios</TabsTrigger>
          <TabsTrigger value="status-anuncios">Status Anúncios</TabsTrigger>
          <TabsTrigger value="perf-ads">Performance ADS</TabsTrigger>
          <TabsTrigger value="calculadora">🧮 Calculadora</TabsTrigger>
        </TabsList>

        {/* Tab: Planilhas — moved to Configurações */}
        <TabsContent value="calculadora">
          <CalculadoraTab />
        </TabsContent>


        {/* Tab: Alertas - AI Analysis */}
        <TabsContent value="alertas">
          <AlertasIA />
        </TabsContent>

        {/* Tab: Pedidos */}
        <TabsContent value="pedidos">
          {(() => {
            const useImported = sheetsData.vendasItems && sheetsData.vendasItems.length > 0;
            const vendasList = useImported ? (filteredOrders as any[]) : [];
            const mockList = !useImported ? (filteredOrders as any[]) : [];

            // Get unique marketplaces for filter
            const marketplacesUnicos = useImported
              ? [...new Set(sheetsData.vendasItems!.map(v => v.pedidoOrigem).filter(Boolean))]
              : [];

            // Get unique contas for filter (normalized)
            const contasUnicas = useImported
              ? getContasNormalizadas(sheetsData.vendasItems!.map(v => v.conta).filter(Boolean))
              : [];

            const displayList = useImported ? vendasList : mockList;

            // Sort displayList
            const sortableVendasCols = ['data', 'quantidade', 'valorTotal', 'impostos', 'comissao', 'cmv', 'liquido', 'margem', 'devolucao'];
            const sortedDisplayList = vendasSortField && sortableVendasCols.includes(vendasSortField)
              ? [...displayList].sort((a: any, b: any) => {
                  if (vendasSortField === 'data') {
                    const pa = (a.data || '').split('/');
                    const pb = (b.data || '').split('/');
                    const da = pa.length === 3 ? new Date(+pa[2] < 100 ? 2000 + +pa[2] : +pa[2], +pa[1] - 1, +pa[0]).getTime() : 0;
                    const db = pb.length === 3 ? new Date(+pb[2] < 100 ? 2000 + +pb[2] : +pb[2], +pb[1] - 1, +pb[0]).getTime() : 0;
                    return vendasSortDir === 'desc' ? db - da : da - db;
                  }
                  const va = typeof a[vendasSortField] === 'string' ? parseFloat(a[vendasSortField]?.replace(/[^\d.,-]/g, '')?.replace(',', '.') || '0') : (a[vendasSortField] || 0);
                  const vb = typeof b[vendasSortField] === 'string' ? parseFloat(b[vendasSortField]?.replace(/[^\d.,-]/g, '')?.replace(',', '.') || '0') : (b[vendasSortField] || 0);
                  return vendasSortDir === 'desc' ? vb - va : va - vb;
              })
              : displayList;

            const toggleVendasSort = (field: string) => {
              if (vendasSortField === field) {
                setVendasSortDir(d => d === 'desc' ? 'asc' : 'desc');
              } else {
                setVendasSortField(field);
                setVendasSortDir('desc');
              }
              setPedidosPage(0);
            };
            const vendasSortIcon = (field: string) => vendasSortField === field ? (vendasSortDir === 'desc' ? ' ↓' : ' ↑') : '';

            const totalPages = Math.ceil(sortedDisplayList.length / PEDIDOS_PER_PAGE);
            const paginatedList = sortedDisplayList.slice(pedidosPage * PEDIDOS_PER_PAGE, (pedidosPage + 1) * PEDIDOS_PER_PAGE);

            return (
              <>
                {/* Filters row */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  {useImported && marketplacesUnicos.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-muted-foreground">Origem:</label>
                      <select value={filterMarketplace} onChange={(e) => { setFilterMarketplace(e.target.value); setPedidosPage(0); }} className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs">
                        <option value="all">Todas</option>
                        {marketplacesUnicos.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {useImported && contasUnicas.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-muted-foreground">Conta:</label>
                      <select value={filterConta} onChange={(e) => { setFilterConta(e.target.value); setPedidosPage(0); }} className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs">
                        <option value="all">Todas</option>
                        {contasUnicas.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  )}


                  {!useImported && (
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-muted-foreground">Marketplace:</label>
                      <select value={filterMarketplace} onChange={(e) => setFilterMarketplace(e.target.value as MarketplaceId | 'all')} className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs">
                        <option value="all">Todos</option>
                        {accounts.filter(a => a.status === 'connected').map(a => (
                          <option key={a.id} value={a.id}>{a.nome}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {useImported && (
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-muted-foreground">SKU:</label>
                      <input
                        type="text"
                        placeholder="Buscar SKU..."
                        value={filterSku}
                        onChange={e => { setFilterSku(e.target.value); setPedidosPage(0); }}
                        className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs w-28"
                      />
                    </div>
                  )}

                  <span className="text-xs text-muted-foreground ml-auto">
                    {useImported && <span className="text-[hsl(var(--vix-success))] mr-2">● Dados importados</span>}
                    {displayList.length} pedidos
                  </span>
                </div>

                {/* Col Config Modal */}
                {showColConfig && (
                  <div className="mb-4 p-4 bg-card border border-border rounded-xl animate-fade-in">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-primary" />
                        Configurar Colunas da Tabela
                      </h4>
                      <button onClick={() => setShowColConfig(false)} className="text-muted-foreground hover:text-foreground"><XCircle className="w-4 h-4" /></button>
                    </div>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                      {tableColumns.filter(c => useImported ? !c.onlyMock : !c.onlyImported).map((col: any, idx: number, arr: any[]) => (
                        <div key={col.id} className="flex items-center justify-between p-2 rounded-lg border border-border bg-background hover:border-primary/30 transition-colors">
                          <div className="flex items-center gap-3">
                            <button onClick={() => toggleColumn(col.id)} className={`w-4 h-4 rounded flex items-center justify-center border ${col.visible ? 'bg-primary border-primary text-primary-foreground' : 'border-input bg-transparent'}`}>
                              {col.visible && <Check className="w-3 h-3" />}
                            </button>
                            <span className="text-xs font-medium text-foreground">
                              {col.label} {col.isCustom && <span className="ml-2 px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-normal text-muted-foreground">Extra</span>}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => moveColumn(tableColumns.findIndex(c => c.id === col.id), 'up')} disabled={idx === 0} className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                            <button onClick={() => moveColumn(tableColumns.findIndex(c => c.id === col.id), 'down')} disabled={idx === arr.length - 1} className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(() => {
                  const fat = vendasList.reduce((s: number, v: any) => s + (v.valorTotal || 0), 0);
                  const liq = vendasList.reduce((s: number, v: any) => s + (v.liquido || 0), 0);
                  const unid = vendasList.reduce((s: number, v: any) => s + (v.quantidade || 1), 0);
                  const margemPct = fat > 0 ? ((liq / fat) * 100) : 0;
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                      <div className="bg-card border border-border rounded-xl p-3">
                        <p className="text-[10px] text-muted-foreground">Faturamento</p>
                        <p className="text-sm font-bold text-foreground">{formatBRL(fat)}</p>
                      </div>
                      <div className="bg-card border border-border rounded-xl p-3">
                        <p className="text-[10px] text-muted-foreground">Líquido Total</p>
                        <p className="text-sm font-bold text-[hsl(var(--vix-success))]">{formatBRL(liq)}</p>
                      </div>
                      <div className="bg-card border border-border rounded-xl p-3">
                        <p className="text-[10px] text-muted-foreground">Margem %</p>
                        <p className={`text-sm font-bold ${margemPct >= 0 ? 'text-[hsl(var(--vix-success))]' : 'text-[hsl(var(--vix-danger))]'}`}>{margemPct.toFixed(1)}%</p>
                      </div>
                      <div className="bg-card border border-border rounded-xl p-3">
                        <p className="text-[10px] text-muted-foreground">Unidades</p>
                        <p className="text-sm font-bold text-foreground">{unid}</p>
                      </div>
                      <div className="bg-card border border-border rounded-xl p-3">
                        <p className="text-[10px] text-muted-foreground">Ticket Médio</p>
                        <p className="text-sm font-bold text-foreground">{formatBRL(fat / (vendasList.length || 1))}</p>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex items-center justify-end mb-3">
                  <button onClick={() => setShowColConfig(!showColConfig)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-foreground text-xs font-medium hover:bg-muted transition-colors">
                    <Settings2 className="w-3.5 h-3.5" />
                    Configurar Colunas
                  </button>
                </div>

                <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          {tableColumns.filter(c => c.visible && (useImported ? !c.onlyMock : !c.onlyImported)).map(col => {
                            const isSortable = sortableVendasCols.includes(col.id);
                            const isRight = ['quantidade', 'valorTotal', 'impostos', 'comissao', 'cmv', 'liquido', 'margem'].includes(col.id);
                            return (
                              <th
                                key={col.id}
                                className={`py-3 px-4 font-semibold text-muted-foreground ${isRight ? 'text-right' : col.id === 'status' ? 'text-center' : 'text-left'} ${isSortable ? 'cursor-pointer select-none hover:text-foreground transition-colors' : ''}`}
                                onClick={isSortable ? () => toggleVendasSort(col.id) : undefined}
                              >
                                {col.label}{isSortable ? vendasSortIcon(col.id) : ''}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {useImported ? paginatedList.map((venda: any, idx: number) => (
                          <tr key={venda.numeroPedido + '_' + idx} className="border-b border-border hover:bg-muted/30 transition-colors">
                            {tableColumns.filter(c => c.visible && !c.onlyMock).map(col => {
                              let content: any = venda[col.id];
                              let className = "py-3 px-4 text-xs text-foreground ";

                              if (col.id === 'numeroPedido' || col.id === 'sku') className += "font-mono ";
                              if (['impostos', 'comissao', 'cmv', 'data', 'conta'].includes(col.id)) className += "text-muted-foreground ";
                              if (col.id === 'liquido') className += "font-semibold text-[hsl(var(--vix-success))] text-right ";
                              if (col.id === 'valorTotal') className += "font-semibold text-right ";
                              if (['quantidade', 'margem'].includes(col.id)) className += "text-right ";
                              if (col.id === 'margem') className += "text-center font-medium ";
                              if (col.id === 'devolucao') { className += "text-muted-foreground "; }
                              if (['valorTotal', 'impostos', 'comissao', 'cmv', 'liquido'].includes(col.id)) {
                                content = formatBRL(content || (col.id === 'valorTotal' ? venda.precoUnitario : 0));
                                className += "text-right ";
                              }

                              return (
                                <td key={col.id} className={className.trim()}>
                                  {content}
                                </td>
                              );
                            })}
                          </tr>
                        )) : paginatedList.map((order: any) => {
                          const account = accounts.find(a => a.id === order.marketplace);
                          const st = statusConfig[order.statusPedido];
                          const StIcon = st?.icon || CheckCircle2;
                          return (
                            <tr key={order.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                              {tableColumns.filter(c => c.visible && !c.onlyImported).map(col => {
                                let content: any = order[col.id];
                                let className = "py-3 px-4 text-xs text-foreground ";

                                if (col.id === 'numeroPedido' || col.id === 'sku') className += "font-mono ";
                                if (col.id === 'data') className += "text-muted-foreground ";
                                if (col.id === 'conta') { content = account?.nome || order.marketplace; className += "text-muted-foreground text-xs "; }
                                if (col.id === 'valorTotal') { content = formatBRL(content); className += "font-semibold text-right "; }
                                if (col.id === 'quantidade') className += "text-right ";

                                if (col.id === 'status') {
                                  className += "text-center ";
                                  content = st ? (
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.class}`}>
                                      <StIcon className="w-3 h-3" />
                                      {st.label}
                                    </span>
                                  ) : null;
                                }

                                return (
                                  <td key={col.id} className={className.trim()}>
                                    {content}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                      <span className="text-xs text-muted-foreground">
                        Mostrando {pedidosPage * PEDIDOS_PER_PAGE + 1}–{Math.min((pedidosPage + 1) * PEDIDOS_PER_PAGE, sortedDisplayList.length)} de {sortedDisplayList.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setPedidosPage(p => Math.max(0, p - 1))}
                          disabled={pedidosPage === 0}
                          className="px-2.5 py-1 rounded text-xs font-medium bg-card border border-border text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                        >
                          ← Anterior
                        </button>
                        <span className="text-xs text-muted-foreground px-2">
                          {pedidosPage + 1} / {totalPages}
                        </span>
                        <button
                          onClick={() => setPedidosPage(p => Math.min(totalPages - 1, p + 1))}
                          disabled={pedidosPage >= totalPages - 1}
                          className="px-2.5 py-1 rounded text-xs font-medium bg-card border border-border text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                        >
                          Próximo →
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </TabsContent>

        {/* Tab: Performance Anúncios */}
        <TabsContent value="ads">
          {(() => {
            const perfItems = sheetsData.performanceItems || [];
            const contasUnicas = getContasNormalizadas(perfItems.map(p => p.conta).filter(Boolean));

            // Parse dataRef "DD/MM/YYYY a DD/MM/YYYY" or "DD/MM/YYYY" to Date
            const parsePerfDate = (ref: string): Date | null => {
              if (!ref) return null;
              const parts = ref.split(' a ');
              const dateStr = (parts[0] || '').trim();
              const m = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
              if (!m) return null;
              return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
            };

            // Compute date ranges based on global filterDias
            const today = getNowBR();
            today.setHours(23, 59, 59, 999);
            const curEnd = new Date(today);
            const curStart = new Date(today);
            curStart.setDate(curStart.getDate() - filterDias + 1);
            curStart.setHours(0, 0, 0, 0);
            const prevEnd = new Date(curStart);
            prevEnd.setDate(prevEnd.getDate() - 1);
            prevEnd.setHours(23, 59, 59, 999);
            const prevStart = new Date(prevEnd);
            prevStart.setDate(prevStart.getDate() - filterDias + 1);
            prevStart.setHours(0, 0, 0, 0);

            const fmtDate = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            const curLabel = `${fmtDate(curStart)} a ${fmtDate(curEnd)}`;
            const prevLabel = `${fmtDate(prevStart)} a ${fmtDate(prevEnd)}`;

            // Tag each item with its parsed date
            const itemsWithDate = perfItems.map(p => ({ ...p, _date: parsePerfDate(p.dataRef) })).filter(p => p._date !== null);

            // Filter by current period
            const curPeriodRaw = itemsWithDate.filter(p => p._date! >= curStart && p._date! <= curEnd);
            const prevPeriodRaw = itemsWithDate.filter(p => p._date! >= prevStart && p._date! <= prevEnd);

            // Deduplicate: same idAnuncio + same day = keep only ONE (last occurrence wins)
            const dedup = (items: typeof curPeriodRaw) => {
              const map = new Map<string, typeof items[0]>();
              items.forEach(p => {
                const key = `${p.idAnuncio}__${p.dataRef}`;
                map.set(key, p); // last wins
              });
              return Array.from(map.values());
            };
            const curPeriodItems = dedup(curPeriodRaw);
            const prevPeriodItems = dedup(prevPeriodRaw);

            // Filter by conta
            const curByConta = perfFilterConta === 'all' ? curPeriodItems : curPeriodItems.filter(p => normalizeConta(p.conta) === perfFilterConta);
            const prevByConta = perfFilterConta === 'all' ? prevPeriodItems : prevPeriodItems.filter(p => normalizeConta(p.conta) === perfFilterConta);

            // Aggregate by idAnuncio: sum visitas/vendas/canceladas, avg conversao, keep latest preco/titulo/sku/link/conta
            type AggItem = { idAnuncio: string; sku: string; titulo: string; preco: number; visitas: number; vendas: number; canceladas: number; conversao: number; link: string; conta: string; dataRef: string; plataforma: string };
            const aggregate = (items: typeof curByConta): AggItem[] => {
              const map = new Map<string, { sum: AggItem; count: number }>();
              items.forEach(p => {
                const existing = map.get(p.idAnuncio);
                if (existing) {
                  existing.sum.visitas += p.visitas;
                  existing.sum.vendas += p.vendas;
                  existing.sum.canceladas += p.canceladas;
                  existing.sum.conversao += p.conversao;
                  existing.count++;
                  // Keep latest preco
                  if (p._date! > parsePerfDate(existing.sum.dataRef)!) {
                    existing.sum.preco = p.preco;
                    existing.sum.dataRef = p.dataRef;
                  }
                } else {
                  map.set(p.idAnuncio, {
                    sum: { idAnuncio: p.idAnuncio, sku: p.sku, titulo: p.titulo, preco: p.preco, visitas: p.visitas, vendas: p.vendas, canceladas: p.canceladas, conversao: p.conversao, link: p.link, conta: p.conta, dataRef: p.dataRef, plataforma: p.plataforma },
                    count: 1,
                  });
                }
              });
              // Finalize conversao: (vendas - canceladas) / visitas
              return Array.from(map.values()).map(({ sum, count }) => {
                const totalVisitas = sum.visitas;
                const vendasLiquidas = Math.max(0, sum.vendas - sum.canceladas);
                return { ...sum, conversao: totalVisitas > 0 ? (vendasLiquidas / totalVisitas) * 100 : 0 };
              });
            };

            const curAgg = aggregate(curByConta);
            const prevAgg = aggregate(prevByConta);

            // Build map: idAnuncio -> prev metrics
            const prevPerfMap = new Map<string, { visitas: number; vendas: number; canceladas: number; conversao: number; preco: number }>();
            prevAgg.forEach(p => {
              prevPerfMap.set(p.idAnuncio, { visitas: p.visitas, vendas: p.vendas, canceladas: p.canceladas, conversao: p.conversao, preco: p.preco });
            });
            const hasPrevPerf = prevAgg.length > 0;

            // Sort
            const sorted = [...curAgg].sort((a, b) => {
              const fieldMap: Record<string, (i: any) => number> = {
                visitas: i => i.visitas, vendas: i => i.vendas,
                canceladas: i => i.canceladas, conversao: i => i.conversao,
              };
              const fn = fieldMap[perfSortField];
              if (!fn) return 0;
              return perfSortDir === 'desc' ? fn(b) - fn(a) : fn(a) - fn(b);
            });
            const filtered = sorted;

            const totalVisitas = filtered.reduce((s, p) => s + p.visitas, 0);
            const totalVendas = filtered.reduce((s, p) => s + p.vendas, 0);
            const totalCanceladas = filtered.reduce((s, p) => s + p.canceladas, 0);
            const convMedia = totalVisitas > 0 ? (Math.max(0, totalVendas - totalCanceladas) / totalVisitas) * 100 : 0;
            const prevTotalVisitas = prevAgg.reduce((s, p) => s + p.visitas, 0);
            const prevTotalVendas = prevAgg.reduce((s, p) => s + p.vendas, 0);
            const prevTotalCanc = prevAgg.reduce((s, p) => s + p.canceladas, 0);
            const prevConvMedia = (() => { const pv = prevAgg.reduce((s, p) => s + p.visitas, 0); return pv > 0 ? (Math.max(0, prevTotalVendas - prevTotalCanc) / pv) * 100 : 0; })();

            // Delta helper
            const PerfDelta = ({ cur, prev, invert }: { cur: number; prev: number; invert?: boolean }) => {
              if (!hasPrevPerf) return null;
              if (prev === 0 && cur === 0) return <span className="text-[10px] text-muted-foreground ml-1">—</span>;
              if (prev === 0) return <span className="text-[10px] text-emerald-500 ml-1">↑ novo</span>;
              const pct = ((cur - prev) / Math.abs(prev)) * 100;
              const isUp = pct > 0;
              const isSame = Math.abs(pct) < 0.5;
              if (isSame) return <span className="text-[10px] text-muted-foreground ml-1">→</span>;
              const goodUp = invert ? !isUp : isUp;
              const color = goodUp ? 'text-emerald-500' : 'text-red-500';
              const arrow = isUp ? '↑' : '↓';
              return <span className={`text-[10px] font-medium ${color} ml-1`} title={`Anterior: ${prev}`}>{arrow} {Math.abs(pct).toFixed(0)}%</span>;
            };


            const PERF_PER_PAGE = 50;
            const totalPerfPages = Math.ceil(filtered.length / PERF_PER_PAGE);
            const perfPaginated = filtered.slice(perfPage * PERF_PER_PAGE, (perfPage + 1) * PERF_PER_PAGE);

            // Sort toggle helper
            const toggleSort = (field: string) => {
              if (perfSortField === field) {
                setPerfSortDir(d => d === 'desc' ? 'asc' : 'desc');
              } else {
                setPerfSortField(field);
                setPerfSortDir('desc');
              }
              setPerfPage(0);
            };
            const sortIcon = (field: string) => perfSortField === field ? (perfSortDir === 'desc' ? ' ↓' : ' ↑') : '';

            if (perfItems.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <TrendingUp className="w-12 h-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum dado de performance importado</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Vá em <strong>Planilhas Google</strong>, adicione uma configuração com módulo <strong>Performance Anúncios</strong> e importe as abas PERF-GS TORNEIRAS, PERF-VIA FLIX e PERF-DECARION TORNEIRAS.
                  </p>
                </div>
              );
            }

            return (
              <>
                {/* KPI Cards with Delta */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <KpiCard title="Total Visitas" value={totalVisitas.toLocaleString('pt-BR')} icon={Eye} delay={0} extra={hasPrevPerf ? <PerfDelta cur={totalVisitas} prev={prevTotalVisitas} /> : undefined} />
                  <KpiCard title="Total Vendas" value={totalVendas.toLocaleString('pt-BR')} icon={ShoppingCart} delay={50} extra={hasPrevPerf ? <PerfDelta cur={totalVendas} prev={prevTotalVendas} /> : undefined} />
                  <KpiCard title="Canceladas" value={totalCanceladas.toLocaleString('pt-BR')} icon={AlertTriangle} delay={100} extra={hasPrevPerf ? <PerfDelta cur={totalCanceladas} prev={prevTotalCanc} invert /> : undefined} />
                  <KpiCard title="Conversão Média" value={`${convMedia.toFixed(2)}%`} icon={TrendingUp} delay={150} extra={hasPrevPerf ? <PerfDelta cur={convMedia} prev={prevConvMedia} /> : undefined} />
                </div>

                {/* Filters & Period Info */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-muted-foreground">Período:</label>
                    <span className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs font-medium">📅 {curLabel}</span>
                  </div>
                  {contasUnicas.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-muted-foreground">Conta:</label>
                      <select value={perfFilterConta} onChange={(e) => { setPerfFilterConta(e.target.value); setPerfPage(0); }} className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs">
                        <option value="all">Todas</option>
                        {contasUnicas.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground">{filtered.length} anúncios</span>
                  {hasPrevPerf && <span className="px-2 py-1 rounded-md bg-primary/10 text-primary text-[11px] font-medium">vs {prevLabel}</span>}
                </div>

                {/* Data Table */}
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">ID Anúncio</th>
                          <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">SKU</th>
                          <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Título</th>
                          <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Preço</th>
                          <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('visitas')}>Visitas{sortIcon('visitas')}</th>
                          <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('vendas')}>Vendas{sortIcon('vendas')}</th>
                          <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('canceladas')}>Canc.{sortIcon('canceladas')}</th>
                          <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('conversao')}>Conv. %{sortIcon('conversao')}</th>
                          <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Conta</th>
                          <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap" style={{ minWidth: '180px' }}>Período</th>
                        </tr>
                      </thead>
                      <tbody>
                        {perfPaginated.map((item, idx) => {
                          const prev = prevPerfMap.get(item.idAnuncio);
                          return (
                            <tr key={`${item.idAnuncio}-${idx}`} className="border-t border-border hover:bg-muted/30 transition-colors">
                              <td className="px-3 py-2">
                                {item.link ? (
                                  <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{item.idAnuncio}</a>
                                ) : item.idAnuncio}
                              </td>
                              <td className="px-3 py-2 font-mono">{item.sku}</td>
                              <td className="px-3 py-2 max-w-[200px] truncate" title={item.titulo}>{item.titulo}</td>
                              <td className="px-3 py-2 text-right">
                                {formatBRL(item.preco)}
                                {prev && <PerfDelta cur={item.preco} prev={prev.preco} />}
                              </td>
                              <td className="px-3 py-2 text-right font-medium">
                                {item.visitas.toLocaleString('pt-BR')}
                                {prev && <PerfDelta cur={item.visitas} prev={prev.visitas} />}
                              </td>
                              <td className="px-3 py-2 text-right font-medium text-[hsl(var(--vix-success))]">
                                {item.vendas.toLocaleString('pt-BR')}
                                {prev && <PerfDelta cur={item.vendas} prev={prev.vendas} />}
                              </td>
                              <td className="px-3 py-2 text-right text-[hsl(var(--vix-danger))]">{item.canceladas}</td>
                              <td className="px-3 py-2 text-right">
                                <span className={`font-medium ${item.conversao >= 5 ? 'text-[hsl(var(--vix-success))]' : item.conversao >= 2 ? 'text-[hsl(var(--vix-warning))]' : 'text-[hsl(var(--vix-danger))]'}`}>
                                  {item.conversao.toFixed(2)}%
                                </span>
                                {prev && <PerfDelta cur={item.conversao} prev={prev.conversao} />}
                              </td>
                              <td className="px-3 py-2">{item.conta}</td>
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap font-mono text-[11px]">{curLabel}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPerfPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                      <span className="text-xs text-muted-foreground">
                        Mostrando {perfPage * PERF_PER_PAGE + 1}–{Math.min((perfPage + 1) * PERF_PER_PAGE, filtered.length)} de {filtered.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setPerfPage(p => Math.max(0, p - 1))} disabled={perfPage === 0} className="px-2.5 py-1 rounded text-xs font-medium bg-card border border-border text-foreground hover:bg-muted disabled:opacity-40 transition-colors">← Anterior</button>
                        <span className="text-xs text-muted-foreground px-2">{perfPage + 1} / {totalPerfPages}</span>
                        <button onClick={() => setPerfPage(p => Math.min(totalPerfPages - 1, p + 1))} disabled={perfPage >= totalPerfPages - 1} className="px-2.5 py-1 rounded text-xs font-medium bg-card border border-border text-foreground hover:bg-muted disabled:opacity-40 transition-colors">Próximo →</button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </TabsContent>

        {/* Tab: Gráficos */}
        <TabsContent value="graficos">
          <GraficosTab />
        </TabsContent>

        {/* Tab: Performance ADS */}
        <TabsContent value="perf-ads">
          <PerformanceAdsTab />
        </TabsContent>

        {/* Tab: Status Anúncios */}
        <TabsContent value="status-anuncios">
          <StatusAnunciosTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
