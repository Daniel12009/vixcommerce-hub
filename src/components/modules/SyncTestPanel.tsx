import { useState } from 'react';
import { Play, Loader2, CheckCircle, XCircle, Clock, Zap, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
];

export function SyncTestPanel() {
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
      const result = await callEdgeFunction(action.fn, body);

      if (result.error) {
        addLog(`❌ ${action.label}: ${result.error}`, 'error');
        toast.error(result.error);
      } else if (result.log) {
        // daily-sync returns a log array
        for (const line of result.log) {
          addLog(line, line.includes('❌') ? 'error' : 'ok');
        }
        toast.success('Ciclo completo executado!');
      } else {
        addLog(`✅ ${result.mensagem || 'Concluído com sucesso'}`, 'ok');
        toast.success(result.mensagem || 'Sucesso!');
      }
    } catch (err: any) {
      addLog(`❌ Erro: ${err.message}`, 'error');
      toast.error(err.message);
    } finally {
      setRunning(null);
    }
  };

  // Load accounts on first render
  if (!loaded) loadAccounts();

  return (
    <div className="animate-fade-in max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-lg bg-primary/10">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Teste de Sincronização</h2>
            <p className="text-sm text-muted-foreground">
              Execute ações do daily-sync manualmente para validar antes de ativar o pg_cron.
            </p>
          </div>
        </div>
      </div>

      {/* ML Account Selector */}
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

      {/* Action Buttons */}
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
