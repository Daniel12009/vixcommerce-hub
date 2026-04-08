// v2 - catalog experience with purchase_experience/integrators
import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/integrations/supabase/client';
import { KpiCard } from '@/components/shared/KpiCard';
import { ShieldAlert, ShieldCheck, Shield, AlertTriangle, ArrowDownCircle, RefreshCw, Loader2, X, Star, Eye } from 'lucide-react';
import { toast } from 'sonner';

interface HealthData {
  mlb_id: string;
  conta: string;
  health: number;
  health_actions: string[];
  snapshot_date: string;
  titulo?: string;
  sku?: string;
  reputation_text?: string;
  reputation_color?: string;
}

export function CatalogExperienceTab() {
  const [healthHistory, setHealthHistory] = useState<HealthData[]>([]);
  const [loadingDb, setLoadingDb] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filterConta, setFilterConta] = useState('all');
  const [contaAccountMap, setContaAccountMap] = useState<Record<string, string>>({});

  // Modal state
  const [selectedItem, setSelectedItem] = useState<HealthData | null>(null);
  const [itemStatusData, setItemStatusData] = useState<any>(null);
  const [itemStatusLoading, setItemStatusLoading] = useState(false);

  // Fetch ML accounts to build conta → seller_id map
  const fetchAccounts = async () => {
    const { data } = await (supabase as any).from('ml_accounts').select('id, seller_id, nome').eq('ativo', true);
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((a: any) => { if (a.nome) map[a.nome] = a.seller_id || a.id; });
      setContaAccountMap(map);
    }
  };

  const fetchHealth = async () => {
    try {
      setLoadingDb(true);
      const { data, error } = await (supabase as any)
        .from('catalog_health_history')
        .select('*')
        .order('snapshot_date', { ascending: false });

      if (!error && data) {
        const map = new Map<string, HealthData>();
        data.forEach((item: any) => {
          const key = `${item.mlb_id}||${item.conta}`;
          if (!map.has(key)) map.set(key, item); // keep latest
        });
        setHealthHistory(Array.from(map.values()));
      }
    } catch { /* Ignored */ }
    finally { setLoadingDb(false); }
  };

  useEffect(() => { fetchHealth(); fetchAccounts(); }, []);

  const handleSyncHealth = async () => {
    setSyncing(true);
    toast.info('Buscando dados de Experiência do Mercado Livre...');
    try {
      const { data: accounts, error: accError } = await supabase
        .from('ml_accounts' as any)
        .select('id, nome')
        .eq('ativo', true);

      if (accError || !accounts?.length) {
        toast.error('Nenhuma conta ML ativa encontrada. Configure em Configurações.');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const authHeader = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};

      let successCount = 0;
      let errorCount = 0;
      for (const acc of accounts) {
        const { error } = await supabase.functions.invoke('mercado-livre', {
          body: { action: 'get_performance_catalog', account_id: acc.id },
          headers: authHeader,
        });
        if (error) { console.warn(`Erro conta ${acc.nome}:`, error.message); errorCount++; }
        else { successCount++; }
      }

      if (successCount > 0) toast.success(`Sincronizado! ${successCount} conta(s) atualizadas.`);
      if (errorCount > 0) toast.warning(`${errorCount} conta(s) com erro — verifique o token ML.`);
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setSyncing(false);
      await fetchHealth();
    }
  };

  const fetchItemStatus = async (item: HealthData) => {
    setSelectedItem(item);
    setItemStatusLoading(true);
    setItemStatusData(null);
    const accountId = contaAccountMap[item.conta];
    if (!accountId) {
      setItemStatusData({ error: `Conta "${item.conta}" não encontrada. Verifique o mapeamento de contas.` });
      setItemStatusLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('mercado-livre', {
        body: { action: 'get_item_status', item_id: item.mlb_id, account_id: accountId },
      });
      if (error) setItemStatusData({ error: error.message });
      else setItemStatusData(data || { error: 'Sem dados' });
    } catch (err: any) {
      setItemStatusData({ error: err.message });
    } finally {
      setItemStatusLoading(false);
    }
  };

  const contasUnicas = useMemo(() => {
    const set = new Set<string>();
    healthHistory.forEach(h => set.add(h.conta));
    return Array.from(set).sort();
  }, [healthHistory]);

  const rows = useMemo(() =>
    healthHistory.filter(h => filterConta === 'all' || h.conta === filterConta),
    [healthHistory, filterConta]
  );

  const buckets = useMemo(() => ({
    excellent: rows.filter(r => r.health >= 1),
    good:      rows.filter(r => r.health >= 0.75 && r.health < 1),
    average:   rows.filter(r => r.health >= 0.65 && r.health < 0.75),
    poor:      rows.filter(r => r.health >= 0.50 && r.health < 0.65),
    critical:  rows.filter(r => r.health > 0 && r.health < 0.50),
    noData:    rows.filter(r => r.health === 0),
  }), [rows]);

  const Bfs = [
    { key: 'excellent', title: '100% (Excelente)',  data: buckets.excellent, icon: ShieldCheck,    color: 'text-emerald-500' },
    { key: 'good',      title: '75% (Bom)',         data: buckets.good,      icon: Shield,          color: 'text-blue-500' },
    { key: 'average',   title: '65% (Regular)',     data: buckets.average,   icon: ShieldAlert,     color: 'text-yellow-500' },
    { key: 'poor',      title: '50% (Baixo)',       data: buckets.poor,      icon: AlertTriangle,   color: 'text-orange-500' },
    { key: 'critical',  title: '<50% (Crítico)',    data: buckets.critical,  icon: ArrowDownCircle, color: 'text-red-500' },
    { key: 'noData',    title: 'Sem Score',         data: buckets.noData,    icon: ShieldAlert,     color: 'text-muted-foreground' },
  ];

  const scoreLabel = (h: HealthData) => {
    const pct = Math.round(h.health * 100);
    return h.reputation_text || (pct >= 75 ? 'Boa' : pct >= 50 ? 'Média' : pct > 0 ? 'Ruim' : '-');
  };
  const scoreColor = (color?: string) => {
    if (color === 'green')  return 'text-emerald-400 border-emerald-400 bg-emerald-500/10';
    if (color === 'orange') return 'text-orange-400 border-orange-400 bg-orange-500/10';
    if (color === 'red')    return 'text-red-400 border-red-400 bg-red-500/10';
    return 'text-muted-foreground border-muted bg-muted/30';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted-foreground font-semibold">Filtrar por Conta:</label>
          <select value={filterConta} onChange={e => setFilterConta(e.target.value)}
            className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm">
            <option value="all">Todas as Contas</option>
            {contasUnicas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={handleSyncHealth} disabled={syncing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[hsl(var(--vix-info)/0.1)] text-[hsl(var(--vix-info))] border border-[hsl(var(--vix-info)/0.2)] text-xs font-semibold hover:bg-[hsl(var(--vix-info)/0.2)] disabled:opacity-50 transition-colors">
          {syncing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sincronizando...</> : <><RefreshCw className="w-3.5 h-3.5" /> Sincronizar Banco</>}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard title="100% (Excelente)"  value={String(buckets.excellent.length)} icon={ShieldCheck}    delay={0} />
        <KpiCard title="75% (Bom)"         value={String(buckets.good.length)}      icon={Shield}          delay={50} />
        <KpiCard title="65% (Regular)"     value={String(buckets.average.length)}   icon={ShieldAlert}     delay={100} />
        <KpiCard title="50% (Baixo)"       value={String(buckets.poor.length)}      icon={AlertTriangle}   delay={150} />
        <KpiCard title="<=50% (Crítico)"   value={String(buckets.critical.length + buckets.noData.length)} icon={ArrowDownCircle} delay={200} />
      </div>

      {Bfs.map(bucket => bucket.data.length > 0 && (
        <div key={bucket.key} className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="bg-muted/30 px-4 py-3 border-b border-border flex items-center gap-2">
            <bucket.icon className={`w-4 h-4 ${bucket.color}`} />
            <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">{bucket.title}</h3>
            <span className="ml-auto text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{bucket.data.length} anúncios</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 font-medium text-muted-foreground">Score</th>
                  <th className="px-4 py-2 font-medium text-muted-foreground">ID Anúncio</th>
                  <th className="px-4 py-2 font-medium text-muted-foreground">SKU</th>
                  <th className="px-4 py-2 font-medium text-muted-foreground">Título</th>
                  <th className="px-4 py-2 font-medium text-muted-foreground">Conta</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {bucket.data.map(item => (
                  <tr key={`${item.mlb_id}-${item.conta}`} className="hover:bg-muted/20 border-t border-border">
                    <td className="px-4 py-2">
                      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold ${scoreColor(item.reputation_color)}`}>
                        <span className="text-xs font-bold">{Math.round(item.health * 100)}</span>
                        <span>{scoreLabel(item)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 font-mono text-primary font-medium">
                      <a href={`https://www.mercadolivre.com.br/p/${item.mlb_id}`} target="_blank" rel="noopener" className="hover:underline">{item.mlb_id}</a>
                    </td>
                    <td className="px-4 py-2 font-mono text-muted-foreground">{item.sku || 'N/A'}</td>
                    <td className="px-4 py-2 truncate max-w-[280px]" title={item.titulo}>{item.titulo || 'Título não disponível'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{item.conta}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => fetchItemStatus(item)}
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary inline-flex items-center gap-1 hover:bg-primary/20 transition-colors">
                        <Eye className="w-3 h-3" /> Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {rows.length === 0 && !loadingDb && (
        <div className="text-center py-12 bg-card border border-border rounded-xl mt-6">
          <ShieldAlert className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <h3 className="text-sm font-semibold text-foreground">Sem dados de Experiência</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
            Pressione "Sincronizar Banco" para buscar os dados de saúde do catálogo do Mercado Livre.
          </p>
        </div>
      )}

      {/* Purchase Experience Modal */}
      {selectedItem && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => { setSelectedItem(null); setItemStatusData(null); }}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto animate-fade-in"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
              <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm"><Star className="w-4 h-4 text-yellow-400" /> Experiência de Compra</h3>
              <button onClick={() => { setSelectedItem(null); setItemStatusData(null); }} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4">
              <div className="mb-4">
                <p className="text-sm font-medium text-foreground">{selectedItem.titulo || selectedItem.mlb_id}</p>
                <p className="text-[10px] text-muted-foreground">{selectedItem.mlb_id} • {selectedItem.conta}</p>
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

                        {pe.freeze?.text && (
                          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3">
                            <p className="text-xs text-blue-400">❄️ {pe.freeze.text.replace(/\{\d+\}/g, '')}</p>
                          </div>
                        )}

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

                        {pe.metrics_details?.empty_state_title && !pe.metrics_details?.problems?.length && (
                          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-center">
                            <p className="text-xs text-emerald-400">✅ {pe.metrics_details.empty_state_title}</p>
                          </div>
                        )}

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
