// v3 - accordion inline with AccordionTaskRow + score badge in row
import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { KpiCard } from '@/components/shared/KpiCard';
import { ShieldAlert, ShieldCheck, Shield, AlertTriangle, ArrowDownCircle, RefreshCw, Loader2 } from 'lucide-react';
import { AccordionTaskRow, AccordionTriggerButton } from './AccordionTaskRow';
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
  const [openAccordionId, setOpenAccordionId] = useState<string | null>(null);
  const [contaAccountMap, setContaAccountMap] = useState<Record<string, string>>({});

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
        // Keep only the most recent snapshot per (mlb_id, conta)
        const map = new Map<string, HealthData>();
        data.forEach((item: any) => {
          const key = `${item.mlb_id}||${item.conta}`;
          if (!map.has(key)) map.set(key, item);
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
        .from('ml_accounts' as any).select('id, nome').eq('ativo', true);

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
        else successCount++;
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
  }), [rows]);

  const scoreBadge = (h: HealthData) => {
    const pct = Math.round(h.health * 100);
    const label = h.reputation_text || (pct >= 75 ? 'Boa' : pct >= 65 ? 'Média' : pct >= 50 ? 'Regular' : pct > 0 ? 'Ruim' : '-');
    const cls =
      h.reputation_color === 'green'  ? 'text-emerald-400 border-emerald-400 bg-emerald-500/10' :
      h.reputation_color === 'orange' ? 'text-orange-400 border-orange-400 bg-orange-500/10'   :
      h.reputation_color === 'red'    ? 'text-red-400 border-red-400 bg-red-500/10'             :
      pct >= 75                       ? 'text-emerald-400 border-emerald-400 bg-emerald-500/10' :
      pct >= 50                       ? 'text-orange-400 border-orange-400 bg-orange-500/10'    :
                                        'text-red-400 border-red-400 bg-red-500/10';
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${cls}`}>
        <span className="text-xs font-bold">{pct}</span>
        <span>{label}</span>
      </span>
    );
  };

  const Bfs = [
    { key: 'excellent', title: '100% (Excelente)', data: buckets.excellent, icon: ShieldCheck,    color: 'text-emerald-500' },
    { key: 'good',      title: '75% (Bom)',        data: buckets.good,      icon: Shield,          color: 'text-blue-500' },
    { key: 'average',   title: '65% (Regular)',    data: buckets.average,   icon: ShieldAlert,     color: 'text-yellow-500' },
    { key: 'poor',      title: '50% (Baixo)',      data: buckets.poor,      icon: AlertTriangle,   color: 'text-orange-500' },
    { key: 'critical',  title: '<50% (Crítico)',   data: buckets.critical,  icon: ArrowDownCircle, color: 'text-red-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Controls */}
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

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard title="100% (Excelente)" value={String(buckets.excellent.length)} icon={ShieldCheck}    delay={0} />
        <KpiCard title="75% (Bom)"        value={String(buckets.good.length)}      icon={Shield}          delay={50} />
        <KpiCard title="65% (Regular)"    value={String(buckets.average.length)}   icon={ShieldAlert}     delay={100} />
        <KpiCard title="50% (Baixo)"      value={String(buckets.poor.length)}      icon={AlertTriangle}   delay={150} />
        <KpiCard title="<50% (Crítico)"   value={String(buckets.critical.length)}  icon={ArrowDownCircle} delay={200} />
      </div>

      {/* Bucket tables */}
      {Bfs.map(bucket => bucket.data.length > 0 && (
        <div key={bucket.key} className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="bg-muted/30 px-4 py-3 border-b border-border flex items-center gap-2">
            <bucket.icon className={`w-4 h-4 ${bucket.color}`} />
            <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">{bucket.title}</h3>
            <span className="ml-auto text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {bucket.data.length} anúncios
            </span>
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
                  <Fragment key={`${item.mlb_id}-${item.conta}`}>
                    <tr className="hover:bg-muted/20 border-t border-border">
                      <td className="px-4 py-2">{scoreBadge(item)}</td>
                      <td className="px-4 py-2 font-mono text-primary font-medium">{item.mlb_id}</td>
                      <td className="px-4 py-2 font-mono text-muted-foreground">{item.sku || 'N/A'}</td>
                      <td className="px-4 py-2 truncate max-w-[280px]" title={item.titulo}>
                        {item.titulo || 'Título não disponível'}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{item.conta}</td>
                      <td className="px-4 py-2 text-right">
                        <AccordionTriggerButton
                          isOpen={openAccordionId === `${item.mlb_id}||${item.conta}`}
                          onClick={() => setOpenAccordionId(prev =>
                            prev === `${item.mlb_id}||${item.conta}` ? null : `${item.mlb_id}||${item.conta}`
                          )}
                        />
                      </td>
                    </tr>
                    <AccordionTaskRow
                      idAnuncio={item.mlb_id}
                      sku={item.sku || 'N/A'}
                      titulo={item.titulo || item.mlb_id}
                      conta={item.conta}
                      accountId={contaAccountMap[item.conta]}
                      isOpen={openAccordionId === `${item.mlb_id}||${item.conta}`}
                      onClose={() => setOpenAccordionId(null)}
                      experienciaInfo={{ health: item.health, actions: item.health_actions || [] }}
                      colSpan={6}
                    />
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Empty state */}
      {rows.length === 0 && !loadingDb && (
        <div className="text-center py-12 bg-card border border-border rounded-xl mt-6">
          <ShieldAlert className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <h3 className="text-sm font-semibold text-foreground">Sem dados de Experiência</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
            Pressione "Sincronizar Banco" para buscar os dados de saúde do catálogo do Mercado Livre.
          </p>
        </div>
      )}
    </div>
  );
}
