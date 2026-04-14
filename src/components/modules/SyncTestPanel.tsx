import { useState, useEffect } from 'react';
// sync: 2026-04-09
import { Play, Loader2, CheckCircle, XCircle, Clock, Zap, RefreshCw, Settings2, Power, Pencil, Save, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface LogEntry {
  timestamp: string;
  message: string;
  status: 'ok' | 'error' | 'running';
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

async function callEdgeFunction(name: string, body: object): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

// Modules that can be toggled for automation
const AUTOMATION_MODULES = [
  { key: 'ml_vendas', label: '📊 ML Vendas', description: 'Sincroniza vendas do Mercado Livre (dia anterior) → VendasML', group: 'Mercado Livre' },
  { key: 'ml_performance', label: '📈 ML Performance Catálogo', description: 'Visitas e conversão dos anúncios Full → PERF-{CONTA}', group: 'Mercado Livre' },
  { key: 'ml_v7', label: '📦 ML Vendas Full 7 Dias', description: 'Vendas últimos 7 dias agrupadas por SKU → V7-{CONTA}', group: 'Mercado Livre' },
  { key: 'ml_ads', label: '💰 ML ADS Report', description: 'Product ADS do dia anterior → ADS + ADS-TOTAL-ML', group: 'Mercado Livre' },
  { key: 'shopee_vendas', label: '🛒 Shopee Vendas', description: 'Vendas Shopee (API ou Tiny) → Shopee_Vendas', group: 'Shopee' },
  { key: 'tiny_shein', label: '👗 Shein Vendas', description: 'Vendas Shein via Tiny ERP → Shopee_Vendas', group: 'Tiny ERP' },
  { key: 'tiny_amazon', label: '📦 Amazon Vendas', description: 'Vendas Amazon via Tiny ERP → VENDASAZ', group: 'Tiny ERP' },
  { key: 'tiny_tiktok', label: '🎵 TikTok Vendas', description: 'Vendas TikTok via Tiny ERP → VENDASTK', group: 'Tiny ERP' },
  { key: 'tiny_temu', label: '🛍️ Temu Vendas', description: 'Vendas Temu via Tiny ERP → VENDASTM', group: 'Tiny ERP' },
  { key: 'tiny_estoque', label: '📦 Estoque Tiny', description: 'Saldo de todos os produtos ativos → ESTOQUE-TINY', group: 'Tiny ERP' },
  { key: 'sync_cmv_db', label: '📦 Sync CMV DB', description: 'Planilha CMV → cmv_db', group: 'Banco de Dados' },
  { key: 'sync_ads_db', label: '📢 Sync ADS DB', description: 'ADS por dia/conta → ads_db', group: 'Banco de Dados' },
];

const SYNC_ACTIONS = [
  {
    id: 'daily-sync',
    label: '🚀 Ciclo Completo (daily-sync)',
    description: 'Roda o ciclo completo: ML Vendas + Performance + V7 + ADS + Shopee + Outras',
    fn: 'daily-sync',
    body: { trigger: 'manual_test' },
    color: 'bg-gradient-to-r from-primary to-primary/70',
  },
  {
    id: 'ml-vendas',
    label: '📊 ML Vendas (dia anterior)',
    description: 'Busca vendas ML e escreve no Google Sheets → VendasML',
    fn: 'mercado-livre',
    bodyFn: (accountId: string) => ({
      action: 'sync_vendas',
      account_id: accountId,
    }),
    needsAccount: 'ml',
    color: 'bg-[hsl(45,100%,50%,0.15)]',
  },
  {
    id: 'ml-perf',
    label: '📈 ML Performance Catálogo',
    description: 'Busca itens Full catálogo com visitas/conversão → PERF-{CONTA}',
    fn: 'mercado-livre',
    bodyFn: (accountId: string) => ({
      action: 'get_performance_catalog',
      account_id: accountId,
    }),
    needsAccount: 'ml',
    color: 'bg-[hsl(45,100%,50%,0.15)]',
  },
  {
    id: 'ml-v7',
    label: '📦 ML Vendas Full 7 Dias',
    description: 'Vendas últimos 7 dias agrupadas por SKU → V7-{CONTA}',
    fn: 'mercado-livre',
    bodyFn: (accountId: string) => ({
      action: 'get_vendas_full_7d',
      account_id: accountId,
    }),
    needsAccount: 'ml',
    color: 'bg-[hsl(45,100%,50%,0.15)]',
  },
  {
    id: 'ml-ads',
    label: '💰 ML ADS Report',
    description: 'Product ADS do dia anterior → ADS + ADS-TOTAL-ML',
    fn: 'mercado-livre',
    bodyFn: (accountId: string) => ({
      action: 'get_ads_full_report',
      account_id: accountId,
      ad_type: 'product_ads',
    }),
    needsAccount: 'ml',
    color: 'bg-[hsl(45,100%,50%,0.15)]',
  },
  {
    id: 'tiny-shopee',
    label: '🛒 Shopee Vendas (via Tiny)',
    description: 'Busca vendas Shopee via Tiny ERP → Shopee_Vendas',
    fn: 'tiny',
    body: {
      action: 'sync_vendas_marketplace',
      plataforma: 'shopee',
      date_from: new Date(Date.now() - 86400000).toLocaleDateString('pt-BR'),
      date_to: new Date(Date.now() - 86400000).toLocaleDateString('pt-BR'),
    },
    color: 'bg-[hsl(16,100%,60%,0.15)]',
  },
  {
    id: 'tiny-shein',
    label: '👗 Shein Vendas (via Tiny)',
    description: 'Busca vendas Shein via Tiny ERP → Shopee_Vendas',
    fn: 'tiny',
    body: {
      action: 'sync_vendas_marketplace',
      plataforma: 'shein',
      date_from: new Date(Date.now() - 86400000).toLocaleDateString('pt-BR'),
      date_to: new Date(Date.now() - 86400000).toLocaleDateString('pt-BR'),
    },
    color: 'bg-[hsl(280,60%,50%,0.15)]',
  },
  {
    id: 'tiny-amazon',
    label: '📦 Amazon Vendas (via Tiny)',
    description: 'Busca vendas Amazon via Tiny ERP → VENDASAZ',
    fn: 'tiny',
    body: {
      action: 'sync_vendas_marketplace',
      plataforma: 'amazon',
      date_from: new Date(Date.now() - 86400000).toLocaleDateString('pt-BR'),
      date_to: new Date(Date.now() - 86400000).toLocaleDateString('pt-BR'),
    },
    color: 'bg-[hsl(30,100%,50%,0.15)]',
  },
  {
    id: 'tiny-tiktok',
    label: '🎵 TikTok Vendas (via Tiny)',
    description: 'Busca vendas TikTok via Tiny ERP → VENDASTK',
    fn: 'tiny',
    body: {
      action: 'sync_vendas_marketplace',
      plataforma: 'tiktok',
      date_from: new Date(Date.now() - 86400000).toLocaleDateString('pt-BR'),
      date_to: new Date(Date.now() - 86400000).toLocaleDateString('pt-BR'),
    },
    color: 'bg-[hsl(340,80%,55%,0.15)]',
  },
  {
    id: 'tiny-temu',
    label: '🛍️ Temu Vendas (via Tiny)',
    description: 'Busca vendas Temu via Tiny ERP → VENDASTM',
    fn: 'tiny',
    body: {
      action: 'sync_vendas_marketplace',
      plataforma: 'temu',
      date_from: new Date(Date.now() - 86400000).toLocaleDateString('pt-BR'),
      date_to: new Date(Date.now() - 86400000).toLocaleDateString('pt-BR'),
    },
    color: 'bg-[hsl(200,80%,50%,0.15)]',
  },
  {
    id: 'tiny-estoque',
    label: '📦 Estoque Tiny (JSchruber)',
    description: 'Busca saldo de todos os produtos ativos → ESTOQUE-TINY',
    fn: 'tiny',
    body: { action: 'sync_estoque_tiny' },
    color: 'bg-[hsl(160,60%,40%,0.15)]',
  },
  {
    id: 'sync-cmv-db',
    label: '📦 Sync CMV → Banco',
    description: 'Lê planilha de CMV de cada conta e salva em cmv_db',
    fn: 'daily-sync',
    body: { module: 'sync_cmv_db' },
    color: 'bg-[hsl(160,60%,40%,0.15)]',
  },
  {
    id: 'sync-ads-db',
    label: '📢 Sync ADS → Banco',
    description: 'Consolida ADS por dia/conta e salva em ads_db',
    fn: 'daily-sync',
    body: { module: 'sync_ads_db' },
    color: 'bg-[hsl(45,100%,50%,0.15)]',
  },
];

// ─── Automation Config Section ───────────────────────────────────────
const SUPABASE_FN_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_FN_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

async function callManageCron(body: object): Promise<any> {
  const res = await fetch(`${SUPABASE_FN_URL}/functions/v1/manage-cron`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_FN_KEY}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

function AutomationConfig() {
  const [enabledModules, setEnabledModules] = useState<Record<string, boolean>>({});
  const [schedules, setSchedules] = useState<Record<string, string>>({});
  const [editingTime, setEditingTime] = useState<Record<string, string>>({});
  const [editMode, setEditMode] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const [modulesRes, schedulesRes] = await Promise.all([
        supabase.from('app_data').select('data_value').eq('data_key', 'daily_sync_modules').maybeSingle(),
        supabase.from('app_data').select('data_value').eq('data_key', 'daily_sync_schedules').maybeSingle(),
      ]);
      if (modulesRes.data?.data_value && typeof modulesRes.data.data_value === 'object') {
        setEnabledModules(modulesRes.data.data_value as Record<string, boolean>);
      }
      // Load schedules from app_data first as fallback
      let schedulesFromDB: Record<string, string> = {};
      if (schedulesRes.data?.data_value && typeof schedulesRes.data.data_value === 'object') {
        schedulesFromDB = schedulesRes.data.data_value as Record<string, string>;
      }
      // Then try to override with live cron schedules (source of truth)
      try {
        const cronData = await callManageCron({ action: 'get_schedules' });
        if (cronData?.schedules && typeof cronData.schedules === 'object') {
          // Merge: live cron overrides app_data
          schedulesFromDB = { ...schedulesFromDB, ...cronData.schedules };
        }
      } catch (cronErr) {
        console.warn('Não foi possível carregar schedules do cron, usando app_data:', cronErr);
      }
      setSchedules(schedulesFromDB);
    } catch (e) {
      console.error('Erro ao carregar config:', e);
    } finally {
      setLoading(false);
    }
  };

  const toggleModule = async (key: string, enabled: boolean) => {
    const updated = { ...enabledModules, [key]: enabled };
    setEnabledModules(updated);
    setSaving(true);
    try {
      await supabase.from('app_data').upsert({
        data_key: 'daily_sync_modules',
        data_value: updated as any,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'data_key' });

      // Also update cron job
      const currentTime = schedules[key] || '';
      await callManageCron({
        action: 'set_schedule',
        module_key: key,
        time_brt: currentTime,
        enabled,
      });

      toast.success(`${enabled ? 'Ativado' : 'Desativado'}: ${AUTOMATION_MODULES.find(m => m.key === key)?.label}`);

      if (!enabled) {
        setEditMode(prev => ({ ...prev, [key]: false }));
      } else if (!currentTime) {
        // If enabling without a time, open edit mode
        setEditMode(prev => ({ ...prev, [key]: true }));
        setEditingTime(prev => ({ ...prev, [key]: '05:00' }));
      }
    } catch (e: any) {
      toast.error('Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  const saveSchedule = async (key: string) => {
    const time = editingTime[key];
    if (!time) return;
    setSavingSchedule(key);
    try {
      const result = await callManageCron({
        action: 'set_schedule',
        module_key: key,
        time_brt: time,
        enabled: true,
      });

      if (result.error) throw new Error(result.error);

      setSchedules(prev => ({ ...prev, [key]: time }));
      setEditMode(prev => ({ ...prev, [key]: false }));
      toast.success(`Horário salvo: ${time} (Brasília)`);
    } catch (e: any) {
      toast.error(`Erro ao salvar horário: ${e.message}`);
    } finally {
      setSavingSchedule(null);
    }
  };

  const startEditing = (key: string) => {
    setEditingTime(prev => ({ ...prev, [key]: schedules[key] || '05:00' }));
    setEditMode(prev => ({ ...prev, [key]: true }));
  };

  const enabledCount = Object.values(enabledModules).filter(Boolean).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // Group modules
  const groups = AUTOMATION_MODULES.reduce((acc, mod) => {
    if (!acc[mod.group]) acc[mod.group] = [];
    acc[mod.group].push(mod);
    return acc;
  }, {} as Record<string, typeof AUTOMATION_MODULES>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent/10">
            <Settings2 className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Automação Diária</h2>
            <p className="text-sm text-muted-foreground">
              Ative os módulos e configure o horário individual de cada um (Brasília).
            </p>
          </div>
        </div>
      <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            <Power className="w-3.5 h-3.5" />
            {enabledCount} ativo{enabledCount !== 1 ? 's' : ''}
          </div>
          {enabledCount > 0 && (
            <button
              onClick={async () => {
                if (!window.confirm('Resetar todos os agendamentos de teste? Isso desativa todos os módulos e apaga os horários salvos.')) return;
                setSaving(true);
                try {
                  await Promise.all([
                    supabase.from('app_data').upsert({ data_key: 'daily_sync_modules', data_value: {} as any, updated_at: new Date().toISOString() }, { onConflict: 'data_key' }),
                    supabase.from('app_data').upsert({ data_key: 'daily_sync_schedules', data_value: {} as any, updated_at: new Date().toISOString() }, { onConflict: 'data_key' }),
                  ]);
                  setEnabledModules({});
                  setSchedules({});
                  setEditMode({});
                  toast.success('Todos os agendamentos foram resetados.');
                } catch {
                  toast.error('Erro ao resetar agendamentos.');
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              Resetar tudo
            </button>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${enabledCount > 0 ? 'bg-[hsl(var(--vix-success))] animate-pulse' : 'bg-muted-foreground/30'}`} />
          <div>
            <p className="text-sm font-medium text-foreground">
              {enabledCount > 0
                ? `Cron ativo — ${enabledCount} módulo${enabledCount !== 1 ? 's' : ''} agendados individualmente`
                : 'Cron inativo — nenhum módulo habilitado'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cada módulo roda no seu próprio horário • Verificação final automática 10 min após o último
            </p>
          </div>
        </div>
      </div>

      {/* Module Groups */}
      {Object.entries(groups).map(([group, modules]) => (
        <div key={group} className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">{group}</h3>
          </div>
          <div className="divide-y divide-border">
            {modules.map(mod => {
              const isEnabled = !!enabledModules[mod.key];
              const savedTime = schedules[mod.key];
              const isEditing = editMode[mod.key];
              const isSavingThis = savingSchedule === mod.key;

              return (
                <div key={mod.key} className="px-4 py-3 hover:bg-muted/10 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0 mr-4">
                      <p className="text-sm font-medium text-foreground">{mod.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{mod.description}</p>
                    </div>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={(checked) => toggleModule(mod.key, checked)}
                      disabled={saving}
                    />
                  </div>

                  {/* Schedule time control */}
                  {isEnabled && (
                    <div className="mt-2 ml-0 flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          <input
                            type="time"
                            value={editingTime[mod.key] || '05:00'}
                            onChange={e => setEditingTime(prev => ({ ...prev, [mod.key]: e.target.value }))}
                            className="text-xs px-2 py-1 rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                          <span className="text-xs text-muted-foreground">BRT</span>
                          <button
                            onClick={() => saveSchedule(mod.key)}
                            disabled={isSavingThis}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                          >
                            {isSavingThis ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                            Salvar
                          </button>
                          {savedTime && (
                            <button
                              onClick={() => setEditMode(prev => ({ ...prev, [mod.key]: false }))}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Cancelar
                            </button>
                          )}
                        </>
                      ) : savedTime ? (
                        <>
                          <Clock className="w-3.5 h-3.5 text-primary" />
                          <span className="text-xs font-medium text-primary">{savedTime}</span>
                          <span className="text-xs text-muted-foreground">BRT</span>
                          <Check className="w-3.5 h-3.5 text-[hsl(var(--vix-success))]" />
                          <button
                            onClick={() => startEditing(mod.key)}
                            className="ml-1 p-1 rounded hover:bg-muted/30 transition-colors"
                            title="Alterar horário"
                          >
                            <Pencil className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => startEditing(mod.key)}
                          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          + Configurar horário
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}


      <p className="text-xs text-muted-foreground text-center">
        Os horários são sincronizados automaticamente com o agendador. Desativar um módulo remove o agendamento.
      </p>
    </div>
  );
}

// ─── Manual Test Section ─────────────────────────────────────────────
function ManualTestSection() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [mlAccounts, setMlAccounts] = useState<any[]>([]);
  const [selectedMl, setSelectedMl] = useState('');
  const [loaded, setLoaded] = useState(false);

  const loadAccounts = async () => {
    if (loaded) return;
    const { data } = await supabase.from('ml_accounts').select('id, nome').eq('ativo', true).order('nome');
    setMlAccounts(data || []);
    if (data?.length) setSelectedMl(data[0].id);
    setLoaded(true);
  };

  const addLog = (message: string, status: LogEntry['status'] = 'ok') => {
    setLogs(prev => [{
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      message,
      status,
    }, ...prev].slice(0, 50));
  };

  const runAction = async (action: typeof SYNC_ACTIONS[number]) => {
    if (running) return;
    loadAccounts();
    setRunning(action.id);
    addLog(`Iniciando: ${action.label}...`, 'running');

    try {
      const body = action.body || (action.bodyFn ? action.bodyFn(selectedMl) : {});
      let result;

      if (action.id === 'tiny-estoque') {
        let page = 1;
        let offset = 0;
        let hasMore = true;
        let sheetMode = 'write';
        
        while (hasMore) {
          addLog(`Processando página ${page} (offset ${offset}) do Tiny...`, 'running');
          result = await callEdgeFunction(action.fn, { ...body, page, offset, sheetMode });
          
          if (result.error) {
            addLog(`❌ ${action.label}: ${result.error}`, 'error');
            toast.error(result.error);
            break;
          } else {
             const msg = result.mensagem || `Página ${page} concluída`;
             addLog(`✅ ${msg}`, 'ok');
          }
          
          hasMore = result.hasMore === true;
          if (hasMore) {
            page = result.nextPage || page + 1;
            offset = result.nextOffset || 0;
            sheetMode = result.sheetMode || 'append';
          }
        }
        
        if (!result.error) toast.success('Estoque sincronizado por completo!');

      } else {
        result = await callEdgeFunction(action.fn, body);

        if (result.error) {
          addLog(`❌ ${action.label}: ${result.error}`, 'error');
          toast.error(result.error);
        } else if (result.log) {
          for (const line of result.log) {
            addLog(line, line.includes('❌') ? 'error' : 'ok');
          }
          toast.success('Ciclo completo executado!');
        } else {
          addLog(`✅ ${result.mensagem || 'Concluído com sucesso'}`, 'ok');
          toast.success(result.mensagem || 'Sucesso!');
        }
      }
    } catch (err: any) {
      addLog(`❌ Erro: ${err.message}`, 'error');
      toast.error(err.message);
    } finally {
      setRunning(null);
    }
  };

  if (!loaded) loadAccounts();

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-lg bg-primary/10">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Teste Manual</h2>
            <p className="text-sm text-muted-foreground">
              Execute ações do daily-sync manualmente para validar antes de ativar a automação.
            </p>
          </div>
        </div>
      </div>

      {mlAccounts.length > 0 && (
        <div className="mb-4 p-4 bg-card border border-border rounded-xl">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Conta ML para testes individuais</label>
          <select
            value={selectedMl}
            onChange={e => setSelectedMl(e.target.value)}
            className="mt-1 w-full text-sm px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {mlAccounts.map(a => (
              <option key={a.id} value={a.id}>{a.nome}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {SYNC_ACTIONS.map(action => {
          const isRunning = running === action.id;
          const needsAccountAndMissing = action.needsAccount === 'ml' && !selectedMl;

          return (
            <button
              key={action.id}
              onClick={() => runAction(action)}
              disabled={!!running || needsAccountAndMissing}
              className={`group relative text-left p-4 rounded-xl border border-border transition-all hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed ${action.color || 'bg-card'}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm text-foreground truncate">{action.label}</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{action.description}</p>
                </div>
                <div className="ml-3 flex-shrink-0">
                  {isRunning ? (
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  ) : (
                    <Play className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Log Console */}
      <div className="bg-[hsl(var(--vix-dark-bg,222,47%,8%))] border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" /> Console de Log
          </span>
          <button
            onClick={() => setLogs([])}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Limpar
          </button>
        </div>
        <div className="p-4 h-64 overflow-y-auto font-mono text-xs space-y-1.5">
          {logs.length === 0 && (
            <p className="text-muted-foreground/50 text-center py-8">
              Clique em alguma ação acima para iniciar...
            </p>
          )}
          {logs.map((entry, i) => (
            <div key={i} className="flex items-start gap-2">
              {entry.status === 'ok' && <CheckCircle className="w-3.5 h-3.5 text-[hsl(var(--vix-success))] mt-0.5 flex-shrink-0" />}
              {entry.status === 'error' && <XCircle className="w-3.5 h-3.5 text-[hsl(var(--vix-danger))] mt-0.5 flex-shrink-0" />}
              {entry.status === 'running' && <Loader2 className="w-3.5 h-3.5 text-primary animate-spin mt-0.5 flex-shrink-0" />}
              <span className="text-muted-foreground/60">[{entry.timestamp}]</span>
              <span className={entry.status === 'error' ? 'text-[hsl(var(--vix-danger))]' : 'text-foreground/90'}>
                {entry.message}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────
export function SyncTestPanel() {
  return (
    <div className="animate-fade-in max-w-4xl mx-auto">
      <Tabs defaultValue="automacao" className="space-y-6">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="automacao">
            <Settings2 className="w-4 h-4 mr-1.5" /> Automação
          </TabsTrigger>
          <TabsTrigger value="manual">
            <Zap className="w-4 h-4 mr-1.5" /> Teste Manual
          </TabsTrigger>
        </TabsList>

        <TabsContent value="automacao">
          <AutomationConfig />
        </TabsContent>

        <TabsContent value="manual">
          <ManualTestSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
