import { useState } from 'react';
import { Send, X, BookmarkPlus, Clock, MessageSquare } from 'lucide-react';
import type { QueueItem } from '@/hooks/useMLQuestions';
import { toast } from 'sonner';

interface Props {
  sellerId: string;
  items: QueueItem[];
  botMode: 'learning' | 'active';
  onAnswer: (id: string, text: string) => Promise<any>;
  onIgnore: (id: string) => Promise<void>;
  onSaveTemplate: (sellerId: string, item: QueueItem, text: string) => Promise<void>;
  onIncrementManual: () => void;
}

function QueueCard({
  item,
  sellerId,
  botMode,
  minScore,
  onAnswer,
  onIgnore,
  onSaveTemplate,
  onIncrementManual,
}: {
  item: QueueItem;
  sellerId: string;
  botMode: 'learning' | 'active';
  minScore: number;
  onAnswer: (id: string, text: string) => Promise<any>;
  onIgnore: (id: string) => Promise<void>;
  onSaveTemplate: (sellerId: string, item: QueueItem, text: string) => Promise<void>;
  onIncrementManual: () => void;
}) {
  const [text, setText] = useState(item.suggested_answer ?? '');
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);

  const scorePercent = item.match_score !== null ? Math.round((item.match_score ?? 0) * 100) : null;
  const wouldAutoAnswer = scorePercent !== null && scorePercent >= Math.round(minScore * 100);

  const formatAge = (dateStr: string) => {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const h = Math.floor(diffMs / 3600000);
    const d = Math.floor(diffMs / 86400000);
    if (h < 1) return `${Math.floor(diffMs / 60000)}min atrás`;
    if (h < 24) return `${h}h atrás`;
    return `${d}d atrás`;
  };

  const handleAnswer = async () => {
    if (!text.trim()) return;
    setSending(true);
    const err = await onAnswer(item.id, text.trim());
    if (err) {
      toast.error(`Erro ao responder: ${err.message}`);
    } else {
      onIncrementManual();
      toast.success('Resposta enviada! ✓');
    }
    setSending(false);
  };

  const handleSaveTemplate = async () => {
    if (!text.trim()) return;
    setSaving(true);
    await onSaveTemplate(sellerId, item, text.trim());
    toast.success('Template salvo!');
    setSaving(false);
  };

  return (
    <div className={`bg-card border rounded-xl overflow-hidden ${
      botMode === 'learning' && wouldAutoAnswer
        ? 'border-purple-500/30'
        : 'border-border'
    }`}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[10px] text-muted-foreground font-mono">{item.item_id}</span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatAge(item.date_created)}
          </span>
          {scorePercent !== null && (
            <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium ${
              wouldAutoAnswer
                ? 'bg-purple-500/10 text-purple-400'
                : 'bg-muted text-muted-foreground'
            }`}>
              {botMode === 'learning' && wouldAutoAnswer ? '🤖 Robô responderia · ' : ''}
              Score {scorePercent}%
            </span>
          )}
          {!scorePercent && (
            <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium">
              Sem match · sugestão de IA
            </span>
          )}
        </div>

        {/* Pergunta */}
        <p className="text-sm text-foreground leading-relaxed mb-4">{item.question_text}</p>

        {/* Textarea */}
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={2000}
          rows={3}
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground resize-vertical focus:outline-none focus:ring-2 focus:ring-primary/40 mb-2"
          placeholder="Digite ou edite a resposta..."
        />

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`text-[10px] ${text.length > 1900 ? 'text-red-400' : 'text-muted-foreground'}`}>
              {text.length}/2000
            </span>
            {text.trim() && (
              <button
                onClick={handleSaveTemplate}
                disabled={saving}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                title="Salvar como template"
              >
                <BookmarkPlus className="w-3 h-3" />
                {saving ? 'Salvando...' : 'Salvar como template'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onIgnore(item.id)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Ignorar
            </button>
            <button
              onClick={handleAnswer}
              disabled={sending || !text.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <Send className="w-3.5 h-3.5" />
              {sending ? 'Enviando...' : 'Responder ↗'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MLQuestionsQueue({
  sellerId,
  items,
  botMode,
  onAnswer,
  onIgnore,
  onSaveTemplate,
  onIncrementManual,
}: Props) {
  const minScore = 0.70; // from bot config ideally, passed down

  if (items.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-10 text-center">
        <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium text-foreground">
          {botMode === 'active'
            ? 'Fila vazia — o robô está respondendo automaticamente! 🤖'
            : 'Nenhuma pergunta pendente — o robô está em dia! 🎉'
          }
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Novas perguntas aparecem aqui conforme chegam.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-foreground">
          {items.length} pergunta{items.length !== 1 ? 's' : ''} aguardando resposta
        </p>
        {botMode === 'active' && (
          <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-500 font-medium">
            🤖 Robô respondendo automaticamente acima do threshold
          </span>
        )}
      </div>
      {items.map(item => (
        <QueueCard
          key={item.id}
          item={item}
          sellerId={sellerId}
          botMode={botMode}
          minScore={minScore}
          onAnswer={onAnswer}
          onIgnore={onIgnore}
          onSaveTemplate={onSaveTemplate}
          onIncrementManual={onIncrementManual}
        />
      ))}
    </div>
  );
}
