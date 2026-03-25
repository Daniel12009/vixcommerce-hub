import { useState, useMemo, useCallback, useEffect } from 'react';
import { Package, Award, XCircle, CheckCircle, Truck, Loader2, RefreshCw, X, Info, AlertTriangle, Filter, Clock } from 'lucide-react';
import { formatBRL } from '@/lib/utils-vix';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AdItem {
  item_id: string; campaign_id: string; title: string; status: string; price?: number; thumbnail?: string; permalink?: string;
  buy_box_winner?: boolean; catalog_listing?: boolean; logistic_type?: string; listing_type_id?: string; condition?: string; domain_id?: string;
  metrics: { clicks?: number; prints?: number; cost?: number; total_amount?: number; roas?: number; units_quantity?: number };
  conta: string; account_id?: string;
}

let _cached: AdItem[] | null = null;

export function StatusAnunciosTab() {
  const [ads, setAds] = useState<AdItem[]>(_cached || []);
  const [loading, setLoading] = useState(!_cached);
  const [lastRefresh, setLastRefresh] = useState('');
  const [filterConta, setFilterConta] = useState('all');
  // Catalog
  const [catalogInfo, setCatalogInfo] = useState<any>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedAd, setSelectedAd] = useState<AdItem | null>(null);

  const fetchAds = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const now = new Date();
      const to = now.toISOString().split('T')[0];
      const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const { data, error } = await supabase.functions.invoke('mercado-livre', { body: { action: 'get_ads_data', date_from: from, date_to: to } });
      if (error) throw new Error(error.message);
      const items = data?.items || [];
      setAds(items);
      _cached = items;
      setLastRefresh(new Date().toLocaleString('pt-BR'));
    } catch (err: any) { toast.error(`Erro: ${err.message}`); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { _cached ? fetchAds(false) : fetchAds(true); }, [fetchAds]);

  const fetchCatalogWinner = async (ad: AdItem) => {
    setSelectedAd(ad);
    setCatalogLoading(true);
    setCatalogInfo(null);
    try {
      const { data } = await supabase.functions.invoke('mercado-livre', { body: { action: 'get_catalog_winner', item_id: ad.item_id, account_id: ad.account_id } });
      setCatalogInfo(data);
    } catch (err: any) { toast.error(`Erro: ${err.message}`); }
    finally { setCatalogLoading(false); }
  };

  const contas = useMemo(() => [...new Set(ads.map(a => a.conta).filter(Boolean))].sort(), [ads]);
  const filtered = useMemo(() => filterConta === 'all' ? ads : ads.filter(a => a.conta === filterConta), [ads, filterConta]);

  const statusColor = (s: string) => {
    if (s === 'active' || s === 'enabled') return 'text-emerald-400 bg-emerald-400/10';
    if (s === 'paused') return 'text-yellow-400 bg-yellow-400/10';
    return 'text-muted-foreground bg-muted';
  };

  const stats = useMemo(() => ({
    total: filtered.length,
    full: filtered.filter(a => a.logistic_type === 'fulfillment').length,
    catalogWin: filtered.filter(a => a.buy_box_winner).length,
    catalogLose: filtered.filter(a => a.catalog_listing && !a.buy_box_winner).length,
    catalog: filtered.filter(a => a.catalog_listing).length,
    active: filtered.filter(a => a.status === 'active').length,
  }), [filtered]);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => fetchAds(false)} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {loading ? 'Carregando...' : 'Atualizar'}
        </button>
        {contas.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select value={filterConta} onChange={e => setFilterConta(e.target.value)} className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs">
              <option value="all">Todas ({ads.length})</option>
              {contas.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
        {lastRefresh && <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto"><Clock className="w-3 h-3" /> {lastRefresh}</span>}
      </div>

      {loading && ads.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 bg-card border border-border rounded-xl">
          <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
          <p className="text-sm text-muted-foreground">Carregando status dos anúncios...</p>
        </div>
      )}

      {!loading && ads.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 bg-card border border-border rounded-xl">
          <Package className="w-12 h-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum anúncio encontrado.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-card border border-border rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-foreground">{stats.total}</p>
              <p className="text-[10px] text-muted-foreground">Total</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-emerald-400">{stats.active}</p>
              <p className="text-[10px] text-muted-foreground">Ativos</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-blue-400">{stats.full}</p>
              <p className="text-[10px] text-muted-foreground">📦 Full</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-foreground">{stats.catalog}</p>
              <p className="text-[10px] text-muted-foreground">Catálogo</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-emerald-400">{stats.catalogWin}</p>
              <p className="text-[10px] text-muted-foreground">🏆 Ganhando</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-red-400">{stats.catalogLose}</p>
              <p className="text-[10px] text-muted-foreground">❌ Perdendo</p>
            </div>
          </div>

          {/* Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-foreground font-semibold flex items-center gap-2 text-sm"><Package className="w-4 h-4 text-primary" /> Status dos Anúncios</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground text-xs">Anúncio</th>
                    <th className="text-center py-2.5 px-3 font-medium text-muted-foreground text-xs">Full</th>
                    <th className="text-center py-2.5 px-3 font-medium text-muted-foreground text-xs">Catálogo</th>
                    <th className="text-center py-2.5 px-3 font-medium text-muted-foreground text-xs">Buy Box</th>
                    <th className="text-center py-2.5 px-3 font-medium text-muted-foreground text-xs">Tipo</th>
                    <th className="text-center py-2.5 px-3 font-medium text-muted-foreground text-xs">Status</th>
                    <th className="text-right py-2.5 px-3 font-medium text-muted-foreground text-xs">Preço</th>
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground text-xs">Conta</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ad, i) => (
                    <tr key={`${ad.item_id}-${i}`} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          {ad.thumbnail && <img src={ad.thumbnail} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />}
                          <div className="min-w-0">
                            {ad.permalink ? <a href={ad.permalink} target="_blank" rel="noopener" className="text-primary text-xs hover:underline truncate block max-w-[200px]" title={ad.title}>{ad.title || ad.item_id}</a> : <span className="text-xs truncate block max-w-[200px]">{ad.title || ad.item_id}</span>}
                            <span className="text-[10px] text-muted-foreground">{ad.item_id}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {ad.logistic_type === 'fulfillment'
                          ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-400 inline-flex items-center gap-1"><Truck className="w-3 h-3" /> FULL</span>
                          : <span className="text-[10px] text-muted-foreground">{ad.logistic_type || '-'}</span>
                        }
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {ad.catalog_listing
                          ? <CheckCircle className="w-4 h-4 text-emerald-400 mx-auto" />
                          : <span className="text-[10px] text-muted-foreground">Não</span>
                        }
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {ad.catalog_listing ? (
                          ad.buy_box_winner
                            ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 inline-flex items-center gap-1"><Award className="w-3 h-3" /> Ganhando</span>
                            : <button onClick={() => fetchCatalogWinner(ad)} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 inline-flex items-center gap-1 hover:bg-red-500/25 transition-colors cursor-pointer">
                                <XCircle className="w-3 h-3" /> Perdendo
                              </button>
                        ) : <span className="text-[10px] text-muted-foreground">-</span>}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="text-[10px] text-muted-foreground">{ad.listing_type_id === 'gold_pro' ? 'Premium' : ad.listing_type_id === 'gold_special' ? 'Clássico' : ad.listing_type_id || '-'}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor(ad.status)}`}>{ad.status}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-xs">{ad.price ? formatBRL(ad.price) : '-'}</td>
                      <td className="py-2.5 px-3 text-xs text-muted-foreground">{ad.conta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Catalog Detail Modal */}
      {selectedAd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setSelectedAd(null); setCatalogInfo(null); }}>
          <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-lg mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm"><Info className="w-4 h-4 text-primary" /> Detalhes do Catálogo</h3>
              <button onClick={() => { setSelectedAd(null); setCatalogInfo(null); }} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center gap-3 mb-4">
                {selectedAd.thumbnail && <img src={selectedAd.thumbnail} alt="" className="w-12 h-12 rounded object-cover" />}
                <div>
                  <p className="text-sm font-medium text-foreground">{selectedAd.title}</p>
                  <p className="text-[10px] text-muted-foreground">{selectedAd.item_id} • {selectedAd.conta}</p>
                </div>
              </div>

              {catalogLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="ml-2 text-sm text-muted-foreground">Buscando dados do catálogo...</span>
                </div>
              )}

              {catalogInfo && !catalogLoading && (
                <div className="space-y-3">
                  {!catalogInfo.catalog && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-center">
                      <AlertTriangle className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
                      <p className="text-xs text-foreground">Este item não é de catálogo.</p>
                    </div>
                  )}

                  {catalogInfo.catalog && (
                    <>
                      <div className="bg-muted/50 rounded-xl p-3">
                        <p className="text-xs text-muted-foreground">Produto Catálogo</p>
                        <p className="text-sm font-medium text-foreground">{catalogInfo.product_name}</p>
                        <p className="text-[10px] text-muted-foreground">ID: {catalogInfo.catalog_product_id}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-muted/50 rounded-lg p-2 text-center">
                          <p className="text-[10px] text-muted-foreground">Envio</p>
                          <p className="text-xs font-semibold text-foreground">{catalogInfo.item_status?.shipping === 'fulfillment' ? '📦 Full' : catalogInfo.item_status?.shipping || '-'}</p>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-2 text-center">
                          <p className="text-[10px] text-muted-foreground">Tipo</p>
                          <p className="text-xs font-semibold text-foreground">{catalogInfo.item_status?.listing_type === 'gold_pro' ? 'Premium' : catalogInfo.item_status?.listing_type || '-'}</p>
                        </div>
                      </div>

                      {catalogInfo.buy_box_winner && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                          <p className="text-xs font-semibold text-red-400 mb-1">⚠️ Vendedor ganhando o Buy Box:</p>
                          <p className="text-sm text-foreground">
                            Item: {catalogInfo.buy_box_winner?.winner_item_id || catalogInfo.buy_box_winner?.item_id || 'N/A'}
                          </p>
                          {catalogInfo.buy_box_winner?.price && <p className="text-xs text-muted-foreground">Preço: {formatBRL(catalogInfo.buy_box_winner.price)}</p>}
                        </div>
                      )}

                      {catalogInfo.competitors?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">Competidores no catálogo ({catalogInfo.competitors.length}):</p>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {catalogInfo.competitors.map((c: any, i: number) => (
                              <div key={i} className="flex justify-between items-center text-xs bg-muted/30 px-3 py-1.5 rounded-lg">
                                <span className="text-foreground">{c.id || c.item_id || `Item ${i+1}`}</span>
                                {c.price && <span className="text-muted-foreground">{formatBRL(c.price)}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
