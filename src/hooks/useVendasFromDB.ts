import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLocalDateStr } from '@/lib/utils-vix';
import { canonicalSku } from '@/lib/sku-aliases';

export interface MarketplaceDiaItem {
  data: string;
  conta: string;
  marketplace: string;
  faturamento_bruto: number;
  lucro_liquido: number;
  impostos: number;
  ads: number;
  cmv: number;
  comissao: number;
  pedidos: number;
  quantidade: number;
}

export function useVendasFromDB(dateIni: string, dateFim: string, contas?: string[]) {
  const [data, setData] = useState<MarketplaceDiaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchData() {
      let finalIni = dateIni;
      let finalFim = dateFim;

      if (finalIni > finalFim) {
        console.warn('[useVendasFromDB] dateIni > dateFim, corrigindo...');
        [finalIni, finalFim] = [finalFim, finalIni];
      }

      setLoading(true);
      try {
        const { data: rpcData, error: rpcError } = await (supabase.rpc as any)('get_marketplace_dia', {
          p_data_ini: finalIni,
          p_data_fim: finalFim,
          p_contas: (contas && contas.length > 0 && contas[0] && contas[0] !== 'all') ? contas : null
        });

        console.log('[useVendasFromDB] rpcData:', rpcData, 'rpcError:', rpcError, 'params:', { dateIni, dateFim, contas });
        if (rpcError) throw rpcError;

        if (active) {
          const items = (rpcData as any[]) || [];
          console.log('[useVendasFromDB] parsed items count:', items.length);
          setData(items.map((item: any) => ({
            ...item,
            faturamento_bruto: Number(item.faturamento_bruto || 0),
            lucro_liquido: Number(item.lucro_liquido || 0),
            impostos: Number(item.impostos || 0),
            ads: Number(item.ads || 0),
            cmv: Number(item.cmv || 0),
            comissao: Number(item.comissao || 0),
            pedidos: Number(item.pedidos || 0),
            quantidade: Number(item.quantidade || 0)
          })));
          setError(null);
        }
      } catch (err: any) {
        console.error('[useVendasFromDB] error:', err);
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    if (dateIni && dateFim) {
      fetchData();
    }
    
    return () => { active = false; };
  }, [dateIni, dateFim, JSON.stringify(contas)]);

  return { data, loading, error };
}

export interface MarketplaceSkuItem {
  sku: string;
  marketplace: string;
  faturamento_bruto: number;
  liquido: number;
  quantidade: number;
  ads: number;
  cmv: number;
  comissao: number;
  frete: number;
  pedidos: number;
  dev_qtd: number;
  pct_devolucao: number;
  conta: string;
}

export function useVendasSKUFromDB(dateIni: string, dateFim: string, contas?: string[]) {
  const [data, setData] = useState<MarketplaceSkuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchData() {
      let finalIni = dateIni;
      let finalFim = dateFim;

      if (finalIni > finalFim) {
        console.warn('[useVendasSKUFromDB] dateIni > dateFim, corrigindo...');
        [finalIni, finalFim] = [finalFim, finalIni];
      }

      setLoading(true);
      try {
        const { data: rpcData, error: rpcError } = await (supabase.rpc as any)('get_marketplace_sku_faturamento', {
          p_data_ini: finalIni,
          p_data_fim: finalFim,
          p_contas: (contas && contas.length > 0 && contas[0] && contas[0] !== 'all') ? contas : null
        });

        if (rpcError) throw rpcError;

        if (active) {
          const items = (rpcData as any[]) || [];
          // Aplica alias de SKU e agrega duplicatas (ex: FC-04 -> FC-04M)
          const aggMap = new Map<string, any>();
          for (const item of items) {
            const sku = canonicalSku(item.sku);
            const conta = String(item.conta || '');
            const key = `${sku}||${conta}`;
            const prev = aggMap.get(key);
            if (!prev) {
              aggMap.set(key, {
                ...item,
                sku,
                faturamento_bruto: Number(item.faturamento_bruto || 0),
                liquido: Number(item.liquido || item.lucro_liquido || 0),
                quantidade: Number(item.quantidade || 0),
                ads: Number(item.ads || 0),
                cmv: Number(item.cmv || 0),
                comissao: Number(item.comissao || 0),
                frete: Number(item.frete || 0),
                pedidos: Number(item.pedidos || 0),
                dev_qtd: Number(item.dev_qtd || 0),
                pct_devolucao: Number(item.pct_devolucao || 0),
                conta,
              });
            } else {
              prev.faturamento_bruto += Number(item.faturamento_bruto || 0);
              prev.liquido += Number(item.liquido || item.lucro_liquido || 0);
              prev.quantidade += Number(item.quantidade || 0);
              prev.ads += Number(item.ads || 0);
              prev.cmv += Number(item.cmv || 0);
              prev.comissao += Number(item.comissao || 0);
              prev.frete += Number(item.frete || 0);
              prev.pedidos += Number(item.pedidos || 0);
              prev.dev_qtd += Number(item.dev_qtd || 0);
              // pct_devolucao recalculado se possível
              prev.pct_devolucao = prev.quantidade > 0
                ? (prev.dev_qtd / prev.quantidade) * 100
                : 0;
            }
          }
          setData(Array.from(aggMap.values()));
          setError(null);
        }
      } catch (err: any) {
        console.error('[useVendasSKUFromDB] error:', err);
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    if (dateIni && dateFim) {
      fetchData();
    }
    
    return () => { active = false; };
  }, [dateIni, dateFim, JSON.stringify(contas)]);

  return { data, loading, error };
}

export function useVendasSKUEstoqueFromDB(dateIni: string, dateFim: string, contas?: string[]) {
  const [data, setData] = useState<{ sku: string; conta: string; quantidade: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchData() {
      setLoading(true);
      try {
        const { data: rpcData, error: rpcError } = await (supabase.rpc as any)('get_marketplace_sku_estoque', {
          p_data_ini: dateIni,
          p_data_fim: dateFim,
          p_contas: (contas && contas.length > 0 && contas[0] && contas[0] !== 'all') ? contas : null
        });

        if (rpcError) throw rpcError;

        if (active) {
          const items = (rpcData as any[]) || [];
          const aggMap = new Map<string, { sku: string; conta: string; quantidade: number }>();
          for (const item of items) {
            const sku = canonicalSku(item.sku);
            const conta = String(item.conta || '');
            const key = `${sku}||${conta}`;
            const prev = aggMap.get(key);
            const qtd = Number(item.quantidade || 0);
            if (!prev) aggMap.set(key, { sku, conta, quantidade: qtd });
            else prev.quantidade += qtd;
          }
          setData(Array.from(aggMap.values()));
          setError(null);
        }
      } catch (err: any) {
        console.error('[useVendasSKUEstoqueFromDB] error:', err);
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    if (dateIni && dateFim) fetchData();
    return () => { active = false; };
  }, [dateIni, dateFim, JSON.stringify(contas)]);

  return { data, loading, error };
}
