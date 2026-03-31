import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, RefreshCw, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  action?: any;
}

interface Props {
  knapsack: any;
  demandas: any[];
  metricas: any[];
  cbmLimit: number;
  daysHorizon: number;
  onRerun: (params: any) => void;
}

const QUICK_ACTIONS = [
  { label: '🚨 Só críticos', msg: 'Cria um pedido apenas com os SKUs críticos (risco de ruptura)' },
  { label: '💰 Mais rentável', msg: 'Monte o pedido focado nos SKUs com maior lucro por CBM' },
  { label: '🛡️ Conservador', msg: 'Cria um pedido conservador com 80% do container (55 CBM)' },
  { label: '📦 Container cheio', msg: 'Garante que o container fique entre 95% e 100% (65-69 CBM)' },
  { label: '📅 Bimestral', msg: 'Monte um pedido para 60 dias de estoque' },
  { label: '🚫 Sem lançamentos', msg: 'Cria pedido excluindo todos os SKUs de lançamento (ABC=L)' },
];

export function SopChat({ knapsack, demandas, metricas, cbmLimit, daysHorizon, onRerun }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const knapsackContext = {
    cbm_utilizado: knapsack?.cbm_utilizado,
    pct_utilizacao: knapsack?.pct_utilizacao,
    total_skus: knapsack?.alocacao?.length,
    top_skus: knapsack?.alocacao?.slice(0, 10).map((a: any) => {
      const m = metricas.find((x: any) => x.sku === a.sku);
      const d = demandas.find((x: any) => x.sku === a.sku);
      return {
        sku: a.sku,
        qty: a.qty_total,
        cbm: a.cbm_total,
        fase: a.fase,
        lucro_cbm: m?.lucro_cbm || 0,
        status: d?.status || 'ok',
        tendencia: d?.tendencia || 'estavel',
      };
    }),
    criticos: demandas.filter((d: any) => d.status === 'critico').map((d: any) => d.sku),
    excluidos_espaco: knapsack?.excluidos_espaco?.slice(0, 10),
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const history = messages.map(m => ({ role: m.role, content: m.content }));

      const { data, error } = await supabase.functions.invoke('sop-chat', {
        body: { message: text, history, knapsack_context: knapsackContext, cbm_limit: cbmLimit, days_horizon: daysHorizon },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const assistantMsg: Message = {
        role: 'assistant',
        content: data.answer,
        action: data.action,
      };
      setMessages(prev => [...prev, assistantMsg]);

      if (data.action?.action === 'rerun_knapsack') {
        toast.info('Gerando novo pedido com os parâmetros ajustados...');
        onRerun(data.action.params);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ Erro: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="mt-6 border border-border rounded-xl overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
        <div className="p-1.5 rounded-lg bg-indigo-500/10">
          <MessageSquare className="w-4 h-4 text-indigo-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Assistente de Compras</p>
          <p className="text-[11px] text-muted-foreground">
            Peça um novo pedido ou ajuste o atual em linguagem natural
          </p>
        </div>
        <div className="ml-auto text-[10px] text-muted-foreground bg-muted/50 rounded-full px-2.5 py-1 border border-border">
          {knapsack?.alocacao?.length || 0} SKUs · {knapsack?.cbm_utilizado || 0}/{cbmLimit} CBM
        </div>
      </div>

      {/* Quick actions (only when no messages) */}
      {messages.length === 0 && (
        <div className="px-5 py-4 border-b border-border">
          <p className="text-[11px] text-muted-foreground mb-3 font-medium uppercase tracking-wide">
            Variações rápidas
          </p>
          <div className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.map(qa => (
              <button
                key={qa.label}
                onClick={() => sendMessage(qa.msg)}
                disabled={loading}
                className="px-3 py-1.5 text-xs rounded-full border border-border bg-background hover:bg-indigo-500/10 hover:border-indigo-400/50 hover:text-indigo-400 transition-all text-foreground disabled:opacity-50"
              >
                {qa.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {messages.length > 0 && (
        <div className="max-h-96 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] rounded-xl px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-muted/50 border border-border text-foreground'
              }`}>
                {msg.role === 'assistant' ? (
                  <>
                    <div className="prose prose-sm max-w-none dark:prose-invert
                      prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-li:my-0
                      [&_table]:text-xs [&_th]:p-1.5 [&_td]:p-1.5
                      [&_pre]:hidden [&_code]:text-xs">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content.replace(/```json[\s\S]*?```/gi, '')}
                      </ReactMarkdown>
                    </div>
                    {msg.action && (
                      <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-2">
                        <RefreshCw className="w-3 h-3 text-emerald-400" />
                        <span className="text-[11px] text-emerald-400 font-medium">
                          Novo pedido gerado automaticamente ↑
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted/50 border border-border rounded-xl px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                <span className="text-xs text-muted-foreground">Analisando pedido...</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-border flex gap-2 items-end bg-background/50">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ex: Cria um pedido conservador sem lançamentos, com foco nos críticos..."
          rows={1}
          disabled={loading}
          className="flex-1 resize-none bg-background border border-input rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50 max-h-24"
          style={{ minHeight: '38px' }}
          onInput={(e) => {
            const t = e.target as HTMLTextAreaElement;
            t.style.height = 'auto';
            t.style.height = Math.min(t.scrollHeight, 96) + 'px';
          }}
        />
        <Button
          size="sm"
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white h-9 px-3 flex-shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
