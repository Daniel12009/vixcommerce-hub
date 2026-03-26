import { useState, useEffect } from 'react';
import { FileSpreadsheet, Users, Key, Wifi, Loader2, CheckCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserManagementPage } from '@/components/auth/UserManagementPage';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { PlanilhasConfigSection } from './PlanilhasConfigSection';

interface MLAccount {
  id: string;
  seller_id: number;
  nickname: string;
  ativo: boolean;
  ultimo_sync?: string;
}

export function ConfiguracoesPage() {
  const [tab, setTab] = useState('planilhas');
  const [mlAccounts, setMlAccounts] = useState<MLAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // Load ML accounts
  useEffect(() => {
    if (tab === 'api') {
      setLoadingAccounts(true);
      (supabase as any).from('ml_accounts').select('*').order('nickname').then(({ data }: any) => {
        setMlAccounts(data || []);
        setLoadingAccounts(false);
      });
    }
  }, [tab]);

  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Planilhas, integrações e gerenciamento de usuários"
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-6 mt-6">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="planilhas"><FileSpreadsheet className="w-4 h-4 mr-1.5" /> Planilhas</TabsTrigger>
          <TabsTrigger value="api"><Key className="w-4 h-4 mr-1.5" /> API / Tokens</TabsTrigger>
          <TabsTrigger value="usuarios"><Users className="w-4 h-4 mr-1.5" /> Usuários</TabsTrigger>
        </TabsList>

        {/* ═══ PLANILHAS TAB ═══ */}
        <TabsContent value="planilhas">
          <PlanilhasConfigSection />
        </TabsContent>

        {/* ═══ API / TOKENS TAB ═══ */}
        <TabsContent value="api">
          <div className="space-y-4">
            {/* Supabase Status */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-foreground font-semibold text-sm mb-3 flex items-center gap-2">
                <Wifi className="w-4 h-4 text-emerald-400" />
                Conexão Supabase
              </h3>
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <div>
                  <p className="text-sm text-foreground font-medium">Conectado</p>
                  <p className="text-[10px] text-muted-foreground">mbxpkqhjapmhehdngfaj.supabase.co</p>
                </div>
              </div>
            </div>

            {/* ML Accounts */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-foreground font-semibold text-sm flex items-center gap-2">
                  <Key className="w-4 h-4 text-primary" />
                  Contas Mercado Livre ({mlAccounts.length})
                </h3>
              </div>
              {loadingAccounts ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="ml-2 text-sm text-muted-foreground">Carregando contas...</span>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">Nickname</th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">Seller ID</th>
                      <th className="text-center py-2.5 px-4 text-xs font-medium text-muted-foreground">Status</th>
                      <th className="text-right py-2.5 px-4 text-xs font-medium text-muted-foreground">Último Sync</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mlAccounts.map(acc => (
                      <tr key={acc.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-4 text-xs font-semibold text-foreground">{acc.nickname}</td>
                        <td className="py-2.5 px-4 text-xs text-muted-foreground font-mono">{acc.seller_id}</td>
                        <td className="py-2.5 px-4 text-center">
                          {acc.ativo ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-emerald-400 bg-emerald-400/10">Ativo</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-red-400 bg-red-400/10">Inativo</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right text-[10px] text-muted-foreground">{acc.ultimo_sync || '-'}</td>
                      </tr>
                    ))}
                    {mlAccounts.length === 0 && !loadingAccounts && (
                      <tr>
                        <td colSpan={4} className="text-center py-10 text-muted-foreground text-sm">
                          Nenhuma conta ML conectada
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Google Sheets API */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-foreground font-semibold text-sm mb-3 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                Google Sheets API
              </h3>
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <div>
                  <p className="text-sm text-foreground font-medium">Integrada via Edge Function</p>
                  <p className="text-[10px] text-muted-foreground">google-sheets (Supabase Edge Function)</p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ═══ USUÁRIOS TAB ═══ */}
        <TabsContent value="usuarios">
          <UserManagementPage onBack={() => setTab('planilhas')} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
