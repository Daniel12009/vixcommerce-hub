import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Wifi, WifiOff, ShoppingCart, TrendingUp, DollarSign, Package, ChevronDown, ChevronUp, Clock, CheckCircle2, XCircle, Truck, AlertTriangle, Plus, Trash2, Key, Eye, EyeOff, FileSpreadsheet, Loader2, Download, Settings2, ArrowRight, Check, CalendarDays } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { KpiCard } from '@/components/shared/KpiCard';
import { mockMarketplaceAccounts, mockOrders, mockAdsCampaigns, mockSalesByDay, mockRevenueByMarketplace } from '@/lib/mock-marketplace';
import { formatBRL } from '@/lib/utils-vix';
import type { MarketplaceAccount, MarketplaceId } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, PieChart, Pie, Cell, Area, AreaChart } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import {
  type SheetConfig, type ModuloDestino,
  CAMPOS_POR_MODULO, loadSheetConfigs, saveSheetConfigs,
  extractSpreadsheetId, parseSheetRowsWithFixos,
} from '@/lib/sheets-store';

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
  financeiro: 'Financeiro',
  vendas: 'Vendas / Pedidos',
  performance: 'Performance Anúncios',
};

const moduloColors: Record<ModuloDestino, string> = {
  estoque: 'bg-[hsl(var(--vix-info)/0.1)] text-[hsl(var(--vix-info))]',
  financeiro: 'bg-[hsl(var(--vix-success)/0.1)] text-[hsl(var(--vix-success))]',
  vendas: 'bg-[hsl(var(--vix-warning)/0.1)] text-[hsl(var(--vix-warning))]',
  performance: 'bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]',
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
  const [filterDias, setFilterDias] = useState<number>(90);
  const [filterDataInicio, setFilterDataInicio] = useState<string>('');
  const [filterDataFim, setFilterDataFim] = useState<string>('');
  const [pedidosPage, setPedidosPage] = useState(0);
  const [perfFilterConta, setPerfFilterConta] = useState<string>('all');
  const [perfFilterPeriodo, setPerfFilterPeriodo] = useState<string>('7');
  const [perfSelectedPeriodo, setPerfSelectedPeriodo] = useState<string>('all');
  const [perfPage, setPerfPage] = useState(0);
  const [perfSortField, setPerfSortField] = useState<string>('vendas');
  const [perfSortDir, setPerfSortDir] = useState<'asc' | 'desc'>('desc');
  const [vendasSortField, setVendasSortField] = useState<string>('');
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
      
      const standardKeys = CAMPOS_POR_MODULO['vendas'].map(c => c.key);
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

  // Google Sheets state
  const [sheetConfigs, setSheetConfigs] = useState<SheetConfig[]>(() => loadSheetConfigs());
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetInfo, setSheetInfo] = useState<{ title: string; sheets: string[] } | null>(null);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<string[][] | null>(null);
  const [importingConfig, setImportingConfig] = useState<string | null>(null);

  // New config form state
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const [newConfigAba, setNewConfigAba] = useState('');
  const [newConfigModulo, setNewConfigModulo] = useState<ModuloDestino>('estoque');
  const [newConfigMapping, setNewConfigMapping] = useState<Record<string, string>>({});
  const [newConfigLinhaInicial, setNewConfigLinhaInicial] = useState(1);
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [mappingHeaders, setMappingHeaders] = useState<string[]>([]);
  const [newConfigValoresFixos, setNewConfigValoresFixos] = useState<Record<string, string>>({});
  const [customColumns, setCustomColumns] = useState<{ id: string; targetName: string; selectedSourceColumn: string }[]>([]);

  // Persist configs
  useEffect(() => {
    saveSheetConfigs(sheetConfigs);
  }, [sheetConfigs]);

  const handleLoadSheetInfo = async () => {
    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    if (!spreadsheetId) {
      toast.error('URL inválida. Cole a URL completa da planilha Google.');
      return;
    }
    setLoadingSheet(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'info', spreadsheetId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSheetInfo({
        title: data.properties?.title || 'Sem título',
        sheets: data.sheets?.map((s: any) => s.properties?.title) || [],
      });
      toast.success(`Planilha "${data.properties?.title}" conectada!`);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setLoadingSheet(false);
    }
  };

  const handleFetchHeadersForMapping = async (abaNome: string, existingMapping?: Record<string, string>, existingFixos?: Record<string, string>) => {
    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    if (!spreadsheetId) return;
    setLoadingSheet(true);
    try {
      // Fetch the header row based on linhaInicial
      const headerRow = newConfigLinhaInicial;
      const { data, error } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'read', spreadsheetId, range: `${abaNome}!${headerRow}:${headerRow}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const headers = data.values?.[0] || [];
      setMappingHeaders(headers);
      
      if (existingMapping) {
        setNewConfigMapping(existingMapping);
        setNewConfigValoresFixos(existingFixos || {});
        
        // Extract custom columns that are not in CAMPOS_POR_MODULO
        const camposPadraoKeys = CAMPOS_POR_MODULO[newConfigModulo].map(c => c.key);
        const mappedCustoms = Object.entries(existingMapping)
          .filter(([k]) => !camposPadraoKeys.includes(k))
          .map(([k, v]) => ({ id: `cust_${Date.now()}_${Math.random()}`, targetName: k, selectedSourceColumn: v }));
        setCustomColumns(mappedCustoms);
      } else {
        setNewConfigMapping({});
        setNewConfigValoresFixos({});
        setCustomColumns([]);
      }
      
      setShowMappingDialog(true);
    } catch (err: any) {
      toast.error(`Erro ao ler cabeçalhos: ${err.message}`);
    } finally {
      setLoadingSheet(false);
    }
  };

  const handleEditConfig = (config: SheetConfig) => {
    setEditingConfigId(config.id);
    setSheetUrl(config.url);
    setSheetInfo({ title: config.nome.split(' — ')[0], sheets: [config.abaNome] });
    setNewConfigAba(config.abaNome);
    setNewConfigModulo(config.moduloDestino);
    setNewConfigLinhaInicial(config.linhaInicial);
    // Fetch headers and populate
    handleFetchHeadersForMapping(config.abaNome, config.mapeamento, config.valoresFixos);
  };

  const handleSaveConfig = () => {
    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    if (!spreadsheetId || !newConfigAba || !newConfigModulo) return;

    const campos = CAMPOS_POR_MODULO[newConfigModulo];
    const obrigatorios = campos.filter(c => c.obrigatorio);
    const faltando = obrigatorios.filter(c => !newConfigMapping[c.key] && !newConfigValoresFixos[c.key]);
    if (faltando.length > 0) {
      toast.error(`Mapeie os campos obrigatórios: ${faltando.map(f => f.label).join(', ')}`);
      return;
    }

    // Integrate custom columns into mapping
    const finalMapping = { ...newConfigMapping };
    customColumns.forEach(cc => {
      if (cc.targetName.trim() && cc.selectedSourceColumn && cc.selectedSourceColumn !== '__none__') {
        finalMapping[cc.targetName.trim()] = cc.selectedSourceColumn;
      }
    });

    // Clean out empty fixed values
    const fixos: Record<string, string> = {};
    for (const [k, v] of Object.entries(newConfigValoresFixos)) {
      if (v.trim()) fixos[k] = v.trim();
    }

    const config: SheetConfig = {
      id: editingConfigId ? editingConfigId : `${spreadsheetId}_${newConfigAba}_${Date.now()}`,
      url: sheetUrl,
      nome: `${sheetInfo?.title || 'Planilha'} — ${newConfigAba}`,
      spreadsheetId,
      abaNome: newConfigAba,
      moduloDestino: newConfigModulo,
      mapeamento: finalMapping,
      valoresFixos: Object.keys(fixos).length > 0 ? fixos : undefined,
      linhaInicial: newConfigLinhaInicial,
    };

    if (editingConfigId) {
      setSheetConfigs(prev => prev.map(c => c.id === editingConfigId ? config : c));
      toast.success(`Configuração atualizada: ${newConfigAba}`);
    } else {
      setSheetConfigs(prev => [...prev, config]);
      toast.success(`Configuração salva: ${newConfigAba} → ${moduloLabels[newConfigModulo]}`);
    }

    setShowMappingDialog(false);
    setEditingConfigId(null);
    setNewConfigMapping({});
    setNewConfigValoresFixos({});
    setCustomColumns([]);
    setNewConfigAba('');
    setSheetUrl('');
    setSheetInfo(null);
  };

  const handleRemoveConfig = (id: string) => {
    setSheetConfigs(prev => prev.filter(c => c.id !== id));
    if (selectedConfig === id) setSelectedConfig(null);
  };

  const handleImportConfig = async (config: SheetConfig) => {
    setImportingConfig(config.id);
    try {
      const startRow = config.linhaInicial || 1;
      const { data, error } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'read', spreadsheetId: config.spreadsheetId, range: `${config.abaNome}!A${startRow}:BZ` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const allRows = data.values || [];
      if (allRows.length < 2) {
        toast.error('Planilha sem dados (precisa de cabeçalho + pelo menos 1 linha).');
        return;
      }

      const headers = allRows[0];
      const rows = allRows.slice(1);
      const parsed = parseSheetRowsWithFixos(headers, rows, config.mapeamento, config.valoresFixos);

      if (config.moduloDestino === 'estoque') {
        sheetsData.setEstoqueFromSheet(parsed);
      } else if (config.moduloDestino === 'financeiro') {
        sheetsData.setFinanceiroFromSheet(parsed);
      } else if (config.moduloDestino === 'vendas') {
        sheetsData.setVendasFromSheet(parsed);
      } else if (config.moduloDestino === 'performance') {
        sheetsData.setPerformanceFromSheet(parsed, config.abaNome);
      }

      // Update last sync
      setSheetConfigs(prev => prev.map(c =>
        c.id === config.id ? { ...c, ultimaSync: new Date().toLocaleString('pt-BR') } : c
      ));

      toast.success(`${parsed.length} linhas importadas para ${moduloLabels[config.moduloDestino]}!`);
    } catch (err: any) {
      toast.error(`Erro ao importar: ${err.message}`);
    } finally {
      setImportingConfig(null);
    }
  };

  const handlePreviewConfig = async (config: SheetConfig) => {
    setSelectedConfig(config.id);
    setLoadingSheet(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'read', spreadsheetId: config.spreadsheetId, range: `${config.abaNome}!A1:Z20` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPreviewData(data.values || []);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
      setPreviewData(null);
    } finally {
      setLoadingSheet(false);
    }
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

  // Helper: parse date string
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
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - filterDias);
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

      // Filter by conta
      if (filterConta !== 'all') {
        items = items.filter(v => v.conta.toLowerCase() === filterConta.toLowerCase() || v.contaMae.toLowerCase() === filterConta.toLowerCase());
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
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - filterDias);
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
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - filterDias);
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

  return (
    <div>
      <PageHeader title="Atualizar Dados" subtitle="Sincronização de vendas e gestão de marketplaces" />

      {/* Date filter row at top */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1">
          {[7, 15, 30, 60, 90].map(d => (
            <button
              key={d}
              onClick={() => { setFilterDias(d); setShowCustomDate(false); setPedidosPage(0); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                !showCustomDate && filterDias === d
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {d}d
            </button>
          ))}
          <button
            onClick={() => setShowCustomDate(prev => !prev)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              showCustomDate
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
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
            <KpiCard title="Faturamento Total" value={formatBRL(fat)} icon={DollarSign} delay={0} />
            <KpiCard title="Total Pedidos" value={ped.toLocaleString('pt-BR')} icon={ShoppingCart} delay={50} />
            <KpiCard title="Margem %" value={`${margemPct.toFixed(1)}%`} icon={TrendingUp} delay={100} />
            <KpiCard title="Contas Conectadas" value={`${connectedCount}/${accounts.length}`} icon={Wifi} delay={150} />
            <KpiCard title="Planilhas Configuradas" value={String(sheetConfigs.length)} icon={FileSpreadsheet} delay={200} />
          </div>
        );
      })()}

      <Tabs defaultValue="planilhas" className="space-y-6">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="planilhas">Planilhas Google</TabsTrigger>
          <TabsTrigger value="contas">Contas & Sync</TabsTrigger>
          <TabsTrigger value="pedidos">Vendas / Pedidos</TabsTrigger>
          <TabsTrigger value="ads">Performance Anúncios</TabsTrigger>
          <TabsTrigger value="graficos">Gráficos</TabsTrigger>
        </TabsList>

        {/* Tab: Planilhas Google */}
        <TabsContent value="planilhas">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Configs list + Add new */}
            <div className="space-y-4">
              {/* Saved configs */}
              <div className="bg-card border border-border rounded-xl p-5 animate-fade-in">
                <h3 className="text-foreground font-semibold text-sm mb-3 flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-primary" />
                  Fontes Configuradas
                </h3>
                {sheetConfigs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma fonte configurada. Conecte uma planilha abaixo.</p>
                ) : (
                  <div className="space-y-2">
                    {sheetConfigs.map(config => (
                      <div
                        key={config.id}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors border ${
                          selectedConfig === config.id ? 'border-primary/30 bg-primary/5' : 'border-transparent hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button onClick={() => handlePreviewConfig(config)} className="flex-1 text-left">
                            <p className="font-medium text-foreground truncate text-xs">{config.nome}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${moduloColors[config.moduloDestino]}`}>
                                {moduloLabels[config.moduloDestino]}
                              </span>
                              <span className="text-[10px] text-muted-foreground">Aba: {config.abaNome}</span>
                              {config.linhaInicial > 1 && (
                                <span className="text-[10px] text-muted-foreground">Linha: {config.linhaInicial}</span>
                              )}
                            </div>
                            {config.ultimaSync && (
                              <p className="text-[10px] text-muted-foreground mt-1">Última sync: {config.ultimaSync}</p>
                            )}
                          </button>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => handleImportConfig(config)}
                              disabled={importingConfig === config.id}
                              className="p-1 rounded hover:bg-primary/10 text-primary transition-colors"
                              title="Importar dados"
                            >
                              {importingConfig === config.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Download className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              onClick={() => handleRemoveConfig(config.id)}
                              className="p-1 rounded hover:bg-[hsl(var(--vix-danger)/0.1)] text-muted-foreground hover:text-[hsl(var(--vix-danger))] transition-colors"
                              title="Remover"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleEditConfig(config)}
                              disabled={!!importingConfig}
                              className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                              title="Editar mapeamento"
                            >
                              <Settings2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Import all button */}
                {sheetConfigs.length > 0 && (
                  <button
                    onClick={() => sheetConfigs.forEach(c => handleImportConfig(c))}
                    disabled={!!importingConfig}
                    className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${importingConfig ? 'animate-spin' : ''}`} />
                    Importar Tudo
                  </button>
                )}
              </div>

              {/* Connect new sheet */}
              <div className="bg-card border border-border rounded-xl p-5 animate-fade-in">
                <h3 className="text-foreground font-semibold text-sm mb-3 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-primary" />
                  Adicionar Fonte
                </h3>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">URL da Planilha Google</Label>
                    <Input
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      value={sheetUrl}
                      onChange={e => { setSheetUrl(e.target.value); setSheetInfo(null); }}
                      className="text-xs"
                    />
                  </div>
                  <button
                    onClick={handleLoadSheetInfo}
                    disabled={!sheetUrl || loadingSheet}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50"
                  >
                    {loadingSheet && !showMappingDialog ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                    Conectar Planilha
                  </button>

                  {/* After connection: pick tab + module */}
                  {sheetInfo && (
                    <div className="space-y-3 pt-3 border-t border-border">
                      <p className="text-xs font-medium text-foreground">{sheetInfo.title}</p>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Aba da Planilha</Label>
                        <Select value={newConfigAba} onValueChange={v => setNewConfigAba(v)}>
                          <SelectTrigger className="text-xs"><SelectValue placeholder="Selecione a aba" /></SelectTrigger>
                          <SelectContent>
                            {sheetInfo.sheets.filter(s => s.trim() !== '').map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Destino dos Dados</Label>
                        <Select value={newConfigModulo} onValueChange={v => setNewConfigModulo(v as ModuloDestino)}>
                          <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="estoque">📦 Estoque</SelectItem>
                            <SelectItem value="financeiro">💰 Financeiro</SelectItem>
                            <SelectItem value="vendas">🛒 Vendas / Pedidos</SelectItem>
                            <SelectItem value="performance">📊 Performance Anúncios</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Linha do Cabeçalho</Label>
                        <Input
                          type="number"
                          min={1}
                          value={newConfigLinhaInicial}
                          onChange={e => setNewConfigLinhaInicial(Math.max(1, parseInt(e.target.value) || 1))}
                          className="text-xs"
                          placeholder="Ex: 7 (se dados começam na linha 7)"
                        />
                        <p className="text-[10px] text-muted-foreground">Linha onde estão os cabeçalhos das colunas (dados começam na linha seguinte)</p>
                      </div>

                      <button
                        onClick={() => newConfigAba && handleFetchHeadersForMapping(newConfigAba)}
                        disabled={!newConfigAba || loadingSheet}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        Mapear Colunas
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Preview / Mapping Dialog */}
            <div className="lg:col-span-2 space-y-4">
              {/* Mapping Dialog */}
              {showMappingDialog && (
                <div className="bg-card border border-primary/20 rounded-xl p-5 animate-fade-in">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-foreground font-semibold text-sm">Mapear Colunas</h3>
                      <p className="text-xs text-muted-foreground">
                        Aba: <strong>{newConfigAba}</strong> → <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${moduloColors[newConfigModulo]}`}>{moduloLabels[newConfigModulo]}</span>
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {CAMPOS_POR_MODULO[newConfigModulo].map(campo => {
                      const hasFixo = campo.key in newConfigValoresFixos;
                      const hasMapped = !!newConfigMapping[campo.key] && newConfigMapping[campo.key] !== '__none__';
                      return (
                        <div key={campo.key} className="space-y-1">
                          <div className="flex items-center gap-3">
                            <div className="w-1/3">
                              <span className="text-xs text-foreground">
                                {campo.label}
                                {campo.obrigatorio && <span className="text-[hsl(var(--vix-danger))] ml-0.5">*</span>}
                              </span>
                            </div>
                            <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            <Select
                              value={hasFixo ? '__fixo__' : (newConfigMapping[campo.key] || '__none__')}
                              onValueChange={v => {
                                if (v === '__fixo__') {
                                  setNewConfigMapping(prev => { const n = { ...prev }; delete n[campo.key]; return n; });
                                  setNewConfigValoresFixos(prev => ({ ...prev, [campo.key]: prev[campo.key] || '' }));
                                } else {
                                  setNewConfigValoresFixos(prev => { const n = { ...prev }; delete n[campo.key]; return n; });
                                  setNewConfigMapping(prev => ({ ...prev, [campo.key]: v === '__none__' ? '' : v }));
                                }
                              }}
                            >
                              <SelectTrigger className="text-xs flex-1">
                                <SelectValue placeholder="Selecione coluna" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Não mapear —</SelectItem>
                                <SelectItem value="__fixo__">📌 Valor Fixo</SelectItem>
                                {mappingHeaders.filter(h => h.trim() !== '').map(h => (
                                  <SelectItem key={h} value={h}>{h}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {(hasMapped || hasFixo) && (
                              <Check className="w-4 h-4 text-[hsl(var(--vix-success))] flex-shrink-0" />
                            )}
                          </div>
                          {hasFixo && (
                            <div className="ml-[calc(33.33%+24px)]">
                              <Input
                                placeholder={`Ex: VIAFLIX, GS, MONACO...`}
                                value={newConfigValoresFixos[campo.key] || ''}
                                onChange={e => setNewConfigValoresFixos(prev => ({ ...prev, [campo.key]: e.target.value }))}
                                className="text-xs h-8"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Custom columns section */}
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-foreground">Colunas Extras Personalizadas</h4>
                      <button
                        onClick={() => setCustomColumns(prev => [...prev, { id: `cust_${Date.now()}`, targetName: '', selectedSourceColumn: '' }])}
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium bg-primary text-primary-foreground hover:opacity-90"
                      >
                        <Plus className="w-3 h-3" />
                        Adicionar Coluna
                      </button>
                    </div>
                    
                    {customColumns.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Nenhuma coluna extra adicionada. Use isso para importar dados adicionais que não estão na lista padrão.</p>
                    ) : (
                      <div className="space-y-3">
                        {customColumns.map((col, idx) => (
                          <div key={col.id} className="flex items-center gap-2">
                            <Input
                              placeholder="Nome do Campo Novo"
                              value={col.targetName}
                              onChange={e => {
                                const newName = e.target.value;
                                setCustomColumns(prev => prev.map((c, i) => i === idx ? { ...c, targetName: newName } : c));
                              }}
                              className="text-xs w-1/3"
                            />
                            <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            <Select
                              value={col.selectedSourceColumn || '__none__'}
                              onValueChange={v => {
                                setCustomColumns(prev => prev.map((c, i) => i === idx ? { ...c, selectedSourceColumn: v === '__none__' ? '' : v } : c));
                              }}
                            >
                              <SelectTrigger className="text-xs flex-1">
                                <SelectValue placeholder="Selecione coluna na planilha" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Escolha a coluna —</SelectItem>
                                {mappingHeaders.filter(h => h.trim() !== '').map(h => (
                                  <SelectItem key={h} value={h}>{h}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <button
                              onClick={() => setCustomColumns(prev => prev.filter((_, i) => i !== idx))}
                              className="p-1 rounded text-muted-foreground hover:text-[hsl(var(--vix-danger))] hover:bg-[hsl(var(--vix-danger)/0.1)] transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                    <button
                      onClick={() => { setShowMappingDialog(false); setEditingConfigId(null); setNewConfigMapping({}); setNewConfigValoresFixos({}); setCustomColumns([]); setSheetUrl(''); setSheetInfo(null); }}
                      className="flex-1 px-3 py-2 rounded-lg border border-border text-foreground text-xs font-medium hover:bg-muted transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveConfig}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Salvar Configuração
                    </button>
                  </div>

                  {/* Show available headers */}
                  <div className="mt-4 pt-3 border-t border-border">
                    <p className="text-[10px] text-muted-foreground mb-2">Colunas encontradas na planilha:</p>
                    <div className="flex flex-wrap gap-1">
                      {mappingHeaders.map(h => (
                        <span key={h} className="px-2 py-0.5 rounded-full bg-muted text-[10px] text-muted-foreground font-mono">{h}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Preview of selected config */}
              {selectedConfig && previewData && previewData.length > 0 && !showMappingDialog && (
                <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in">
                  <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">Preview</p>
                      {(() => {
                        const cfg = sheetConfigs.find(c => c.id === selectedConfig);
                        return cfg ? (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${moduloColors[cfg.moduloDestino]}`}>
                            {moduloLabels[cfg.moduloDestino]}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <span className="text-xs text-muted-foreground">{previewData.length - 1} linhas (preview)</span>
                  </div>
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                        <tr className="border-b border-border">
                          {previewData[0]?.map((header, i) => {
                            const cfg = sheetConfigs.find(c => c.id === selectedConfig);
                            const isMapped = cfg && Object.values(cfg.mapeamento).includes(header);
                            return (
                              <th key={i} className={`text-left py-2.5 px-3 font-semibold text-xs whitespace-nowrap ${
                                isMapped ? 'text-primary' : 'text-muted-foreground'
                              }`}>
                                {header || `Col ${i + 1}`}
                                {isMapped && <span className="ml-1">✓</span>}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.slice(1).map((row, ri) => (
                          <tr key={ri} className="border-b border-border hover:bg-muted/30 transition-colors">
                            {previewData[0]?.map((_, ci) => (
                              <td key={ci} className="py-2 px-3 text-foreground text-xs whitespace-nowrap">
                                {row[ci] || ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Status cards for imported data */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`bg-card border rounded-xl p-4 animate-fade-in ${sheetsData.estoqueItems ? 'border-[hsl(var(--vix-success)/0.3)]' : 'border-border'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-[hsl(var(--vix-info))]" />
                      <span className="text-sm font-medium text-foreground">Estoque</span>
                    </div>
                    {sheetsData.estoqueItems ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[hsl(var(--vix-success))]">{sheetsData.estoqueItems.length} itens importados</span>
                        <button onClick={sheetsData.clearEstoque} className="text-[10px] text-muted-foreground hover:text-[hsl(var(--vix-danger))]">Limpar</button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Usando dados mock</span>
                    )}
                  </div>
                </div>
                <div className={`bg-card border rounded-xl p-4 animate-fade-in ${sheetsData.financeiroItems ? 'border-[hsl(var(--vix-success)/0.3)]' : 'border-border'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-[hsl(var(--vix-success))]" />
                      <span className="text-sm font-medium text-foreground">Financeiro</span>
                    </div>
                    {sheetsData.financeiroItems ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[hsl(var(--vix-success))]">{sheetsData.financeiroItems.length} itens importados</span>
                        <button onClick={sheetsData.clearFinanceiro} className="text-[10px] text-muted-foreground hover:text-[hsl(var(--vix-danger))]">Limpar</button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Usando dados mock</span>
                    )}
                  </div>
                </div>
                <div className={`bg-card border rounded-xl p-4 animate-fade-in ${sheetsData.vendasItems ? 'border-[hsl(var(--vix-warning)/0.3)]' : 'border-border'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-[hsl(var(--vix-warning))]" />
                      <span className="text-sm font-medium text-foreground">Vendas / Pedidos</span>
                    </div>
                    {sheetsData.vendasItems ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[hsl(var(--vix-success))]">{sheetsData.vendasItems.length} vendas importadas</span>
                        <button onClick={sheetsData.clearVendas} className="text-[10px] text-muted-foreground hover:text-[hsl(var(--vix-danger))]">Limpar</button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Usando dados mock</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Empty state */}
              {!selectedConfig && !showMappingDialog && sheetConfigs.length === 0 && (
                <div className="bg-card border border-border rounded-xl p-12 text-center animate-fade-in">
                  <FileSpreadsheet className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-foreground font-semibold mb-2">Configure suas Fontes de Dados</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    1. Cole a URL da planilha Google → 2. Escolha a aba e o módulo destino → 3. Mapeie as colunas → 4. Clique em Importar
                  </p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Tab: Contas */}
        <TabsContent value="contas">
          <div className="flex justify-end gap-3 mb-4">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-foreground text-sm font-medium hover:bg-muted transition-colors">
                  <Plus className="w-4 h-4" />
                  Adicionar Conta
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Adicionar Nova Conta</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>Nome da Conta</Label>
                    <Input placeholder="Ex: VixStore Premium" value={newAccount.nome} onChange={e => setNewAccount(p => ({ ...p, nome: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Plataforma</Label>
                    <Select value={newAccount.plataforma} onValueChange={v => setNewAccount(p => ({ ...p, plataforma: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione a plataforma" /></SelectTrigger>
                      <SelectContent>
                        {plataformaOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>ID da Loja</Label>
                    <Input placeholder="Ex: VIXSTORE_PREM" value={newAccount.loja} onChange={e => setNewAccount(p => ({ ...p, loja: e.target.value }))} />
                  </div>

                  {newAccount.plataforma === 'Mercado Livre' && (
                    <div className="space-y-3 pt-2 border-t border-border">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Key className="w-4 h-4 text-primary" />
                        Credenciais da API (Mercado Livre)
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Obtenha as credenciais em{' '}
                        <a href="https://developers.mercadolivre.com.br" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                          developers.mercadolivre.com.br
                        </a>
                      </p>
                      <div className="space-y-2">
                        <Label>Client ID (App ID)</Label>
                        <Input placeholder="Ex: 1234567890" value={newAccount.clientId} onChange={e => setNewAccount(p => ({ ...p, clientId: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Client Secret</Label>
                        <div className="relative">
                          <Input type={showSecrets ? 'text' : 'password'} placeholder="Sua client secret" value={newAccount.clientSecret} onChange={e => setNewAccount(p => ({ ...p, clientSecret: e.target.value }))} />
                          <button type="button" onClick={() => setShowSecrets(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Access Token</Label>
                        <Input type={showSecrets ? 'text' : 'password'} placeholder="APP_USR-..." value={newAccount.accessToken} onChange={e => setNewAccount(p => ({ ...p, accessToken: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Refresh Token</Label>
                        <Input type={showSecrets ? 'text' : 'password'} placeholder="TG-..." value={newAccount.refreshToken} onChange={e => setNewAccount(p => ({ ...p, refreshToken: e.target.value }))} />
                      </div>
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-[hsl(var(--vix-warning)/0.1)] border border-[hsl(var(--vix-warning)/0.2)]">
                        <AlertTriangle className="w-4 h-4 text-[hsl(var(--vix-warning))] mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-muted-foreground">
                          Para produção, recomendamos ativar o <strong>Lovable Cloud</strong> para armazenar credenciais de forma segura.
                        </p>
                      </div>
                    </div>
                  )}

                  {newAccount.plataforma === 'Tiny' && (
                    <div className="space-y-3 pt-2 border-t border-border">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Key className="w-4 h-4 text-primary" />
                        Credenciais da API (Tiny ERP)
                      </div>
                      <div className="space-y-2">
                        <Label>Token da API</Label>
                        <div className="relative">
                          <Input type={showSecrets ? 'text' : 'password'} placeholder="Seu token Tiny" value={newAccount.accessToken} onChange={e => setNewAccount(p => ({ ...p, accessToken: e.target.value }))} />
                          <button type="button" onClick={() => setShowSecrets(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <button onClick={handleAddAccount} disabled={!newAccount.nome || !newAccount.plataforma || !newAccount.loja} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                    <Plus className="w-4 h-4" />
                    Adicionar
                  </button>
                </div>
              </DialogContent>
            </Dialog>
            <button onClick={handleSyncAll} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
              <RefreshCw className="w-4 h-4" />
              Sincronizar Tudo
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {accounts.map((account) => {
              const isSyncing = syncingAccounts.has(account.id);
              return (
                <div key={account.id} className="bg-card border border-border rounded-xl p-5 vix-card-hover animate-fade-in">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-foreground font-semibold text-sm">{account.nome}</h3>
                      <p className="text-muted-foreground text-xs">{account.plataforma} — {account.loja}</p>
                    </div>
                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                      account.status === 'connected' ? 'text-[hsl(var(--vix-success))] bg-[hsl(var(--vix-success)/0.1)]' :
                      account.status === 'syncing' ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)]' :
                      'text-[hsl(var(--vix-danger))] bg-[hsl(var(--vix-danger)/0.1)]'
                    }`}>
                      {account.status === 'connected' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                      {account.status === 'connected' ? 'Conectado' : account.status === 'syncing' ? 'Sincronizando...' : 'Desconectado'}
                    </div>
                  </div>
                  {account.status === 'connected' && (
                    <>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <p className="text-muted-foreground text-xs">Pedidos</p>
                          <p className="text-foreground font-semibold">{account.totalPedidos?.toLocaleString('pt-BR')}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Faturamento</p>
                          <p className="text-foreground font-semibold text-sm">{formatBRL(account.faturamento || 0)}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-muted-foreground text-xs">Última sync: {account.ultimaSync}</p>
                        <button onClick={() => handleSync(account.id)} disabled={isSyncing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50">
                          <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                          {isSyncing ? 'Sincronizando...' : 'Sync'}
                        </button>
                      </div>
                    </>
                  )}
                  {account.status === 'disconnected' && (
                    <div className="flex gap-2 mt-2">
                      <button className="flex-1 px-3 py-2 rounded-lg border border-border text-foreground text-xs font-medium hover:bg-muted transition-colors">
                        Conectar Conta
                      </button>
                      <button onClick={() => handleRemoveAccount(account.id)} className="px-3 py-2 rounded-lg border border-[hsl(var(--vix-danger)/0.3)] text-[hsl(var(--vix-danger))] text-xs font-medium hover:bg-[hsl(var(--vix-danger)/0.1)] transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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

            // Get unique contas for filter
            const contasUnicas = useImported
              ? [...new Set(sheetsData.vendasItems!.map(v => v.conta).filter(Boolean))]
              : [];

            const displayList = useImported ? vendasList : mockList;

            // Sort displayList
            const sortableVendasCols = ['quantidade','valorTotal','impostos','comissao','cmv','liquido','margem','devolucao'];
            const sortedDisplayList = vendasSortField && sortableVendasCols.includes(vendasSortField)
              ? [...displayList].sort((a: any, b: any) => {
                  const va = typeof a[vendasSortField] === 'string' ? parseFloat(a[vendasSortField]?.replace(/[^\d.,-]/g,'')?.replace(',','.') || '0') : (a[vendasSortField] || 0);
                  const vb = typeof b[vendasSortField] === 'string' ? parseFloat(b[vendasSortField]?.replace(/[^\d.,-]/g,'')?.replace(',','.') || '0') : (b[vendasSortField] || 0);
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
                            const isRight = ['quantidade','valorTotal','impostos','comissao','cmv','liquido','margem','devolucao'].includes(col.id);
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
                              if (['impostos','comissao','cmv','data','conta'].includes(col.id)) className += "text-muted-foreground ";
                              if (col.id === 'liquido') className += "font-semibold text-[hsl(var(--vix-success))] text-right ";
                              if (col.id === 'valorTotal') className += "font-semibold text-right ";
                              if (['quantidade','margem'].includes(col.id)) className += "text-right ";
                              if (col.id === 'margem') className += "text-center font-medium ";
                              if (col.id === 'devolucao') { content = formatBRL(content || 0); className += "text-right text-[hsl(var(--vix-danger))] "; }
                              if (['valorTotal','impostos','comissao','cmv','liquido'].includes(col.id)) {
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
            const contasUnicas = [...new Set(perfItems.map(p => p.conta).filter(Boolean))];

            // Sort periods by end date to find the most recent
            const parseEndDate = (ref: string) => {
              if (!ref) return null;
              const parts = ref.split(' a ');
              const dateStr = (parts[1] || parts[0] || '').trim();
              const m = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
              if (!m) return null;
              return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
            };

            // Get unique periods sorted by end date (most recent last)
            const periodosUnicos = [...new Set(perfItems.map(p => p.dataRef).filter(Boolean))]
              .sort((a, b) => {
                const da = parseEndDate(a);
                const db = parseEndDate(b);
                if (!da || !db) return 0;
                return da.getTime() - db.getTime();
              });
            const periodoMaisRecente = periodosUnicos.length > 0 ? periodosUnicos[periodosUnicos.length - 1] : '';

            // Filter by period: '7' = most recent only, 'custom' = user picks
            let filteredByPeriodo = perfItems;
            if (perfFilterPeriodo === '7') {
              filteredByPeriodo = periodoMaisRecente ? perfItems.filter(p => p.dataRef === periodoMaisRecente) : perfItems;
            } else if (perfFilterPeriodo === 'custom') {
              filteredByPeriodo = perfSelectedPeriodo === 'all' ? perfItems : perfItems.filter(p => p.dataRef === perfSelectedPeriodo);
            }

            const filteredByConta = perfFilterConta === 'all' ? filteredByPeriodo : filteredByPeriodo.filter(p => p.conta === perfFilterConta);

            // Sort
            const sorted = [...filteredByConta].sort((a, b) => {
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
            const convMedia = filtered.length > 0 ? filtered.reduce((s, p) => s + p.conversao, 0) / filtered.length : 0;
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
                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <KpiCard title="Total Visitas" value={totalVisitas.toLocaleString('pt-BR')} icon={Eye} delay={0} />
                  <KpiCard title="Total Vendas" value={totalVendas.toLocaleString('pt-BR')} icon={ShoppingCart} delay={50} />
                  <KpiCard title="Canceladas" value={totalCanceladas.toLocaleString('pt-BR')} icon={AlertTriangle} delay={100} />
                  <KpiCard title="Conversão Média" value={`${convMedia.toFixed(2)}%`} icon={TrendingUp} delay={150} />
                </div>

                {/* Filter by Conta */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-muted-foreground">Período:</label>
                    <select value={perfFilterPeriodo} onChange={(e) => { setPerfFilterPeriodo(e.target.value); setPerfPage(0); }} className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs">
                      <option value="7">📅 Últimos 7 dias{periodoMaisRecente ? ` (${periodoMaisRecente})` : ''}</option>
                      <option value="custom">🔍 Personalizado</option>
                    </select>
                  </div>
                  {perfFilterPeriodo === 'custom' && periodosUnicos.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <select value={perfSelectedPeriodo} onChange={(e) => { setPerfSelectedPeriodo(e.target.value); setPerfPage(0); }} className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs">
                        <option value="all">Todos os períodos</option>
                        {[...periodosUnicos].reverse().map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                  )}
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
                          <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap" style={{minWidth: '180px'}}>Período</th>
                        </tr>
                      </thead>
                      <tbody>
                        {perfPaginated.map((item, idx) => (
                          <tr key={`${item.idAnuncio}-${idx}`} className="border-t border-border hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2">
                              {item.link ? (
                                <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{item.idAnuncio}</a>
                              ) : item.idAnuncio}
                            </td>
                            <td className="px-3 py-2 font-mono">{item.sku}</td>
                            <td className="px-3 py-2 max-w-[200px] truncate" title={item.titulo}>{item.titulo}</td>
                            <td className="px-3 py-2 text-right">{formatBRL(item.preco)}</td>
                            <td className="px-3 py-2 text-right font-medium">{item.visitas.toLocaleString('pt-BR')}</td>
                            <td className="px-3 py-2 text-right font-medium text-[hsl(var(--vix-success))]">{item.vendas.toLocaleString('pt-BR')}</td>
                            <td className="px-3 py-2 text-right text-[hsl(var(--vix-danger))]">{item.canceladas}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={`font-medium ${item.conversao >= 5 ? 'text-[hsl(var(--vix-success))]' : item.conversao >= 2 ? 'text-[hsl(var(--vix-warning))]' : 'text-[hsl(var(--vix-danger))]'}`}>
                                {item.conversao.toFixed(2)}%
                              </span>
                            </td>
                            <td className="px-3 py-2">{item.conta}</td>
                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap font-mono text-[11px]">{item.dataRef}</td>
                          </tr>
                        ))}
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
              <h3 className="text-foreground font-semibold mb-4">Vendas por Dia (7d)</h3>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={mockSalesByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="dia" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
                  <Legend />
                  <Area type="monotone" dataKey="ml1" name="VixStore" stackId="1" fill="hsl(var(--primary))" stroke="hsl(var(--primary))" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="ml2" name="VixHome" stackId="1" fill="hsl(var(--accent))" stroke="hsl(var(--accent))" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="ml3" name="VixSport" stackId="1" fill="hsl(var(--vix-warning))" stroke="hsl(var(--vix-warning))" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="tiny" name="Tiny" stackId="1" fill="hsl(var(--vix-info))" stroke="hsl(var(--vix-info))" fillOpacity={0.4} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
              <h3 className="text-foreground font-semibold mb-4">Faturamento por Marketplace</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={mockRevenueByMarketplace} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name.split(' - ')[1] || name} ${(percent * 100).toFixed(0)}%`}>
                    {mockRevenueByMarketplace.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.fill} />))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [formatBRL(value), 'Faturamento']} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-card border border-border rounded-xl p-6 animate-fade-in lg:col-span-2">
              <h3 className="text-foreground font-semibold mb-4">ROAS Realizado vs Objetivo por Campanha</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={mockAdsCampaigns.filter(c => c.investimento > 0)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="campanha" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} angle={-15} textAnchor="end" height={60} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickFormatter={(v) => `${v}x`} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} formatter={(value: number) => [`${value.toFixed(2)}x`]} />
                  <Legend />
                  <Bar dataKey="roasRealizado" name="ROAS Realizado" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="roasObjetivo" name="ROAS Objetivo" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.4} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
