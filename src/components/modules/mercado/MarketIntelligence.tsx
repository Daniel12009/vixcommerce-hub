import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { RefreshCw, Loader2, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { SellersTab } from './SellersTab';
import { CategoriasTab } from './CategoriasTab';
import { MercadoTab } from './MercadoTab';

async function callMarketData(action: string, extra: Record<string, any> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke('market-data', {
    body: { action, ...extra },
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

export function MarketIntelligence() {
  const [sellers, setSellers] = useState<any[]>([]);
  const [segments, setSegments] = useState<any[]>([]);
  const [myAccounts, setMyAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sellersData, segmentsData, accountsData] = await Promise.all([
        callMarketData('list_sellers'),
        callMarketData('list_segments'),
        callMarketData('get_my_accounts'),
      ]);
      setSellers(Array.isArray(sellersData) ? sellersData : []);
      setSegments(Array.isArray(segmentsData) ? segmentsData : []);
      setMyAccounts(Array.isArray(accountsData) ? accountsData : []);
    } catch (err: any) {
      toast.error('Erro ao carregar dados: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleCollect = async () => {
    setCollecting(true);
    try {
      toast.info('Coletando dados do Mercado Livre… pode levar ~30s');
      const result = await callMarketData('run_collector');
      toast.success(`Coleta concluída! ${result.snapshots_saved || 0} registros salvos.`);
      await loadAll();
    } catch (err: any) {
      toast.error('Erro na coleta: ' + err.message);
    } finally {
      setCollecting(false);
    }
  };

  // Separate segments by tipo
  const categorias = segments.filter(s => s.tipo === 'categoria');
  const keywords = segments.filter(s => s.tipo === 'keyword');

  return (
    <div>
      <PageHeader
        title="Monitor de Mercado"
        subtitle="Inteligência competitiva no seu nicho do Mercado Livre"
        action={
          <Button onClick={handleCollect} disabled={collecting} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
            {collecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {collecting ? 'Coletando…' : 'Atualizar Dados'}
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          <span className="ml-3 text-muted-foreground">Carregando inteligência de mercado…</span>
        </div>
      ) : (
        <Tabs defaultValue="mercado" className="space-y-6">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="sellers">👤 Sellers</TabsTrigger>
            <TabsTrigger value="categorias">📂 Categorias</TabsTrigger>
            <TabsTrigger value="mercado">📊 Mercado / Produto</TabsTrigger>
          </TabsList>

          <TabsContent value="sellers">
            <SellersTab
              sellers={sellers}
              myAccounts={myAccounts}
              onRefresh={loadAll}
              callMarketData={callMarketData}
            />
          </TabsContent>

          <TabsContent value="categorias">
            <CategoriasTab
              segments={categorias.length > 0 ? categorias : keywords.slice(0, 8)}
              onRefresh={loadAll}
              callMarketData={callMarketData}
            />
          </TabsContent>

          <TabsContent value="mercado">
            <MercadoTab
              segments={keywords}
              sellers={sellers}
              myAccounts={myAccounts}
              onRefresh={loadAll}
              callMarketData={callMarketData}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
