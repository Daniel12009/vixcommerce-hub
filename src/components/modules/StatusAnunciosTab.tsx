import { useState, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Package, Award, XCircle, CheckCircle, Truck, Loader2, RefreshCw, X, Info, AlertTriangle, Filter, Clock, Star, ShieldCheck, Eye } from 'lucide-react';
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
  const [filterStatus, setFilterStatus] = useState('active');
  // Catalog modal
  const [catalogInfo, setCatalogInfo] = useState<any>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedAd, setSelectedAd] = useState<AdItem | null>(null);
  // Seller reputation
  const [sellerReps, setSellerReps] = useState<Record<string, any>>({});
  // Per-item status
  const [itemStatusData, setItemStatusData] = useState<any>(null);
  const [itemStatusLoading, setItemStatusLoading] = useState(false);
  const [selectedItemAd, setSelectedItemAd] = useState<AdItem | null>(null);

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
      if (data?.seller_reputations) setSellerReps(data.seller_reputations);
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
      const { data, error } = await supabase.functions.invoke('mercado-livre', { body: { action: 'get_catalog_winner', item_id: ad.item_id, account_id: ad.account_id } });
      if (error) {
        console.error('[Catalog]', error);
        setCatalogInfo({ catalog: false, message: error.message || 'Erro ao buscar dados. Verifique se a Edge Function foi atualizada.' });
      } else {
        setCatalogInfo(data || { catalog: false, message: 'Sem dados retornados' });
      }
    } catch (err: any) {
      console.error('[Catalog]', err);
      setCatalogInfo({ catalog: false, message: err.message || 'Erro de conexão' });
    }
    finally { setCatalogLoading(false); }
  };

  const fetchItemStatus = async (ad: AdItem) => {
    setSelectedItemAd(ad);
    setItemStatusLoading(true);
    setItemStatusData(null);
    try {
      const { data, error } = await supabase.functions.invoke('mercado-livre', { body: { action: 'get_item_status', item_id: ad.item_id, account_id: ad.account_id } });
      if (error) {
        setItemStatusData({ error: error.message || 'Erro ao buscar dados' });
      } else {
        setItemStatusData(data || { error: 'Sem dados' });
      }
    } catch (err: any) {
      setItemStatusData({ error: err.message || 'Erro de conexão' });
    }
    finally { setItemStatusLoading(false); }
  };

  const contas = useMemo(() => [...new Set(ads.map(a => a.conta).filter(Boolean))].sort(), [ads]);
  const filtered = useMemo(() => {
    let result = ads;
    if (filterConta !== 'all') result = result.filter(a => a.conta === filterConta);
    if (filterStatus !== 'all') result = result.filter(a => a.status === filterStatus);
    return result;
  }, [ads, filterConta, filterStatus]);

  const statusColor = (s: string) => {
    if (s === 'active' || s === 'enabled') return 'text-emerald-400 bg-emerald-400/10';
    if (s === 'paused') return 'text-yellow-400 bg-yellow-400/10';
    if (s === 'hold') return 'text-orange-400 bg-orange-400/10';
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

  // Render health info
  const renderHealth = (health: any) => {
    if (!health) return <span className="text-[10px] text-muted-foreground">Sem dados</span>;
    // Health can be object with `health_level` or string
    const level = health.health_level || health.level || (typeof health === 'string' ? health : null);
    const actions = health.health_actions || health.actions || [];
    return (
      <div className="space-y-2">
        {level && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Qualidade:</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              level === 'healthy' || level === 'good' ? 'bg-emerald-500/15 text-emerald-400' :
              level === 'warning' || level === 'fair' ? 'bg-yellow-500/15 text-yellow-400' :
              'bg-red-500/15 text-red-400'
            }`}>{level}</span>
          </div>
        )}
        {actions.length > 0 && (
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Ações necessárias:</p>
            {actions.map((a: any, i: number) => (
              <p key={i} className="text-[10px] text-foreground">• {a.label || a.message || JSON.stringify(a)}</p>
            ))}
          </div>
        )}
        {!level && actions.length === 0 && (
          <pre className="text-[10px] text-muted-foreground overflow-x-auto max-h-20">{JSON.stringify(health, null, 2)}</pre>
        )}
      </div>
    );
  };

  /* ━━━ Modal via Portal ━━━ */
  const CatalogModal = selectedAd ? createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setSelectedAd(null); setCatalogInfo(null); }}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
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
                  <p className="text-xs text-foreground">{catalogInfo.message || 'Este item não é de catálogo.'}</p>
                </div>
              )}

              {catalogInfo.catalog && (
                <>
                  <div className="bg-muted/50 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground">Produto Catálogo</p>
                    <p className="text-sm font-medium text-foreground">{catalogInfo.product_name}</p>
                    <p className="text-[10px] text-muted-foreground">ID: {catalogInfo.catalog_product_id}</p>
                  </div>

                  {/* Item Status */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-muted/50 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Envio</p>
                      <p className="text-xs font-semibold text-foreground">{catalogInfo.item_status?.shipping === 'fulfillment' ? '📦 Full' : catalogInfo.item_status?.shipping || '-'}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Tipo</p>
                      <p className="text-xs font-semibold text-foreground">{catalogInfo.item_status?.listing_type === 'gold_pro' ? 'Premium' : catalogInfo.item_status?.listing_type === 'gold_special' ? 'Clássico' : catalogInfo.item_status?.listing_type || '-'}</p>
                    </div>
                  </div>

                  {/* Health / Qualidade */}
                  <div className="bg-muted/50 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground font-medium mb-1">📊 Qualidade do Anúncio</p>
                    {renderHealth(catalogInfo.item_status?.health)}
                  </div>

                  {/* Buy Box Winner */}
                  {catalogInfo.buy_box_winner ? (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                      <p className="text-xs font-semibold text-red-400 mb-2">⚠️ Vendedor ganhando o Buy Box:</p>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">Item:</span>
                          <span className="text-xs font-medium text-foreground">{catalogInfo.buy_box_winner.item_id || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">Seller ID:</span>
                          <span className="text-xs font-medium text-foreground">{catalogInfo.buy_box_winner.seller_id || 'N/A'}</span>
                        </div>
                        {catalogInfo.buy_box_winner.price > 0 && (
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Preço:</span>
                            <span className="text-xs font-medium text-foreground">{formatBRL(catalogInfo.buy_box_winner.price)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-center">
                      <p className="text-xs font-semibold text-emerald-400">🏆 Nenhum competidor ganhando o Buy Box foi encontrado</p>
                    </div>
                  )}

                  {/* Competitors */}
                  {catalogInfo.competitors?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">🏪 Competidores no catálogo ({catalogInfo.competitors.length}):</p>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {catalogInfo.competitors.map((c: any, i: number) => (
                          <div key={i} className={`flex justify-between items-center text-xs px-3 py-2 rounded-lg ${c.buy_box_winner ? 'bg-red-500/10 border border-red-500/30' : 'bg-muted/30'}`}>
                            <div>
                              <span className="text-foreground font-medium">{c.item_id || `Item ${i+1}`}</span>
                              {c.seller_id && <span className="text-[10px] text-muted-foreground ml-2">Seller: {c.seller_id}</span>}
                              {c.buy_box_winner && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400">GANHANDO</span>}
                            </div>
                            {c.price > 0 && <span className="text-muted-foreground font-medium">{formatBRL(c.price)}</span>}
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
    </div>,
    document.body
  ) : null;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => fetchAds(false)} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {loading ? 'Carregando...' : 'Atualizar'}
        </button>
        {/* Status filter */}
        <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded-lg">
          {[
            { key: 'active', label: 'Ativos' },
            { key: 'paused', label: 'Pausados' },
            { key: 'all', label: 'Todos' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilterStatus(f.key)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${filterStatus === f.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >{f.label}</button>
          ))}
        </div>
        {/* Conta filter */}
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

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 bg-card border border-border rounded-xl">
          <Package className="w-12 h-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum anúncio encontrado com os filtros selecionados.</p>
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

          {/* Experiência de Compra per account */}
          {Object.keys(sellerReps).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-foreground font-semibold flex items-center gap-2 text-sm"><Star className="w-4 h-4 text-yellow-400" /> Experiência de Compra</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(sellerReps).map(([conta, rep]: [string, any]) => {
                  const metrics = rep.experience || {};
                  const claimsRate = metrics.claims?.rate ?? null;
                  const cancelRate = metrics.cancellations?.rate ?? null;
                  const delayedRate = metrics.delayed_handling_time?.rate ?? null;
                  const rateColor = (r: number | null) => {
                    if (r === null) return 'text-muted-foreground';
                    if (r <= 0.02) return 'text-emerald-400';
                    if (r <= 0.05) return 'text-yellow-400';
                    return 'text-red-400';
                  };
                  const rateBg = (r: number | null) => {
                    if (r === null) return 'bg-muted';
                    if (r <= 0.02) return 'bg-emerald-500/10';
                    if (r <= 0.05) return 'bg-yellow-500/10';
                    return 'bg-red-500/10';
                  };
                  const levelLabel = (level: string | null) => {
                    if (!level) return '';
                    const map: Record<string, string> = { '5_green': '🟢 Verde', '4_light_green': '🟡 Amarelo', '3_yellow': '🟠 Laranja', '2_orange': '🔴 Vermelho', '1_red': '🔴 Vermelho' };
                    return map[level] || level;
                  };
                  return (
                    <div key={conta} className="bg-card border border-border rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-primary" />
                          <span className="text-sm font-semibold text-foreground">{conta}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {rep.power_seller_status && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/15 text-yellow-400">{rep.power_seller_status === 'platinum' ? '💎 Platinum' : rep.power_seller_status === 'gold' ? '🥇 Gold' : rep.power_seller_status}</span>}
                          {rep.level_id && <span className="text-[10px] text-muted-foreground">{levelLabel(rep.level_id)}</span>}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className={`rounded-lg p-2 text-center ${rateBg(claimsRate)}`}>
                          <p className="text-[10px] text-muted-foreground">Reclamações</p>
                          <p className={`text-sm font-bold ${rateColor(claimsRate)}`}>{claimsRate !== null ? `${(claimsRate * 100).toFixed(1)}%` : '-'}</p>
                        </div>
                        <div className={`rounded-lg p-2 text-center ${rateBg(cancelRate)}`}>
                          <p className="text-[10px] text-muted-foreground">Cancelamentos</p>
                          <p className={`text-sm font-bold ${rateColor(cancelRate)}`}>{cancelRate !== null ? `${(cancelRate * 100).toFixed(1)}%` : '-'}</p>
                        </div>
                        <div className={`rounded-lg p-2 text-center ${rateBg(delayedRate)}`}>
                          <p className="text-[10px] text-muted-foreground">Atrasos</p>
                          <p className={`text-sm font-bold ${rateColor(delayedRate)}`}>{delayedRate !== null ? `${(delayedRate * 100).toFixed(1)}%` : '-'}</p>
                        </div>
                      </div>
                      {rep.transactions?.completed != null && (
                        <p className="text-[10px] text-muted-foreground mt-2 text-right">{rep.transactions.completed} vendas concluídas</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-foreground font-semibold flex items-center gap-2 text-sm"><Package className="w-4 h-4 text-primary" /> Status dos Anúncios ({filtered.length})</h3>
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
                    <th className="text-center py-2.5 px-3 font-medium text-muted-foreground text-xs">Exp. Compra</th>
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
                        <button onClick={() => fetchItemStatus(ad)} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary inline-flex items-center gap-1 hover:bg-primary/20 transition-colors cursor-pointer">
                          <Eye className="w-3 h-3" /> Ver
                        </button>
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

      {/* Catalog Modal via Portal */}
      {CatalogModal}

      {/* Purchase Experience Modal via Portal */}
      {selectedItemAd && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setSelectedItemAd(null); setItemStatusData(null); }}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
              <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm"><Star className="w-4 h-4 text-yellow-400" /> Experiência de Compra</h3>
              <button onClick={() => { setSelectedItemAd(null); setItemStatusData(null); }} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center gap-3 mb-4">
                {selectedItemAd.thumbnail && <img src={selectedItemAd.thumbnail} alt="" className="w-12 h-12 rounded object-cover" />}
                <div>
                  <p className="text-sm font-medium text-foreground">{selectedItemAd.title}</p>
                  <p className="text-[10px] text-muted-foreground">{selectedItemAd.item_id} • {selectedItemAd.conta}</p>
                </div>
              </div>

              {itemStatusLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="ml-2 text-sm text-muted-foreground">Buscando experiência de compra...</span>
                </div>
              )}

              {itemStatusData && !itemStatusLoading && (
                <div className="space-y-3">
                  {itemStatusData.error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-center">
                      <AlertTriangle className="w-5 h-5 text-red-400 mx-auto mb-1" />
                      <p className="text-xs text-foreground">{itemStatusData.error}</p>
                    </div>
                  )}

                  {itemStatusData.purchase_experience && (() => {
                    const pe = itemStatusData.purchase_experience;
                    const rep = pe.reputation || {};
                    const scoreColor = rep.color === 'green' ? 'text-emerald-400 border-emerald-400' : rep.color === 'orange' ? 'text-orange-400 border-orange-400' : rep.color === 'red' ? 'text-red-400 border-red-400' : 'text-muted-foreground border-muted';
                    const scoreBg = rep.color === 'green' ? 'bg-emerald-500/10' : rep.color === 'orange' ? 'bg-orange-500/10' : rep.color === 'red' ? 'bg-red-500/10' : 'bg-muted/50';
                    return (
                      <>
                        {/* Score */}
                        <div className={`flex items-center gap-4 rounded-xl p-4 ${scoreBg}`}>
                          <div className={`w-16 h-16 rounded-full border-[3px] flex items-center justify-center ${scoreColor}`}>
                            <span className={`text-xl font-bold ${scoreColor.split(' ')[0]}`}>{rep.value >= 0 ? rep.value : '-'}</span>
                          </div>
                          <div>
                            <p className={`text-sm font-bold ${scoreColor.split(' ')[0]}`}>{rep.text || (rep.color === 'green' ? 'Boa' : rep.color === 'orange' ? 'Média' : rep.color === 'red' ? 'Ruim' : 'Sem dados')}</p>
                            {pe.subtitles?.map((s: any) => (
                              <p key={s.order} className="text-[10px] text-muted-foreground mt-0.5">{s.text?.replace(/\{\d+\}/g, '')}</p>
                            ))}
                          </div>
                        </div>

                        {/* Freeze */}
                        {pe.freeze?.text && (
                          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3">
                            <p className="text-xs text-blue-400">❄️ {pe.freeze.text.replace(/\{\d+\}/g, '')}</p>
                          </div>
                        )}

                        {/* Problems */}
                        {pe.metrics_details?.problems?.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">⚠️ Problemas ({pe.metrics_details.problems.length}):</p>
                            <div className="space-y-2">
                              {pe.metrics_details.problems.map((p: any, i: number) => (
                                <div key={i} className="bg-muted/30 rounded-xl p-3 border-l-2" style={{ borderColor: p.color || '#666' }}>
                                  <div className="flex items-center gap-2 mb-1">
                                    {p.tag && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400">{p.tag}</span>}
                                    <span className="text-xs font-medium text-foreground">{p.quantity}</span>
                                    <span className="text-[10px] text-muted-foreground">({p.claims || 0} recl. / {p.cancellations || 0} canc.)</span>
                                  </div>
                                  {p.level_two?.title && <p className="text-[10px] text-foreground">{p.level_two.title.text || p.level_two.title}</p>}
                                  {p.level_three?.title && <p className="text-[10px] text-foreground ml-2">→ {p.level_three.title.text || p.level_three.title}</p>}
                                  {p.level_three?.remedy && (
                                    <div className="mt-1.5 bg-emerald-500/10 rounded-lg p-2">
                                      <p className="text-[10px] text-emerald-400">💡 {p.level_three.remedy.text || p.level_three.remedy}</p>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Empty state */}
                        {pe.metrics_details?.empty_state_title && !pe.metrics_details?.problems?.length && (
                          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-center">
                            <p className="text-xs text-emerald-400">✅ {pe.metrics_details.empty_state_title}</p>
                          </div>
                        )}

                        {/* Item info */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-muted/50 rounded-lg p-2 text-center">
                            <p className="text-[10px] text-muted-foreground">Envio</p>
                            <p className="text-xs font-semibold text-foreground">{itemStatusData.shipping === 'fulfillment' ? '📦 Full' : itemStatusData.shipping || '-'}</p>
                          </div>
                          <div className="bg-muted/50 rounded-lg p-2 text-center">
                            <p className="text-[10px] text-muted-foreground">Tipo</p>
                            <p className="text-xs font-semibold text-foreground">{itemStatusData.listing_type === 'gold_pro' ? 'Premium' : itemStatusData.listing_type === 'gold_special' ? 'Clássico' : itemStatusData.listing_type || '-'}</p>
                          </div>
                          <div className="bg-muted/50 rounded-lg p-2 text-center">
                            <p className="text-[10px] text-muted-foreground">Catálogo</p>
                            <p className="text-xs font-semibold text-foreground">{itemStatusData.catalog_listing ? '✅ Sim' : 'Não'}</p>
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  {!itemStatusData.purchase_experience && !itemStatusData.error && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-center">
                      <AlertTriangle className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
                      <p className="text-xs text-foreground">Sem dados de experiência de compra para este item.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
