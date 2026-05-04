import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { 
  Package, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Search, 
  Filter, 
  Truck, 
  RefreshCw, 
  Loader2, 
  ChevronDown, 
  ChevronRight, 
  ExternalLink,
  Clock,
  LayoutGrid
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/utils-vix';
import { KpiCard } from '@/components/shared/KpiCard';

interface EstoqueFullItem {
  sku: string;
  conta: string;
  aptasParaVenda: number;
  entradaPendente: number;
  statusAnuncio?: string;
  item_id?: string;
}

interface AdItem {
  item_id: string;
  title: string;
  status: string;
  logistic_type: string;
  seller_custom_field?: string;
  variations?: any[];
  permalink?: string;
  thumbnail?: string;
  conta: string;
}

interface JoinedItem extends EstoqueFullItem {
  adStatusML?: string;
  adTitle?: string;
  adLink?: string;
  adThumbnail?: string;
  calculatedStatus: 'ATIVO' | 'INATIVO' | 'SEM ANÚNCIO';
}

export function EstoqueFullTab() {
  const [estoqueItems, setEstoqueItems] = useState<EstoqueFullItem[]>([]);
  const [adsItems, setAdsItems] = useState<AdItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [expandedSku, setExpandedSku] = useState<string | null>(null);
  
  // Filters
  const [filterSku, setFilterSku] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'ATIVO' | 'INATIVO' | 'SEM ANÚNCIO'>('all');
  const [filterConta, setFilterConta] = useState('all');

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // 1. Fetch Manual Stock from app_data
      const { data: appData, error: appError } = await supabase
        .from('app_data')
        .select('data_value, updated_at')
        .eq('data_key', 'estoque_full_data')
        .single();

      if (appError && appError.code !== 'PGRST116') throw appError;

      const rawStock = (appData?.data_value as any[]) || [];
      setEstoqueItems(rawStock);
      if (appData?.updated_at) {
        setLastUpdate(new Date(appData.updated_at).toLocaleString('pt-BR'));
      }

      // 2. Fetch Ads Status from Mercado Livre Edge Function
      const now = new Date();
      const to = now.toISOString().split('T')[0];
      const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const { data: mlData, error: mlError } = await supabase.functions.invoke('mercado-livre', { 
        body: { action: 'get_ads_data', date_from: from, date_to: to } 
      });

      if (mlError) throw new Error(mlError.message);
      
      const allAds = (mlData?.items || []) as AdItem[];
      // Filter only fulfillment ads for the main cross-reference
      const fullAds = allAds.filter(ad => ad.logistic_type === 'fulfillment');
      setAdsItems(fullAds);

      if (!silent) toast.success('Dados sincronizados com sucesso');
    } catch (err: any) {
      console.error('[EstoqueFullTab] Error:', err);
      toast.error(`Erro ao carregar dados: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Join Data Logic
  const joinedData = useMemo(() => {
    // Create a map of ads by SKU for fast lookup
    const adsBySku = new Map<string, AdItem>();
    adsItems.forEach(ad => {
      // Check main SKU
      const mainSku = ad.seller_custom_field?.trim().toUpperCase();
      if (mainSku) adsBySku.set(mainSku, ad);
      
      // Check variation SKUs
      if (ad.variations && Array.isArray(ad.variations)) {
        ad.variations.forEach(v => {
          const vSku = v.attribute_combinations?.find((a: any) => a.id === 'SELLER_SKU')?.value_name?.trim().toUpperCase();
          if (vSku) adsBySku.set(vSku, ad);
        });
      }
    });

    const result: JoinedItem[] = estoqueItems.map(item => {
      const sku = item.sku.trim().toUpperCase();
      const ad = adsBySku.get(sku);
      
      let calculatedStatus: 'ATIVO' | 'INATIVO' | 'SEM ANÚNCIO' = 'SEM ANÚNCIO';
      
      if (ad) {
        const isActive = ad.status === 'active' && item.aptasParaVenda > 0;
        calculatedStatus = isActive ? 'ATIVO' : 'INATIVO';
      }

      return {
        ...item,
        adStatusML: ad?.status,
        adTitle: ad?.title,
        adLink: ad?.permalink,
        adThumbnail: ad?.thumbnail,
        calculatedStatus
      };
    });

    // Sorting: ATIVO first, then Qty desc
    return result.sort((a, b) => {
      const statusOrder = { 'ATIVO': 0, 'INATIVO': 1, 'SEM ANÚNCIO': 2 };
      if (statusOrder[a.calculatedStatus] !== statusOrder[b.calculatedStatus]) {
        return statusOrder[a.calculatedStatus] - statusOrder[b.calculatedStatus];
      }
      return b.aptasParaVenda - a.aptasParaVenda;
    });
  }, [estoqueItems, adsItems]);

  // Filtered Data
  const filteredData = useMemo(() => {
    return joinedData.filter(item => {
      const matchesSku = !filterSku || item.sku.toLowerCase().includes(filterSku.toLowerCase());
      const matchesStatus = filterStatus === 'all' || item.calculatedStatus === filterStatus;
      const matchesConta = filterConta === 'all' || item.conta === filterConta;
      return matchesSku && matchesStatus && matchesConta;
    });
  }, [joinedData, filterSku, filterStatus, filterConta]);

  // Unique Accounts for dropdown
  const uniqueContas = useMemo(() => {
    return [...new Set(estoqueItems.map(i => i.conta))].filter(Boolean).sort();
  }, [estoqueItems]);

  // Stats
  const stats = useMemo(() => {
    return {
      totalSkus: joinedData.length,
      ativos: joinedData.filter(i => i.calculatedStatus === 'ATIVO').length,
      inativos: joinedData.filter(i => i.calculatedStatus === 'INATIVO').length,
      semAnuncio: joinedData.filter(i => i.calculatedStatus === 'SEM ANÚNCIO').length,
      totalAptas: joinedData.reduce((acc, i) => acc + (i.aptasParaVenda || 0), 0)
    };
  }, [joinedData]);

  if (loading && joinedData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-card/50 border border-border rounded-2xl">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground animate-pulse">Sincronizando estoque e anúncios...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard title="Total SKUs no Full" value={stats.totalSkus.toLocaleString()} icon={Package} delay={0} />
        <KpiCard title="Ativos" value={stats.ativos.toLocaleString()} icon={CheckCircle} valueColor="text-emerald-400" delay={50} />
        <KpiCard title="Inativos" value={stats.inativos.toLocaleString()} icon={XCircle} valueColor="text-red-400" delay={100} />
        <KpiCard title="Sem Anúncio ML" value={stats.semAnuncio.toLocaleString()} icon={AlertTriangle} valueColor="text-yellow-400" delay={150} />
        <KpiCard title="Unidades Aptas" value={stats.totalAptas.toLocaleString()} icon={LayoutGrid} delay={200} />
        <KpiCard title="Último Upload" value={lastUpdate || '---'} icon={Clock} delay={250} />
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-4 bg-card border border-border p-4 rounded-2xl">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Buscar por SKU..."
            value={filterSku}
            onChange={e => setFilterSku(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>

        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl border border-border">
          {(['all', 'ATIVO', 'INATIVO', 'SEM ANÚNCIO'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                filterStatus === s 
                  ? 'bg-primary text-primary-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'all' ? 'TODOS' : s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={filterConta}
            onChange={e => setFilterConta(e.target.value)}
            className="bg-muted/50 border border-border rounded-xl px-3 py-2 text-xs text-foreground outline-none focus:border-primary/50"
          >
            <option value="all">Todas as Contas</option>
            {uniqueContas.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <button 
          onClick={() => fetchData(false)} 
          disabled={loading}
          className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
          title="Atualizar dados"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
        </button>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="w-10" />
                <th className="text-left py-4 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">SKU</th>
                <th className="text-left py-4 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Conta</th>
                <th className="text-center py-4 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Status Sistema</th>
                <th className="text-right py-4 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Aptas Venda</th>
                <th className="text-right py-4 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Entrada Pendente</th>
                <th className="text-center py-4 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Status ML</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredData.map((item, idx) => (
                <React.Fragment key={`${item.sku}-${item.conta}-${idx}`}>
                  <tr 
                    onClick={() => setExpandedSku(expandedSku === item.sku ? null : item.sku)}
                    className={`hover:bg-primary/5 transition-colors cursor-pointer ${expandedSku === item.sku ? 'bg-primary/5' : ''}`}
                  >
                    <td className="py-4 px-2 text-center">
                      {expandedSku === item.sku ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </td>
                    <td className="py-4 px-4 font-mono text-xs font-medium text-foreground">{item.sku}</td>
                    <td className="py-4 px-4 text-xs text-muted-foreground">{item.conta}</td>
                    <td className="py-4 px-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                        item.calculatedStatus === 'ATIVO' 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                          : item.calculatedStatus === 'INATIVO'
                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                          : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                      }`}>
                        {item.calculatedStatus}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right font-semibold text-foreground">{item.aptasParaVenda.toLocaleString()}</td>
                    <td className="py-4 px-4 text-right text-muted-foreground">{item.entradaPendente.toLocaleString()}</td>
                    <td className="py-4 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${
                        item.adStatusML === 'active' 
                          ? 'text-emerald-400' 
                          : item.adStatusML ? 'text-red-400' : 'text-muted-foreground'
                      }`}>
                        {item.adStatusML || '---'}
                      </span>
                    </td>
                  </tr>
                  
                  {/* Expanded Content */}
                  {expandedSku === item.sku && (
                    <tr className="bg-muted/30 border-t border-border/10">
                      <td colSpan={7} className="px-10 py-6">
                        <div className="flex gap-6 animate-in slide-in-from-top-2 duration-300">
                          {item.adThumbnail && (
                            <img 
                              src={item.adThumbnail} 
                              alt={item.adTitle} 
                              className="w-20 h-20 rounded-xl border border-border object-cover bg-white"
                            />
                          )}
                          <div className="flex-1 space-y-4">
                            <div>
                              <h4 className="text-sm font-semibold text-foreground mb-1">{item.adTitle || 'Anúncio não localizado'}</h4>
                              <p className="text-xs text-muted-foreground flex items-center gap-2">
                                <Package className="w-3 h-3" /> SKU: {item.sku} 
                                {item.item_id && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">ID: {item.item_id}</span>}
                              </p>
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="space-y-1">
                                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Status Planilha</p>
                                <p className="text-xs text-foreground font-medium">{item.statusAnuncio || '---'}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Entrada Pendente</p>
                                <p className="text-xs text-foreground font-medium">{item.entradaPendente.toLocaleString()} unidades</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Status ML</p>
                                <p className="text-xs text-foreground font-medium uppercase">{item.adStatusML || 'N/A'}</p>
                              </div>
                              <div className="space-y-1 flex items-end">
                                {item.adLink && (
                                  <a 
                                    href={item.adLink} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
                                  >
                                    Ver no Mercado Livre <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {filteredData.length === 0 && (
        <div className="text-center py-20 bg-card border border-border rounded-2xl">
          <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">Nenhum SKU encontrado com estes filtros</p>
        </div>
      )}
    </div>
  );
}
