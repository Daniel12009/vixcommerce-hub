import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';
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

async function loadAllItems(accounts: any[]) {
  const { data: { session } } = await supabase.auth.getSession();
  const allItems: any[] = [];
  for (const acc of accounts) {
    try {
      let offset = 0;
      const limit = 100;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase.functions.invoke('mercado-livre', {
          body: { action: 'list_seller_items', account_id: acc.id, offset, limit },
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        if (error || !data) break;
        const items = (data.items || []).map((i: any) => ({ ...i, conta: acc.nome, account_id: acc.id }));
        allItems.push(...items);
        offset += limit;
        hasMore = offset < (data.total || 0) && data.items?.length === limit;
      }
    } catch { /* skip failed account */ }
  }
  return allItems;
}

export function MarketIntelligence() {
  const [myAccounts, setMyAccounts] = useState<any[]>([]);
  const [myItems, setMyItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const mySellerIds = myAccounts.map(a => String(a.seller_id)).filter(Boolean);

  const load = useCallback(async () => {
    setLoadingItems(true);
    try {
      const accounts = await callMarketData('get_my_accounts');
      const accs = Array.isArray(accounts) ? accounts : [];
      setMyAccounts(accs);
      if (accs.length > 0) {
        const items = await loadAllItems(accs);
        setMyItems(items);
      }
    } catch (err: any) {
      toast.error('Erro ao carregar produtos: ' + err.message);
    } finally {
      setLoadingItems(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    toast.success('Dados atualizados!');
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Monitor de Mercado</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Inteligência competitiva — {myItems.length} produtos em {myAccounts.length} conta{myAccounts.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing || loadingItems} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Recarregar
        </Button>
      </div>

      <Tabs defaultValue="sellers" className="space-y-6">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="sellers">📦 Meus Produtos</TabsTrigger>
          <TabsTrigger value="categorias">📂 Categorias</TabsTrigger>
          <TabsTrigger value="mercado">🔍 Busca de Ranking</TabsTrigger>
        </TabsList>

        <TabsContent value="sellers">
          <SellersTab
            myAccounts={myAccounts}
            myItems={myItems}
            mySellerIds={mySellerIds}
            loadingItems={loadingItems}
            callMarketData={callMarketData}
          />
        </TabsContent>

        <TabsContent value="categorias">
          <CategoriasTab
            myItems={myItems}
            mySellerIds={mySellerIds}
            loadingItems={loadingItems}
            callMarketData={callMarketData}
          />
        </TabsContent>

        <TabsContent value="mercado">
          <MercadoTab
            mySellerIds={mySellerIds}
            callMarketData={callMarketData}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
