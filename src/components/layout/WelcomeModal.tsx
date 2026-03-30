import { useState, useEffect } from 'react';
import { Rocket, Box, DollarSign, BarChart2, CheckCircle2, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function WelcomeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Check if user has seen onboarding
    const seen = localStorage.getItem('vix-onboarding-completed');
    if (!seen) {
      setIsOpen(true);
    }
  }, []);

  const handleSkip = () => {
    localStorage.setItem('vix-onboarding-completed', 'true');
    setIsOpen(false);
  };

  const handleStart = async () => {
    setSyncing(true);
    setStep(1); // Iniciando
    
    try {
      // Importa a função que busca todas as abas cadastradas
      const { autoImportAllSheets } = await import('@/lib/sheets-store');
      
      // Simula progresso visual
      const stepsInterval = setInterval(() => {
        setStep(s => (s < 4 ? s + 1 : s));
      }, 5000);

      const { results } = await autoImportAllSheets();
      
      clearInterval(stepsInterval);
      setStep(5); // Concluído
      
      // Salva progresso no Cloud LocalStorage via lib/persistence para cada modulo importado
      const { saveToCloud, syncVendasIncremental } = await import('@/lib/persistence');
      
      for (const { parsed, config } of results) {
        if (!parsed || parsed.length === 0) continue;
        const mod = config.moduloDestino;
        if (mod === 'vendas') await syncVendasIncremental(parsed).catch(console.warn);
        else if (mod === 'estoque-full') saveToCloud('estoque_full_data', parsed);
        else if (mod === 'estoque-tiny') saveToCloud('estoque_tiny_data', parsed);
        else if (mod === 'financeiro') saveToCloud('financeiro_data', parsed);
        else if (mod === 'performance') {
          const existing = await import('@/lib/persistence').then(m => m.loadFromCloud<any[]>('performance_data')) || [];
          const merged = [...existing.filter((p: any) => p.conta !== config.abaNome), ...parsed.map(p => ({ ...p, conta: config.abaNome }))];
          saveToCloud('performance_data', merged);
        }
        else if (mod === 'ads') saveToCloud('ads_data', parsed);
        else if (mod === 'devolucao') saveToCloud('devolucao_data', parsed);
        else if (mod === 'marketplace-dia') saveToCloud('marketplace_dia_data', parsed);
        else if (mod === 'calculadora') saveToCloud('cmv_data', parsed);
      }

      localStorage.setItem('vix-onboarding-completed', 'true');
      
      setTimeout(() => {
        setIsOpen(false);
        window.location.reload(); // Recarrega para o context pegar os dados frescos do LocalStorage
      }, 1500);

    } catch (error) {
      console.error('Erro na sincronização inicial:', error);
      alert('Ops, houve um erro ao puxar os dados. Você pode sincronizar manualmente depois.');
      localStorage.setItem('vix-onboarding-completed', 'true');
      setIsOpen(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-md px-4">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in duration-300">
        {/* Glow Effects */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 rounded-full bg-purple-500/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />

        <div className="relative p-8">
          <div className="w-16 h-16 rounded-2xl vix-gradient flex items-center justify-center mb-6 shadow-lg shadow-purple-500/20">
            <Rocket className="w-8 h-8 text-white" />
          </div>

          <h2 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent mb-3">
            Bem-vindo ao VixPainel! 🎉
          </h2>
          
          <p className="text-muted-foreground text-[15px] leading-relaxed mb-8">
            Sua central de operações omnichannel inteligente. Para que seu painel não fique vazio, recomendamos fazer uma <strong>Sincronização Inicial</strong> com suas planilhas Google agora mesmo.
          </p>

          {!syncing ? (
            <div className="flex flex-col gap-3">
              <Button onClick={handleStart} size="lg" className="w-full h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-900/20 border border-emerald-500/50">
                <Play className="w-5 h-5 mr-2 fill-current" /> Começar (Sincronização Automática)
              </Button>
              <Button onClick={handleSkip} variant="ghost" className="w-full text-muted-foreground hover:text-foreground">
                Pular (Acesso direto, atualizo depois)
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-purple-400 animate-pulse">
                  {step === 5 ? 'Sincronização concluída!' : 'Sincronizando seus dados...'}
                </span>
                {step < 5 && <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />}
                {step === 5 && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
              </div>

              <div className="space-y-3">
                <SyncStep icon={<Box className="w-4 h-4" />} text="Módulo de Estoque e Compras" active={step >= 1} done={step > 1} />
                <SyncStep icon={<DollarSign className="w-4 h-4" />} text="Módulo Financeiro e Vendas" active={step >= 2} done={step > 2} />
                <SyncStep icon={<BarChart2 className="w-4 h-4" />} text="Métricas de ADS e Performance" active={step >= 3} done={step > 3} />
                <SyncStep icon={<Rocket className="w-4 h-4" />} text="Preparando Dashboard e Widgets" active={step >= 4} done={step === 5} />
              </div>

              {step === 5 && (
                <div className="pt-2 text-center text-sm font-medium text-emerald-500 animate-in fade-in slide-in-from-bottom-2">
                  Tudo pronto! Entrando no painel...
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SyncStep({ icon, text, active, done }: { icon: any, text: string, active: boolean, done: boolean }) {
  if (!active) {
    return (
      <div className="flex items-center gap-3 opacity-30">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
          {icon}
        </div>
        <span className="text-sm font-medium text-muted-foreground">{text}</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 transition-all duration-500 ${done ? 'opacity-70' : 'opacity-100 scale-105'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white shadow-lg ${done ? 'bg-emerald-500 shadow-emerald-500/20' : 'vix-gradient shadow-purple-500/20'}`}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : icon}
      </div>
      <span className={`text-sm font-medium ${done ? 'text-foreground' : 'text-foreground font-semibold'}`}>{text}</span>
    </div>
  );
}
