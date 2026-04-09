import { useState } from 'react';
import { Power, Zap, BookOpen, Sliders } from 'lucide-react';
import type { BotConfig } from '@/hooks/useMLBotMode';

interface Props {
  config: BotConfig;
  templatesCount: number;
  onActivate: (minScore: number) => Promise<any>;
  onPause: () => Promise<any>;
}

export function BotModeBanner({ config, templatesCount, onActivate, onPause }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [threshold, setThreshold] = useState(Math.round(config.min_score * 100));
  const [busy, setBusy] = useState(false);

  const isActive = config.mode === 'active';

  const handleActivate = async () => {
    setBusy(true);
    await onActivate(threshold / 100);
    setBusy(false);
    setShowConfirm(false);
  };

  const handlePause = async () => {
    setBusy(true);
    await onPause();
    setBusy(false);
  };

  return (
    <>
      <div className={`rounded-xl border p-4 mb-4 ${isActive ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-amber-500/5 border-amber-500/30'}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <div>
              <p className={`text-sm font-semibold ${isActive ? 'text-emerald-600' : 'text-amber-600'}`}>
                {isActive ? '🤖 Robô ativo' : '📚 Modo aprendizado'}
              </p>
              <p className={`text-xs mt-0.5 ${isActive ? 'text-emerald-500/80' : 'text-amber-500/80'}`}>
                {isActive
                  ? `Respondendo automaticamente quando confiança ≥ ${Math.round(config.min_score * 100)}%`
                  : 'O robô observa e aprende — você ainda responde manualmente'}
              </p>
            </div>
          </div>

          {isActive ? (
            <button
              onClick={handlePause}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/30 text-xs font-medium hover:bg-amber-500/20 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Power className="w-3.5 h-3.5" />
              Pausar robô
            </button>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={busy || templatesCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              <Zap className="w-3.5 h-3.5" />
              Ativar robô
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-border/50">
          {[
            { v: config.manual_count, l: 'respostas manuais', icon: BookOpen },
            { v: templatesCount, l: 'templates ativos', icon: Sliders },
            { v: `${Math.round(config.min_score * 100)}%`, l: 'confiança mínima', icon: Sliders },
            { v: config.auto_count, l: 'auto-respondidas', icon: Zap },
          ].map(({ v, l, icon: Icon }) => (
            <div key={l} className="text-center">
              <p className={`text-lg font-bold ${isActive ? 'text-emerald-600' : 'text-amber-600'}`}>{v}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Modal confirmação */}
      {showConfirm && (
        <div className="bg-card border border-border rounded-xl p-6 mb-4 shadow-lg">
          <h3 className="text-base font-semibold text-foreground mb-2">Ativar resposta automática?</h3>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            A partir deste momento o robô vai responder perguntas com confiança acima do threshold.
            Perguntas abaixo continuam na fila manual. Você pode pausar a qualquer momento.
          </p>

          <div className="space-y-2 mb-4">
            {[
              `${templatesCount} templates ativos e validados`,
              `${config.manual_count} respostas supervisionadas como base`,
              'Perguntas com score baixo permanecem na fila manual',
            ].map(txt => (
              <div key={txt} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="text-emerald-500 font-bold mt-0.5">✓</span>
                {txt}
              </div>
            ))}
          </div>

          {/* Slider threshold */}
          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg mb-4">
            <div className="flex-1">
              <p className="text-xs font-medium text-foreground">Confiança mínima para auto-resposta</p>
              <p className="text-[10px] text-muted-foreground">Abaixo disso vai para fila manual</p>
            </div>
            <input
              type="range" min={50} max={95} step={5}
              value={threshold}
              onChange={e => setThreshold(Number(e.target.value))}
              className="w-20"
            />
            <span className="text-sm font-bold text-foreground w-9 text-right">{threshold}%</span>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowConfirm(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleActivate}
              disabled={busy}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              Confirmar ativação
            </button>
          </div>
        </div>
      )}
    </>
  );
}
