import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface BotConfig {
  mode: 'learning' | 'active';
  min_score: number;
  manual_count: number;
  auto_count: number;
  activated_at: string | null;
}

const defaultConfig: BotConfig = {
  mode: 'learning',
  min_score: 0.70,
  manual_count: 0,
  auto_count: 0,
  activated_at: null,
};

export function useMLBotMode(sellerId: string) {
  const [config, setConfig] = useState<BotConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sellerId) { setLoading(false); return; }
    (supabase
      .from('ml_bot_config' as any)
      .select('*') as any)
      .eq('seller_id', sellerId)
      .maybeSingle()
      .then(({ data }) => {
        setConfig(data ? (data as unknown as BotConfig) : defaultConfig);
        setLoading(false);
      });
  }, [sellerId]);

  const setMode = async (mode: 'learning' | 'active', minScore?: number) => {
    const { error } = await supabase.functions.invoke('ml-set-bot-mode', {
      body: { seller_id: sellerId, mode, min_score: minScore ?? config.min_score },
    });
    if (!error) {
      setConfig(prev => ({ ...prev, mode, min_score: minScore ?? prev.min_score }));
    }
    return error;
  };

  const incrementManual = async () => {
    await (supabase
      .from('ml_bot_config' as any) as any)
      .update({ manual_count: config.manual_count + 1 })
      .eq('seller_id', sellerId);
    setConfig(prev => ({ ...prev, manual_count: prev.manual_count + 1 }));
  };

  return { config, loading, setMode, incrementManual };
}
