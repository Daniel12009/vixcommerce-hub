import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AISuggestion {
  theme: string;
  frequency: number;
  example_questions: string[];
  keywords: string[];
  suggested_answer: string;
  priority: 'alta' | 'media' | 'baixa';
}

export function useMLAnalysis(sellerId: string) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [ignoredIndices, setIgnoredIndices] = useState<Set<number>>(new Set());

  const analyze = async (includeOwn: boolean, competitorItemIds: string[]) => {
    setLoading(true);
    setSuggestions([]);
    setIgnoredIndices(new Set());
    setProgress(5);

    const steps: [number, string][] = [
      [15, 'Buscando suas perguntas recebidas...'],
      [35, 'Coletando perguntas públicas dos concorrentes...'],
      [60, 'Agrupando temas por frequência...'],
      [85, 'Gerando sugestões de templates com IA...'],
    ];

    let si = 0;
    const interval = setInterval(() => {
      if (si < steps.length) {
        const [pct, txt] = steps[si++];
        setProgress(pct);
        setProgressText(txt);
      }
    }, 1500);

    try {
      const { data, error } = await supabase.functions.invoke('ml-analyze-questions', {
        body: { seller_id: sellerId, include_own: includeOwn, competitor_item_ids: competitorItemIds },
      });
      if (error) throw error;
      setSuggestions(data?.suggestions ?? []);
      setProgress(100);
      setProgressText(`Concluído! ${data?.suggestions?.length ?? 0} temas identificados.`);
    } catch (e: any) {
      setProgressText(`Erro: ${e.message}`);
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  };

  const acceptSuggestion = async (suggestion: AISuggestion) => {
    await (supabase.from('ml_answer_templates' as any) as any).insert({
      seller_id: sellerId,
      title: suggestion.theme,
      keywords: suggestion.keywords,
      answer_text: suggestion.suggested_answer,
      active: true,
    });
  };

  const acceptAll = async () => {
    const toAccept = suggestions.filter((_, i) => !ignoredIndices.has(i));
    for (const s of toAccept) await acceptSuggestion(s);
    return toAccept.length;
  };

  const ignoreSuggestion = (index: number) => {
    setIgnoredIndices(prev => new Set([...prev, index]));
  };

  return { analyze, loading, progress, progressText, suggestions, ignoredIndices, acceptSuggestion, acceptAll, ignoreSuggestion };
}
