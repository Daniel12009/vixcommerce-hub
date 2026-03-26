import { useState, useEffect, useRef, useCallback } from 'react';
import { Settings, FileSpreadsheet, Users, Key, Wifi, WifiOff, Trash2, RefreshCw, Loader2, CheckCircle, XCircle, Download, Settings2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserManagementPage } from '@/components/auth/UserManagementPage';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  type SheetConfig,
  loadSheetConfigs, saveSheetConfigs,
  saveSheetConfigsToCloud, loadSheetConfigsFromCloud,
  importSingleSheet,
} from '@/lib/sheets-store';
import { useSheetsData } from '@/contexts/SheetsDataContext';

const MODULE_LABELS: Record<string, string> = {
  'estoque': '📦 Estoque',
  'estoque-full': '📦 Estoque Full (ML)',
  'estoque-tiny': '🏠 Estoque Tiny',
  'financeiro': '💰 Financeiro',
  'vendas': '🛒 Vendas',
  'performance': '📊 Performance',
  'ads': '📢 Performance ADS',
  'devolucao': '🔄 Devolução',
};

const MODULE_COLORS: Record<string, string> = {
  'estoque': 'bg-emerald-500/10 text-emerald-400',
  'estoque-full': 'bg-blue-500/10 text-blue-400',
  'estoque-tiny': 'bg-cyan-500/10 text-cyan-400',
  'financeiro': 'bg-yellow-500/10 text-yellow-400',
  'vendas': 'bg-purple-500/10 text-purple-400',
  'performance': 'bg-orange-500/10 text-orange-400',
  'ads': 'bg-pink-500/10 text-pink-400',
  'devolucao': 'bg-red-500/10 text-red-400',
};

interface MLAccount {
  id: string;
  seller_id: number;
  nickname: string;
  ativo: boolean;
  ultimo_sync?: string;
}

export function ConfiguracoesPage() {
  const [tab, setTab] = useState('planilhas');
  const [sheetConfigs, setSheetConfigs] = useState<SheetConfig[]>([]);
  const [mlAccounts, setMlAccounts] = useState<MLAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const cloudReady = useRef(false);
  const hasLoaded = useRef(false);
  const sheetsData = useSheetsData();

  // Load sheet configs from cloud
  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    loadSheetConfigsFromCloud().then(cloudConfigs => {
      const configs = (cloudConfigs && cloudConfigs.length > 0) ? cloudConfigs : loadSheetConfigs();
      cloudReady.current = true;
      setSheetConfigs(configs);
    });
  }, []);

  // Persist configs
  useEffect(() => {
    saveSheetConfigs(sheetConfigs);
    if (cloudReady.current) saveSheetConfigsToCloud(sheetConfigs);
  }, [sheetConfigs]);

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

  const handleDeleteConfig = (id: string) => {
    if (!confirm('Remover esta configuração?')) return;
    setSheetConfigs(prev => prev.filter(c => c.id !== id));
    toast.success('Configuração removida');
  };

  const handleImportSingle = async (config: SheetConfig) => {
    if (Object.keys(config.mapeamento).length === 0) {
      toast.error('Configure o mapeamento de colunas primeiro (em Performance → Planilhas Google)');
      return;
    }
    setImportingId(config.id);
    try {
      const result = await importSingleSheet(config);
      if (result) {
        const mod = config.moduloDestino;
        if (mod === 'vendas') sheetsData.setVendasFromSheet(result.parsed);
        else if (mod === 'estoque-full') sheetsData.setEstoqueFullFromSheet(result.parsed);
        else if (mod === 'estoque-tiny') sheetsData.setEstoqueTinyFromSheet(result.parsed);
        toast.success(`${config.nome}: ${result.parsed.length} registros importados`);
        setSheetConfigs(prev => prev.map(c => c.id === config.id ? { ...c, ultimaSync: new Date().toLocaleString('pt-BR') } : c));
      } else {
        toast.error('Falha na importação');
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro');
    }
    setImportingId(null);
  };

  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Planilhas, integrações e gerenciamento de usuários"
        icon={Settings}
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-6 mt-6">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="planilhas"><FileSpreadsheet className="w-4 h-4 mr-1.5" /> Planilhas</TabsTrigger>
          <TabsTrigger value="api"><Key className="w-4 h-4 mr-1.5" /> API / Tokens</TabsTrigger>
          <TabsTrigger value="usuarios"><Users className="w-4 h-4 mr-1.5" /> Usuários</TabsTrigger>
        </TabsList>

        {/* ═══ PLANILHAS TAB ═══ */}
        <TabsContent value="planilhas">
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(
                sheetConfigs.reduce<Record<string, number>>((acc, c) => {
                  acc[c.moduloDestino] = (acc[c.moduloDestino] || 0) + 1;
                  return acc;
                }, {})
              ).map(([mod, count]) => (
                <div key={mod} className="bg-card border border-border rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-foreground">{count}</p>
                  <p className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block ${MODULE_COLORS[mod] || 'bg-muted text-muted-foreground'}`}>
                    {MODULE_LABELS[mod] || mod}
                  </p>
                </div>
              ))}
            </div>

            {/* Configs List */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-foreground font-semibold text-sm flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-primary" />
                  Fontes Configuradas ({sheetConfigs.length})
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  Para adicionar ou editar mapeamento → Performance → Planilhas Google
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">Nome</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">Aba</th>
                    <th className="text-center py-2.5 px-4 text-xs font-medium text-muted-foreground">Módulo</th>
                    <th className="text-center py-2.5 px-4 text-xs font-medium text-muted-foreground">Colunas</th>
                    <th className="text-center py-2.5 px-4 text-xs font-medium text-muted-foreground">Último Sync</th>
                    <th className="text-right py-2.5 px-4 text-xs font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {sheetConfigs.map(c => {
                    const mappedCount = Object.keys(c.mapeamento).length;
                    return (
                      <tr key={c.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-4">
                          <p className="text-xs font-medium text-foreground">{c.nome}</p>
                          <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{c.spreadsheetId}</p>
                        </td>
                        <td className="py-2.5 px-4 text-xs text-foreground">{c.abaNome}</td>
                        <td className="py-2.5 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${MODULE_COLORS[c.moduloDestino] || 'bg-muted text-muted-foreground'}`}>
                            {MODULE_LABELS[c.moduloDestino] || c.moduloDestino}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          {mappedCount > 0 ? (
                            <span className="text-xs text-emerald-400 font-medium">{mappedCount} ✓</span>
                          ) : (
                            <span className="text-xs text-yellow-400 font-medium">⚠️ Não mapeado</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-center text-[10px] text-muted-foreground">
                          {c.ultimaSync || '-'}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleImportSingle(c)}
                              disabled={importingId === c.id}
                              className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                              title="Importar"
                            >
                              {importingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => handleDeleteConfig(c.id)}
                              className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                              title="Remover"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {sheetConfigs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                        Nenhuma planilha configurada. Vá em Performance → Planilhas Google para adicionar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
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
