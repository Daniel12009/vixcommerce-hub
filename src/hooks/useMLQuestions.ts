import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface QueueItem {
  id: string;
  question_id: number;
  item_id: string;
  question_text: string;
  date_created: string;
  status: string;
  suggested_answer: string | null;
  match_score: number | null;
}

export function useMLQuestions(sellerId: string) {
  const [pending, setPending] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refetchQueue = () => {
    if (!sellerId) return;
    setLoading(true);
    (supabase
      .from('ml_questions_queue' as any)
      .select('*') as any)
      .eq('seller_id', sellerId)
      .in('status', ['pending', 'suggested'])
      .order('date_created', { ascending: true })
      .then(({ data }: any) => { setPending((data as QueueItem[]) ?? []); setLoading(false); });
  };

  useEffect(() => {
    refetchQueue();

    // Realtime subscription
    const channel = supabase
      .channel(`ml_questions_${sellerId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'ml_questions_queue',
        filter: `seller_id=eq.${sellerId}`,
      }, payload => {
        setPending(prev => [...prev, payload.new as QueueItem]);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'ml_questions_queue',
        filter: `seller_id=eq.${sellerId}`,
      }, payload => {
        const updated = payload.new as QueueItem;
        if (!['pending', 'suggested'].includes(updated.status)) {
          setPending(prev => prev.filter(q => q.id !== updated.id));
        } else {
          setPending(prev => prev.map(q => q.id === updated.id ? updated : q));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sellerId]);

  const answer = async (queueId: string, text: string) => {
    const { error } = await supabase.functions.invoke('ml-manual-answer', {
      body: { queue_id: queueId, answer_text: text },
    });
    if (!error) setPending(prev => prev.filter(q => q.id !== queueId));
    return error;
  };

  const ignore = async (queueId: string) => {
    await (supabase.from('ml_questions_queue' as any) as any).update({ status: 'ignored' }).eq('id', queueId);
    setPending(prev => prev.filter(q => q.id !== queueId));
  };

  const saveAsTemplate = async (sellerId: string, item: QueueItem, answerText: string) => {
    // Extract keywords from question (simple: split + filter stop words)
    const stopWords = new Set(['o', 'a', 'os', 'as', 'de', 'do', 'da', 'em', 'no', 'na', 'e', 'que', 'é', 'tem', 'com', 'para', 'por']);
    const keywords = item.question_text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w))
      .slice(0, 6);

    await (supabase.from('ml_answer_templates' as any) as any).insert({
      seller_id: sellerId,
      title: item.question_text.slice(0, 60),
      keywords,
      answer_text: answerText,
      active: true,
    });
  };

  return { pending, loading, answer, ignore, saveAsTemplate, refetchQueue };
}
