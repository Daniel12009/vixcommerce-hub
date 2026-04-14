import { useState, useEffect, useCallback } from 'react';
import {
  MessageCircle, RefreshCw, Loader2, Clock, Send, Search, ChevronDown,
  Bot, LayoutTemplate, Sparkles, Plus, X, Pencil, Trash2, CheckCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useMLQuestions } from '@/hooks/useMLQuestions';
import { useMLBotMode } from '@/hooks/useMLBotMode';
import { useMLAnalysis } from '@/hooks/useMLAnalysis';
import { BotModeBanner } from '@/components/ml/BotModeBanner';
import { MLQuestionsQueue } from '@/components/ml/MLQuestionsQueue';
import { CompetitorItemsManager } from '@/components/ml/CompetitorItemsManager';

// ─── Types ────────────────────────────────────────────────────────────
interface Question {
  id: number; item_id: string; item_title: string; item_thumbnail: string;
  text: string; status: string; date_created: string;
  answer: { text: string; date_created: string } | null;
  from: { id: number; nickname: string }; seller_id: number; conta: string;
  account_id?: string;
}
interface Template {
  id: string; title: string; keywords: string[]; answer_text: string;
  active: boolean; use_count: number; last_used_at: string | null;
}
type MainTab = 'fila' | 'templates' | 'ia';
type FilterTab = 'UNANSWERED' | 'ANSWERED' | 'ALL';

// ─── AtendimentoPage ──────────────────────────────────────────────────
export function AtendimentoPage() {
  const [mainTab, setMainTab] = useState<MainTab>('fila');

  // ML accounts for seller selection
  const [mlAccounts, setMlAccounts] = useState<any[]>([]);
  const [selectedSeller, setSelectedSeller] = useState('');

  useEffect(() => {
    supabase.from('ml_accounts').select('id, nome, seller_id').eq('ativo', true).order('nome')
      .then(({ data }) => {
        setMlAccounts(data ?? []);
        if (data && data.length > 0) setSelectedSeller(String(data[0].seller_id || data[0].id));
      });
  }, []);

  return (
    <div>
      <PageHeader title="Atendimento" subtitle="Perguntas e respostas do Mercado Livre" />

      {/* Account selector + Tab nav */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {mlAccounts.length > 1 && (
          <select
            value={selectedSeller}
            onChange={e => setSelectedSeller(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs outline-none"
          >
            {mlAccounts.map(a => (
              <option key={a.id} value={String(a.seller_id || a.id)}>{a.nome}</option>
            ))}
          </select>
        )}
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1 ml-auto">
          {([
            { id: 'fila' as MainTab, label: 'Fila', icon: MessageCircle },
            { id: 'templates' as MainTab, label: 'Templates', icon: LayoutTemplate },
            { id: 'ia' as MainTab, label: 'IA de Treinamento', icon: Sparkles },
          ]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setMainTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mainTab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {mainTab === 'fila' && <FilaTab
        sellerId={selectedSeller}
        accountId={mlAccounts.find(a => String(a.seller_id || a.id) === selectedSeller)?.id}
        sellerName={mlAccounts.find(a => String(a.seller_id || a.id) === selectedSeller)?.nome}
      />}
      {mainTab === 'templates' && <TemplatesTab sellerId={selectedSeller} />}
      {mainTab === 'ia' && <IATab sellerId={selectedSeller} />}
    </div>
  );
}

// ─── Aba Fila ─────────────────────────────────────────────────────────
function FilaTab({ sellerId, accountId, sellerName }: { sellerId: string; accountId?: string; sellerName?: string }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>('UNANSWERED');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [forcingRobot, setForcingRobot] = useState(false);
  const [answerTexts, setAnswerTexts] = useState<Record<number, string>>({});
  const [sendingAnswers, setSendingAnswers] = useState<Record<number, boolean>>({});

  const handleGeneralAnswer = async (q: Question) => {
    const text = answerTexts[q.id]?.trim();
    if (!text) return;
    setSendingAnswers(p => ({ ...p, [q.id]: true }));
    try {
      const { data, error } = await supabase.functions.invoke('mercado-livre', {
        body: { action: 'answer_question', question_id: q.id, text, account_id: q.account_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      toast.success('Resposta enviada! ✓');
      setQuestions(prev => prev.map(x => x.id === q.id ? { ...x, status: 'ANSWERED', answer: { text, date_created: new Date().toISOString() } } as Question : x));
    } catch (e: any) {
      toast.error(e.message || 'Erro ao enviar resposta');
    }
    setSendingAnswers(p => ({ ...p, [q.id]: false }));
  };

  const { pending, loading: queueLoading, answer, ignore, saveAsTemplate, refetchQueue } = useMLQuestions(sellerId);

  const forceRobot = async () => {
    setForcingRobot(true);
    try {
      await supabase.functions.invoke('ml-fetch-questions');
      await supabase.functions.invoke('ml-auto-answer');
      toast.success('Robô executado e filas atualizadas!');
      await fetchQuestions();
      refetchQueue();
    } catch (e: any) {
      toast.error('Erro ao forçar o robô: ' + (e.message || e));
    }
    setForcingRobot(false);
  };

  const { config, loading: botLoading, setMode, incrementManual } = useMLBotMode(sellerId);
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    if (sellerId) (supabase.from('ml_answer_templates' as any).select('id') as any).eq('seller_id', sellerId).eq('active', true)
      .then(({ data }: any) => setTemplates((data as any[]) ?? []));
  }, [sellerId]);

  const fetchQuestions = useCallback(async (status: FilterTab = filterTab) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('mercado-livre', {
        body: { action: 'get_questions', status, limit: 50, account_id: accountId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setQuestions(data?.questions || []);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao buscar perguntas');
    }
    setLoading(false);
  }, [filterTab, accountId]);

  useEffect(() => { if (accountId) fetchQuestions(); }, [accountId]);

  const filtered = questions.filter(q => {
    if (search) {
      const s = search.toLowerCase();
      if (!q.text.toLowerCase().includes(s) && !q.item_title?.toLowerCase().includes(s) && !q.item_id.toLowerCase().includes(s)) return false;
    }
    if (filterTab !== 'ALL' && q.status !== filterTab) return false;
    
    // Ocultar perguntas pendentes com mais de 7 dias
    if (q.status === 'UNANSWERED') {
      const qDate = new Date(q.date_created);
      if (Date.now() - qDate.getTime() > 7 * 24 * 60 * 60 * 1000) {
        return false;
      }
    }
    
    return true;
  });

  const unansweredCount = questions.filter(q => q.status === 'UNANSWERED').length;
  const answeredCount = questions.filter(q => q.status === 'ANSWERED').length;

  const formatDate = (d: string) => {
    if (!d) return '-';
    const diffMs = Date.now() - new Date(d).getTime();
    const h = Math.floor(diffMs / 3600000);
    const day = Math.floor(diffMs / 86400000);
    if (h < 1) return `${Math.floor(diffMs / 60000)}min atrás`;
    if (h < 24) return `${h}h atrás`;
    if (day < 7) return `${day}d atrás`;
    return new Date(d).toLocaleDateString('pt-BR');
  };

  return (
    <div>
      {/* Bot Banner */}
      {!botLoading && sellerId && (
        <BotModeBanner
          config={config}
          templatesCount={templates.length}
          onActivate={(score) => setMode('active', score)}
          onPause={() => setMode('learning')}
        />
      )}

      {/* Bot Queue (manual pending) */}
      {sellerId && !queueLoading && pending.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            Fila do robô — {pending.length} pergunta{pending.length !== 1 ? 's' : ''} aguardando
          </h3>
          <MLQuestionsQueue
            sellerId={sellerId}
            sellerName={sellerName}
            items={pending}
            botMode={config.mode}
            onAnswer={answer}
            onIgnore={ignore}
            onSaveTemplate={saveAsTemplate}
            onIncrementManual={incrementManual}
          />
          <div className="border-t border-border my-6" />
        </div>
      )}

      {/* Standard question list */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button onClick={() => fetchQuestions()} disabled={loading || forcingRobot} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-colors">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {loading ? 'Carregando...' : 'Atualizar'}
        </button>
        <button onClick={forceRobot} disabled={forcingRobot || loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
          {forcingRobot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
          {forcingRobot ? 'Rodando...' : 'Forçar Robô Agora'}
        </button>
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
          {([
            { id: 'UNANSWERED' as FilterTab, label: 'Pendentes', count: unansweredCount },
            { id: 'ANSWERED' as FilterTab, label: 'Respondidas', count: answeredCount },
            { id: 'ALL' as FilterTab, label: 'Todas', count: questions.length },
          ]).map(t => (
            <button key={t.id} onClick={() => { setFilterTab(t.id); fetchQuestions(t.id); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterTab === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
            className="pl-8 pr-3 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs outline-none w-56" />
        </div>
      </div>

      {loading && questions.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
          <span className="ml-3 text-sm text-muted-foreground">Buscando perguntas...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <MessageCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium text-foreground">Nenhuma pergunta encontrada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(q => (
            <div key={q.id} className={`bg-card border rounded-xl overflow-hidden ${q.status === 'UNANSWERED' ? 'border-amber-500/30' : 'border-border'}`}>
              <div className="flex items-start gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}>
                {q.item_thumbnail && <img src={q.item_thumbnail} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${q.status === 'UNANSWERED' ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
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
                    <div className="mt-3 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                      <textarea
                        value={answerTexts[q.id] || ''}
                        onChange={e => setAnswerTexts({ ...answerTexts, [q.id]: e.target.value })}
                        maxLength={2000}
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/40 mb-2"
                        placeholder="Digite sua resposta..."
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground ml-1">
                          {(answerTexts[q.id] || '').length}/2000
                        </span>
                        <div className="flex gap-2">
                          <a href={`https://www.mercadolivre.com.br/perguntas/${q.id}`} target="_blank" rel="noopener"
                             className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
                            Abrir no ML ↗
                          </a>
                          <button
                            onClick={() => handleGeneralAnswer(q)}
                            disabled={sendingAnswers[q.id] || !(answerTexts[q.id] || '').trim()}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
                          >
                            <Send className="w-3.5 h-3.5" />
                            {sendingAnswers[q.id] ? 'Enviando...' : 'Responder'}
                          </button>
                        </div>
                      </div>
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

// ─── Aba Templates ────────────────────────────────────────────────────
function TemplatesTab({ sellerId }: { sellerId: string }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [showNew, setShowNew] = useState(false);

  const [form, setForm] = useState({ title: '', keywords: [] as string[], answer_text: '', kw: '' });

  useEffect(() => {
    loadTemplates();
  }, [sellerId]);

  const loadTemplates = async () => {
    setLoading(true);
    const { data } = await (supabase.from('ml_answer_templates' as any).select('*') as any)
      .eq('seller_id', sellerId).order('use_count', { ascending: false });
    setTemplates((data as Template[]) ?? []);
    setLoading(false);
  };

  const resetForm = () => setForm({ title: '', keywords: [], answer_text: '', kw: '' });

  const addKeyword = () => {
    const kw = form.kw.trim().toLowerCase();
    if (kw && !form.keywords.includes(kw)) setForm(prev => ({ ...prev, keywords: [...prev.keywords, kw], kw: '' }));
    else setForm(prev => ({ ...prev, kw: '' }));
  };

  const removeKeyword = (kw: string) => setForm(prev => ({ ...prev, keywords: prev.keywords.filter(k => k !== kw) }));

  const saveTemplate = async () => {
    if (!form.title || !form.answer_text || form.keywords.length === 0) {
      toast.error('Preencha título, resposta e ao menos 1 keyword.');
      return;
    }
    if (form.answer_text.length > 2000) {
      toast.error('Resposta excede 2000 caracteres.');
      return;
    }
    if (editing) {
      await (supabase.from('ml_answer_templates' as any) as any).update({
        title: form.title, keywords: form.keywords, answer_text: form.answer_text, updated_at: new Date().toISOString(),
      }).eq('id', editing.id);
      toast.success('Template atualizado!');
    } else {
      await (supabase.from('ml_answer_templates' as any) as any).insert({
        seller_id: sellerId, title: form.title, keywords: form.keywords, answer_text: form.answer_text, active: true,
      });
      toast.success('Template criado!');
    }
    resetForm();
    setEditing(null);
    setShowNew(false);
    loadTemplates();
  };

  const toggleActive = async (t: Template) => {
    await (supabase.from('ml_answer_templates' as any) as any).update({ active: !t.active }).eq('id', t.id);
    setTemplates(prev => prev.map(x => x.id === t.id ? { ...x, active: !x.active } : x));
  };

  const deleteTemplate = async (id: string) => {
    if (!window.confirm('Excluir este template?')) return;
    await (supabase.from('ml_answer_templates' as any) as any).delete().eq('id', id);
    setTemplates(prev => prev.filter(x => x.id !== id));
    toast.success('Template excluído.');
  };

  const startEdit = (t: Template) => {
    setEditing(t);
    setShowNew(true);
    setForm({ title: t.title, keywords: t.keywords, answer_text: t.answer_text, kw: '' });
  };

  const isFormOpen = showNew || editing;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Templates de resposta</h3>
          <p className="text-xs text-muted-foreground">{templates.length} templates · {templates.filter(t => t.active).length} ativos</p>
        </div>
        {!isFormOpen && (
          <button onClick={() => { resetForm(); setEditing(null); setShowNew(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90">
            <Plus className="w-3.5 h-3.5" /> Novo template
          </button>
        )}
      </div>

      {/* Form */}
      {isFormOpen && (
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <h4 className="text-sm font-medium text-foreground mb-4">{editing ? 'Editar template' : 'Novo template'}</h4>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Título</label>
              <input value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Ex: Dúvida sobre instalação" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Keywords (Enter para adicionar)</label>
              <div className="flex gap-2 mb-2">
                <input value={form.kw} onChange={e => setForm(prev => ({ ...prev, kw: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="instalação, prazo, garantia..." />
                <button onClick={addKeyword} className="px-3 py-1.5 rounded-lg bg-muted text-xs text-foreground hover:bg-muted/80">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {form.keywords.map(kw => (
                  <span key={kw} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] font-medium">
                    {kw}
                    <button onClick={() => removeKeyword(kw)}><X className="w-2.5 h-2.5" /></button>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 flex justify-between">
                <span>Resposta</span>
                <span className={form.answer_text.length > 1900 ? 'text-red-400' : ''}>{form.answer_text.length}/2000</span>
              </label>
              <textarea value={form.answer_text} onChange={e => setForm(prev => ({ ...prev, answer_text: e.target.value }))}
                maxLength={2000} rows={4}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Texto da resposta automática..." />
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <button onClick={() => { setShowNew(false); setEditing(null); resetForm(); }}
              className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted">Cancelar</button>
            <button onClick={saveTemplate}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90">
              <CheckCircle className="w-3.5 h-3.5" /> {editing ? 'Salvar alterações' : 'Criar template'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : templates.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <LayoutTemplate className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-sm text-muted-foreground">Nenhum template ainda. Crie o primeiro!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <div key={t.id} className={`bg-card border rounded-xl p-4 ${t.active ? 'border-border' : 'border-border/40 opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{t.title}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${t.active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
                      {t.active ? 'Ativo' : 'Inativo'}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{t.use_count} usos</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{t.answer_text}</p>
                  <div className="flex flex-wrap gap-1">
                    {t.keywords.map(kw => (
                      <span key={kw} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">{kw}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => toggleActive(t)} className="p-1.5 rounded hover:bg-muted transition-colors" title={t.active ? 'Desativar' : 'Ativar'}>
                    <Power className={`w-3.5 h-3.5 ${t.active ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                  </button>
                  <button onClick={() => startEdit(t)} className="p-1.5 rounded hover:bg-muted transition-colors">
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => deleteTemplate(t.id)} className="p-1.5 rounded hover:bg-red-500/10 transition-colors">
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Need Power icon - add to imports
function Power(props: React.ComponentProps<'svg'>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18.36 6.64A9 9 0 1 1 5.64 6.64" /><line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  );
}

// ─── Aba IA de Treinamento ────────────────────────────────────────────
function IATab({ sellerId }: { sellerId: string }) {
  const [includeOwn, setIncludeOwn] = useState(true);
  const [competitorItems, setCompetitorItems] = useState<any[]>([]);
  const [selectedCompetitors, setSelectedCompetitors] = useState<Set<string>>(new Set());
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [acceptedIndices, setAcceptedIndices] = useState<Set<number>>(new Set());

  const { analyze, loading, progress, progressText, suggestions, ignoredIndices, acceptSuggestion, acceptAll, ignoreSuggestion } = useMLAnalysis(sellerId);

  // Load competitors for source selection
  useEffect(() => {
    (supabase.from('ml_competitor_items' as any).select('*') as any).eq('seller_id', sellerId).eq('active', true)
      .then(({ data }: any) => setCompetitorItems(data ?? []));
  }, [sellerId]);

  const handleAnalyze = () => {
    const ids = [...selectedCompetitors];
    if (!includeOwn && ids.length === 0) {
      toast.error('Selecione ao menos uma fonte de perguntas.');
      return;
    }
    analyze(includeOwn, ids);
  };

  const toggleCompetitor = (itemId: string) => {
    setSelectedCompetitors(prev => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
  };

  const handleAccept = async (s: typeof suggestions[0], idx: number) => {
    await acceptSuggestion(s);
    setAcceptedIndices(prev => new Set([...prev, idx]));
    toast.success(`Template "${s.theme}" salvo!`);
  };

  const handleAcceptAll = async () => {
    const n = await acceptAll();
    toast.success(`${n} templates salvos!`);
    setAcceptedIndices(new Set(suggestions.map((_, i) => i)));
  };

  const priorityColors = {
    alta: 'bg-red-500/10 text-red-400',
    media: 'bg-amber-500/10 text-amber-400',
    baixa: 'bg-muted text-muted-foreground',
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-1">IA de Treinamento</h3>
      <p className="text-xs text-muted-foreground mb-6">
        Analise suas perguntas e as de concorrentes para descobrir os temas mais frequentes e gerar templates automáticos.
      </p>

      {/* Competitor Manager */}
      <CompetitorItemsManager sellerId={sellerId} />

      {/* Source selection */}
      <div className="bg-card border border-border rounded-xl p-4 mb-4">
        <p className="text-sm font-medium text-foreground mb-3">Fontes de análise</p>
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer group">
            <input type="checkbox" checked={includeOwn} onChange={e => setIncludeOwn(e.target.checked)}
              className="w-4 h-4 rounded accent-primary" />
            <div>
              <span className="text-sm text-foreground font-medium">Minhas perguntas (90 dias)</span>
              <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">Própria</span>
            </div>
          </label>
          {competitorItems.map(item => (
            <label key={item.id} className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={selectedCompetitors.has(item.item_id)}
                onChange={() => toggleCompetitor(item.item_id)} className="w-4 h-4 rounded accent-primary" />
              <div>
                <span className="text-sm text-foreground">{item.label}</span>
                <span className="ml-2 text-[10px] font-mono text-muted-foreground">{item.item_id}</span>
                <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">Concorrente</span>
              </div>
            </label>
          ))}
          {competitorItems.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Adicione concorrentes acima para incluir na análise.</p>
          )}
        </div>
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? 'Analisando...' : 'Analisar e gerar sugestões de templates'}
        </button>
      </div>

      {/* Progress */}
      {loading && (
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <p className="text-xs text-muted-foreground mb-2">{progressText}</p>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div className="bg-primary h-1.5 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 text-right">{progress}%</p>
        </div>
      )}

      {!loading && progressText && suggestions.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <p className="text-sm font-medium text-foreground mb-1">Resultado da análise</p>
          <p className="text-xs text-muted-foreground">{progressText}</p>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && !loading && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-foreground">{suggestions.length} temas identificados</p>
            <button onClick={handleAcceptAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 text-xs font-medium hover:bg-emerald-500/20">
              <CheckCircle className="w-3.5 h-3.5" />
              Aceitar todos
            </button>
          </div>
          <div className="space-y-3">
            {suggestions.map((s, idx) => {
              const isIgnored = ignoredIndices.has(idx);
              const isAccepted = acceptedIndices.has(idx);
              if (isIgnored) return null;
              return (
                <div key={idx} className={`bg-card border rounded-xl p-4 ${isAccepted ? 'border-emerald-500/30 opacity-60' : 'border-border'}`}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold text-foreground">{s.theme}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${priorityColors[s.priority as keyof typeof priorityColors]}`}>
                          {s.priority}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">~{s.frequency} perguntas detectadas</p>
                    </div>
                    {isAccepted && <span className="text-[10px] text-emerald-500 font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" />Salvo</span>}
                  </div>

                  {/* Examples */}
                  <div className="mb-3">
                    {(s.example_questions ?? []).map((eq: string, i: number) => (
                      <p key={i} className="text-xs text-muted-foreground italic mb-1">"{eq}"</p>
                    ))}
                  </div>

                  {/* Keywords */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {s.keywords.map((kw: string) => (
                      <span key={kw} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">{kw}</span>
                    ))}
                  </div>

                  {/* Answer */}
                  {editingIdx === idx ? (
                    <div className="mb-3">
                      <textarea value={editText} onChange={e => setEditText(e.target.value)} maxLength={2000} rows={3}
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/40" />
                      <p className="text-[10px] text-muted-foreground text-right">{editText.length}/2000</p>
                    </div>
                  ) : (
                    <p className="text-xs text-foreground bg-muted/30 rounded-lg p-3 mb-3">{s.suggested_answer}</p>
                  )}

                  {!isAccepted && (
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => ignoreSuggestion(idx)}
                        className="px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors">
                        Ignorar
                      </button>
                      {editingIdx === idx ? (
                        <button onClick={async () => {
                          await handleAccept({ ...s, suggested_answer: editText }, idx);
                          setEditingIdx(null);
                        }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 text-xs font-medium hover:bg-emerald-500/20">
                          <CheckCircle className="w-3.5 h-3.5" /> Salvar editado
                        </button>
                      ) : (
                        <>
                          <button onClick={() => { setEditingIdx(idx); setEditText(s.suggested_answer); }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted text-xs text-foreground hover:bg-muted/80">
                            <Pencil className="w-3.5 h-3.5" /> Editar antes
                          </button>
                          <button onClick={() => handleAccept(s, idx)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 text-xs font-medium hover:bg-emerald-500/20">
                            <CheckCircle className="w-3.5 h-3.5" /> Aceitar e salvar
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
