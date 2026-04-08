import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import { KpiCard } from '@/components/shared/KpiCard';
import { ShieldAlert, ShieldCheck, Shield, AlertTriangle, ArrowDownCircle, RefreshCw } from 'lucide-react';
import { AccordionTaskRow } from './AccordionTaskRow';
import { toast } from 'sonner';

interface HealthData {
  mlb_id: string;
  conta: string;
  health: number;
  health_actions: string[];
  snapshot_date: string;
}

export function CatalogExperienceTab() {
  const { performanceItems } = useSheetsData();
  const [healthHistory, setHealthHistory] = useState<HealthData[]>([]);
  const [loadingDb, setLoadingDb] = useState(true);
  const [filterConta, setFilterConta] = useState('all');

  const fetchHealth = async () => {
    try {
      setLoadingDb(true);
      // Fetch latest using raw descending sort and overriding in a map
      const { data, error } = await (supabase as any)
        .from('catalog_health_history')
        .select('*')
        .order('snapshot_date', { ascending: true }); // older first, so newer overwrites in map

      if (!error && data) {
         // Deduplicate to keep latest snapshot only
         const map = new Map<string, HealthData>();
         data.forEach((item: any) => {
            const key = `${item.mlb_id}||${item.conta}`;
            map.set(key, item);
         });
         setHealthHistory(Array.from(map.values()));
      }
    } catch {
      // Ignored
    } finally {
      setLoadingDb(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const handleSyncHealth = async () => {
    try {
      setLoadingDb(true);
      toast.info('Buscando dados de Saúde do Catálogo no Mercado Livre...');
      
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('mercado-livre', {
        body: { action: 'get_performance_catalog' },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });

      if (error) {
        toast.error(`Erro ao sincronizar: ${error.message}`);
      } else {
        toast.success('Dados atualizados no banco com sucesso!');
      }
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      // Re-fetch from DB regardless of result
      await fetchHealth();
    }
  };

  const contasUnicas = useMemo(() => {
    const set = new Set<string>();
    healthHistory.forEach(h => set.add(h.conta));
    return Array.from(set).sort();
  }, [healthHistory]);

  const jointData = useMemo(() => {
    // Merge Health DB with Spreadsheets Performance
    // Spreadsheet usually has multiple rows per mlb, we just need one to get title, sku
    const perfMap = new Map<string, any>();
    (performanceItems || []).forEach(p => {
       perfMap.set(`${p.idAnuncio}||${p.conta}`, p);
    });

    const rows = healthHistory
      .filter(h => filterConta === 'all' || h.conta === filterConta)
      .map(h => {
         const p = perfMap.get(`${h.mlb_id}||${h.conta}`);
         return {
           idAnuncio: h.mlb_id,
           conta: h.conta,
           health: h.health,
           health_actions: h.health_actions,
           titulo: p?.titulo || 'Título não encontrado',
           sku: p?.sku || 'N/A',
           preco: p?.preco || 0
         };
      });

    // Group by Buckets
    const buckets = {
      excellent: rows.filter(r => r.health >= 1),
      good: rows.filter(r => r.health >= 0.75 && r.health < 1),
      average: rows.filter(r => r.health >= 0.65 && r.health < 0.75),
      poor: rows.filter(r => r.health >= 0.50 && r.health < 0.65),
      critical: rows.filter(r => r.health < 0.50)
    };

    return { rows, buckets };
  }, [healthHistory, filterConta, performanceItems]);

  const { buckets } = jointData;

  const Bfs = [
    { key: 'excellent', title: 'Excelente (100%)', data: buckets.excellent, icon: ShieldCheck, color: 'text-emerald-500' },
    { key: 'good', title: 'Bom (75%)', data: buckets.good, icon: Shield, color: 'text-blue-500' },
    { key: 'average', title: 'Regular (65%)', data: buckets.average, icon: ShieldAlert, color: 'text-yellow-500' },
    { key: 'poor', title: 'Baixo (50%)', data: buckets.poor, icon: AlertTriangle, color: 'text-orange-500' },
    { key: 'critical', title: 'Crítico (<=30%)', data: buckets.critical, icon: ArrowDownCircle, color: 'text-red-500' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
           <label className="text-xs text-muted-foreground font-semibold">Filtrar por Conta:</label>
           <select 
              value={filterConta} 
              onChange={e => setFilterConta(e.target.value)}
              className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm"
           >
              <option value="all">Todas as Contas</option>
              {contasUnicas.map(c => <option key={c} value={c}>{c}</option>)}
           </select>
        </div>
        <button 
           onClick={handleSyncHealth}
           className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[hsl(var(--vix-info)/0.1)] text-[hsl(var(--vix-info))] border border-[hsl(var(--vix-info)/0.2)] text-xs font-semibold hover:bg-[hsl(var(--vix-info)/0.2)] transition-colors"
        >
           <RefreshCw className={`w-3.5 h-3.5 ${loadingDb ? 'animate-spin' : ''}`} /> Sincronizar Banco
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard title="100% (Excelente)" value={String(buckets.excellent.length)} icon={ShieldCheck} delay={0} />
        <KpiCard title="75% (Bom)" value={String(buckets.good.length)} icon={Shield} delay={50} />
        <KpiCard title="65% (Regular)" value={String(buckets.average.length)} icon={ShieldAlert} delay={100} />
        <KpiCard title="50% (Baixo)" value={String(buckets.poor.length)} icon={AlertTriangle} delay={150} />
        <KpiCard title="<=30% (Crítico)" value={String(buckets.critical.length)} icon={ArrowDownCircle} delay={200} />
      </div>

      {Bfs.map((bucket) => bucket.data.length > 0 && (
         <div key={bucket.key} className="bg-card border border-border rounded-xl overflow-hidden mb-6">
           <div className="bg-muted/30 px-4 py-3 border-b border-border flex items-center gap-2">
             <bucket.icon className={`w-4 h-4 ${bucket.color}`} />
             <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">{bucket.title}</h3>
             <span className="ml-auto text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{bucket.data.length} anúncios</span>
           </div>
           
           <div className="overflow-x-auto">
             <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 font-medium text-muted-foreground">ID Anúncio</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">SKU</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">Título</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">Conta</th>
                  </tr>
                </thead>
                <tbody>
                   {bucket.data.map(item => (
                     <Fragment key={`${item.idAnuncio}-${item.conta}`}>
                       <tr className="hover:bg-muted/20">
                          <td className="px-4 py-2 font-mono text-primary font-medium">{item.idAnuncio}</td>
                          <td className="px-4 py-2 font-mono text-muted-foreground">{item.sku}</td>
                          <td className="px-4 py-2 truncate max-w-[300px]" title={item.titulo}>{item.titulo}</td>
                          <td className="px-4 py-2 text-muted-foreground">{item.conta}</td>
                       </tr>
                       <AccordionTaskRow 
                          idAnuncio={item.idAnuncio} 
                          sku={item.sku} 
                          titulo={item.titulo}
                          conta={item.conta}
                          experienciaInfo={{ health: item.health, actions: item.health_actions }}
                          colSpan={4}
                       />
                     </Fragment>
                   ))}
                </tbody>
             </table>
           </div>
         </div>
      ))}
      
      {jointData.rows.length === 0 && !loadingDb && (
        <div className="text-center py-12 bg-card border border-border rounded-xl mt-6">
          <ShieldAlert className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <h3 className="text-sm font-semibold text-foreground">Sem dados de Experiência</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">Nenhum anúncio armazenado com nota de qualidade no Supabase ainda. Pressione "Sincronizar Banco" para verificar e salvar relatórios.</p>
        </div>
      )}
    </div>
  );
}
