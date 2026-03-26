import { useState, useEffect, useCallback } from 'react';
import { MessageCircle, RefreshCw, Loader2, Clock, CheckCircle, Send, Search, Filter, User, ChevronDown } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Question {
  id: number;
  item_id: string;
  item_title: string;
  item_thumbnail: string;
  text: string;
  status: string;
  date_created: string;
  answer: { text: string; date_created: string } | null;
  from: { id: number; nickname: string };
  seller_id: number;
  conta: string;
}

type FilterTab = 'UNANSWERED' | 'ANSWERED' | 'ALL';

export function AtendimentoPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>('UNANSWERED');
  const [search, setSearch] = useState('');
  const [filterConta, setFilterConta] = useState('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchQuestions = useCallback(async (status: FilterTab = filterTab) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('mercado-livre', {
        body: { action: 'get_questions', status, limit: 50 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setQuestions(data?.questions || []);
    } catch (e: any) {
      console.error('Error fetching questions:', e);
      toast.error(e.message || 'Erro ao buscar perguntas');
    }
    setLoading(false);
  }, [filterTab]);

  useEffect(() => {
    fetchQuestions();
  }, []);

  const handleTabChange = (tab: FilterTab) => {
    setFilterTab(tab);
    fetchQuestions(tab);
  };

  const contas = [...new Set(questions.map(q => q.conta))].filter(Boolean);

  const filtered = questions.filter(q => {
    if (filterConta !== 'all' && q.conta !== filterConta) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        q.text.toLowerCase().includes(s) ||
        q.item_title.toLowerCase().includes(s) ||
        q.item_id.toLowerCase().includes(s) ||
        (q.answer?.text || '').toLowerCase().includes(s)
      );
    }
    return true;
  });

  const unansweredCount = questions.filter(q => q.status === 'UNANSWERED').length;
  const answeredCount = questions.filter(q => q.status === 'ANSWERED').length;

  const formatDate = (d: string) => {
    if (!d) return '-';
    const date = new Date(d);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);
    if (diffH < 1) return `${Math.floor(diffMs / 60000)}min atrás`;
    if (diffH < 24) return `${diffH}h atrás`;
    if (diffD < 7) return `${diffD}d atrás`;
    return date.toLocaleDateString('pt-BR');
  };

  return (
    <div>
      <PageHeader
        title="Atendimento"
        subtitle={`Perguntas e respostas do Mercado Livre · ${questions.length} perguntas`}
      />

      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button onClick={() => fetchQuestions()} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {loading ? 'Carregando...' : 'Atualizar'}
        </button>

        {/* Status tabs */}
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
          {([
            { id: 'UNANSWERED' as FilterTab, label: 'Pendentes', count: unansweredCount, color: 'text-amber-400' },
            { id: 'ANSWERED' as FilterTab, label: 'Respondidas', count: answeredCount, color: 'text-emerald-400' },
            { id: 'ALL' as FilterTab, label: 'Todas', count: questions.length, color: 'text-muted-foreground' },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filterTab === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {t.label} <span className={`ml-1 ${filterTab === t.id ? '' : t.color}`}>({t.count})</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar pergunta, produto..."
            className="pl-8 pr-3 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs outline-none w-64"
          />
        </div>

        {/* Account filter */}
        {contas.length > 1 && (
          <select
            value={filterConta}
            onChange={e => setFilterConta(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs outline-none"
          >
            <option value="all">Todas Contas</option>
            {contas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-amber-400">{unansweredCount}</p>
          <p className="text-xs text-muted-foreground">Pendentes</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{answeredCount}</p>
          <p className="text-xs text-muted-foreground">Respondidas</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{filtered.length}</p>
          <p className="text-xs text-muted-foreground">Exibindo</p>
        </div>
      </div>

      {/* Questions List */}
      {loading && questions.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Buscando perguntas de todas as contas...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <MessageCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-foreground font-medium">Nenhuma pergunta encontrada</p>
          <p className="text-sm text-muted-foreground mt-1">
            {filterTab === 'UNANSWERED' ? 'Sem perguntas pendentes! 🎉' : 'Tente mudar os filtros.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(q => (
            <div
              key={q.id}
              className={`bg-card border rounded-xl overflow-hidden transition-all ${
                q.status === 'UNANSWERED' ? 'border-amber-500/30' : 'border-border'
              }`}
            >
              {/* Question header */}
              <div
                className="flex items-start gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
              >
                {q.item_thumbnail && (
                  <img src={q.item_thumbnail} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      q.status === 'UNANSWERED' ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                    }`}>
                      {q.status === 'UNANSWERED' ? '⏳ Pendente' : '✅ Respondida'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{q.conta}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {formatDate(q.date_created)}
                    </span>
                  </div>
                  <p className="text-sm text-foreground font-medium">{q.text}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 truncate">{q.item_title} · {q.item_id}</p>
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 mt-2 ${expandedId === q.id ? 'rotate-180' : ''}`} />
              </div>

              {/* Expanded: Answer */}
              {expandedId === q.id && (
                <div className="px-4 pb-4 border-t border-border/50">
                  {q.answer ? (
                    <div className="mt-3 bg-emerald-500/5 rounded-lg p-3 border-l-2 border-emerald-500">
                      <div className="flex items-center gap-2 mb-1">
                        <Send className="w-3 h-3 text-emerald-400" />
                        <span className="text-[10px] text-emerald-400 font-semibold">Resposta</span>
                        <span className="text-[10px] text-muted-foreground">{formatDate(q.answer.date_created)}</span>
                      </div>
                      <p className="text-sm text-foreground">{q.answer.text}</p>
                    </div>
                  ) : (
                    <div className="mt-3 bg-amber-500/5 rounded-lg p-3 text-center">
                      <p className="text-xs text-amber-400">Aguardando resposta</p>
                      <a
                        href={`https://www.mercadolivre.com.br/perguntas/${q.id}`}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1 mt-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
                      >
                        <Send className="w-3 h-3" /> Responder no ML
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
