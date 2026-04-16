import { useState, useEffect } from 'react';
import { ToggleLeft, ToggleRight, Wifi, WifiOff, Loader2, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ShopeeAccount {
  id: string;
  nome: string;
  shop_id: string;
  source_mode: 'tiny' | 'api';
  ativo: boolean;
  access_token?: string;
}

export function MarketplaceSourceConfig() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<ShopeeAccount[]>([]);
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => { loadAccounts(); }, []);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('shopee_accounts')
        .select('id, nome, shop_id, source_mode, ativo, access_token')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      setAccounts((data || []).map((a: any) => ({ ...a, source_mode: a.source_mode || 'tiny' })));
    } catch (err: any) {
      toast.error('Erro ao carregar contas: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = async (accountId: string, currentMode: string) => {
    const newMode = currentMode === 'tiny' ? 'api' : 'tiny';
    try {
      const { error } = await (supabase as any)
        .from('shopee_accounts')
        .update({ source_mode: newMode })
        .eq('id', accountId);
      if (error) throw error;

      setAccounts(prev => prev.map(a =>
        a.id === accountId ? { ...a, source_mode: newMode as 'tiny' | 'api' } : a
      ));
      toast.success(`Modo alterado para ${newMode === 'api' ? 'API Direta' : 'Tiny ERP'}`);
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    }
  };

  const testConnection = async (accountId: string) => {
    setTesting(accountId);
    try {
      const { data, error } = await supabase.functions.invoke('shopee', {
        body: { action: 'list_items', account_id: accountId, limit: 1 },
      });
      if (error) throw error;

      if (data.error) {
        toast.error(`Falha na conexão: ${data.error}`);
      } else {
        toast.success(`Conexão OK! ${data.total || 0} itens encontrados`);
      }
    } catch (err: any) {
      toast.error('Erro ao testar: ' + err.message);
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center animate-fade-in">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center animate-fade-in">
        <WifiOff className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-40" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Nenhuma conta Shopee ativa</h3>
        <p className="text-sm text-muted-foreground">
          Adicione contas Shopee na aba <strong>API / Tokens</strong> para configurar a fonte de dados.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-3xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Wifi className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Fonte de Dados por Marketplace</h2>
            <p className="text-sm text-muted-foreground">
              Configure se os dados de vendas vêm do Tiny ERP ou da API direta de cada plataforma.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {accounts.map(account => {
          const isApi = account.source_mode === 'api';
          const hasToken = !!account.access_token;
          const isTesting = testing === account.id;

          return (
            <div
              key={account.id}
              className="bg-card border border-border rounded-xl p-5 transition-all hover:shadow-md"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${isApi ? 'bg-[hsl(var(--vix-success))]' : 'bg-primary'}`} />
                  <div>
                    <h3 className="font-semibold text-foreground">{account.nome}</h3>
                    <p className="text-xs text-muted-foreground">
                      Shop ID: {account.shop_id} · Shopee
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isApi
                    ? 'bg-[hsl(var(--vix-success)/0.15)] text-[hsl(var(--vix-success))]'
                    : 'bg-primary/10 text-primary'
                  }`}>
                    {isApi ? 'API Direta' : 'Tiny ERP'}
                  </span>
                </div>
              </div>

              {/* Toggle */}
              <div className="flex items-center gap-4 py-3 border-t border-border">
                <span className={`text-sm font-medium transition-colors ${!isApi ? 'text-foreground' : 'text-muted-foreground'}`}>
                  Tiny ERP
                </span>

                <button
                  onClick={() => toggleMode(account.id, account.source_mode)}
                  className="relative group"
                  title={`Alternar para ${isApi ? 'Tiny ERP' : 'API Direta'}`}
                >
                  <div className={`w-14 h-7 rounded-full transition-colors duration-300 ${isApi
                    ? 'bg-[hsl(var(--vix-success))]'
                    : 'bg-muted-foreground/30'
                  }`}>
                    <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-300 ${isApi ? 'translate-x-7' : 'translate-x-0.5'
                    }`} />
                  </div>
                </button>

                <span className={`text-sm font-medium transition-colors ${isApi ? 'text-foreground' : 'text-muted-foreground'}`}>
                  API Direta
                </span>
              </div>

              {/* Warning for API mode without token */}
              {isApi && !hasToken && (
                <div className="flex items-start gap-2 mt-2 p-3 rounded-lg bg-[hsl(var(--vix-warning)/0.1)] border border-[hsl(var(--vix-warning)/0.2)]">
                  <AlertTriangle className="w-4 h-4 text-[hsl(var(--vix-warning))] mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-[hsl(var(--vix-warning))]">
                    Para usar API direta, configure as credenciais (Access Token, Partner Key) desta conta Shopee na aba <strong>API / Tokens</strong>.
                  </p>
                </div>
              )}

              {/* Success info for API mode with token */}
              {isApi && hasToken && (
                <div className="flex items-start gap-2 mt-2 p-3 rounded-lg bg-[hsl(var(--vix-success)/0.1)] border border-[hsl(var(--vix-success)/0.2)]">
                  <CheckCircle className="w-4 h-4 text-[hsl(var(--vix-success))] mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-[hsl(var(--vix-success))]">
                    Credenciais configuradas. Os dados de vendas serão buscados diretamente da API Shopee.
                  </p>
                </div>
              )}

              {/* Test Connection Button */}
              {isApi && (
                <div className="mt-3 pt-3 border-t border-border">
                  <button
                    onClick={() => testConnection(account.id)}
                    disabled={isTesting}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted/50 transition-colors disabled:opacity-50"
                  >
                    {isTesting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    {isTesting ? 'Testando...' : 'Testar Conexão'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 rounded-lg bg-muted/30 border border-border">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong>Tiny ERP</strong> — Padrão. As vendas são buscadas via integração com o Tiny ERP (requer conta Tiny configurada).
          <br />
          <strong>API Direta</strong> — Os dados são buscados diretamente da API oficial da Shopee. Mais rápido e preciso, mas requer credenciais de API ativas.
        </p>
      </div>
    </div>
  );
}
