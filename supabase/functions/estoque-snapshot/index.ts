import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getSupabaseClient() {
  const url = (Deno.env.get('EXTERNAL_DB_URL') || Deno.env.get('SUPABASE_URL'))!;
  const key = (Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
  return { url, key };
}

async function supabaseFetch(path: string, options: any = {}) {
  const { url, key } = await getSupabaseClient();
  const { headers: extraHeaders, ...rest } = options;
  const baseHeaders: Record<string, string> = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
  const finalHeaders = { ...baseHeaders, ...(extraHeaders || {}) };
  const res = await fetch(`${url}/rest/v1${path}`, {
    ...rest,
    headers: finalHeaders,
  });
  return res;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    console.log('[estoque-snapshot] Iniciando snapshot diário...');
    
    // 1. Buscar estoque FULL atual do cache
    const appDataRes = await supabaseFetch(`/app_data?data_key=eq.estoque_full_data&select=data_value`);
    const appData = await appDataRes.json();
    
    if (!Array.isArray(appData) || appData.length === 0 || !appData[0].data_value) {
      throw new Error('Cache de estoque (estoque_full_data) não encontrado em app_data');
    }
    
    const items = appData[0].data_value as any[];
    console.log(`[estoque-snapshot] Processando ${items.length} itens do cache.`);

    // 1b. Buscar estoque LOCAL (Tiny) atual do cache para detectar ruptura
    const tinyRes = await supabaseFetch(`/app_data?data_key=eq.estoque_tiny_data&select=data_value`);
    const tinyData = await tinyRes.json();
    const tinyItems: any[] = Array.isArray(tinyData) && tinyData[0]?.data_value ? tinyData[0].data_value : [];
    const tinyMap = new Map<string, number>();
    for (const t of tinyItems) {
      const sku = (t.sku || '').trim().toUpperCase();
      if (!sku) continue;
      tinyMap.set(sku, (tinyMap.get(sku) || 0) + Number(t.quantidade || 0));
    }
    console.log(`[estoque-snapshot] Estoque Tiny: ${tinyMap.size} SKUs únicos.`);

    // 2. Vendas dos últimos 30 dias
    const date30DaysAgo = new Date();
    date30DaysAgo.setDate(date30DaysAgo.getDate() - 30);
    const dateIni = date30DaysAgo.toISOString().split('T')[0];
    const dateFim = new Date().toISOString().split('T')[0];

    const { url, key } = await getSupabaseClient();
    const rpcRes = await fetch(`${url}/rest/v1/rpc/get_marketplace_sku_estoque`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_data_ini: dateIni,
        p_data_fim: dateFim,
        p_contas: null
      })
    });
    
    const vmdData = await rpcRes.json();
    // Mapa: sku||conta -> qtd vendida nos últimos 30 dias
    const vendasMap = new Map<string, number>();
    if (Array.isArray(vmdData)) {
      vmdData.forEach(v => {
        const k = `${v.sku?.trim().toUpperCase()}||${v.conta?.trim()}`;
        vendasMap.set(k, Number(v.quantidade || 0));
      });
    }

    // 2b. Buscar histórico de snapshots (30d) p/ contar dias COM ruptura no Tiny por SKU
    const histRes = await supabaseFetch(
      `/estoque_snapshots?data_ref=gte.${dateIni}&select=data_ref,sku,tiny_quantidade&limit=50000`
    );
    const histData = histRes.ok ? await histRes.json() : [];
    // Mapa: sku -> Set<dias com ruptura local (tiny_quantidade <= 0)>
    const rupturaDiasPorSku = new Map<string, Set<string>>();
    if (Array.isArray(histData)) {
      for (const h of histData) {
        const sku = (h.sku || '').trim().toUpperCase();
        if (!sku) continue;
        // tiny_quantidade pode ser null em snapshots antigos -> ignora
        if (h.tiny_quantidade === null || h.tiny_quantidade === undefined) continue;
        if (Number(h.tiny_quantidade) <= 0) {
          if (!rupturaDiasPorSku.has(sku)) rupturaDiasPorSku.set(sku, new Set());
          rupturaDiasPorSku.get(sku)!.add(h.data_ref);
        }
      }
    }
    console.log(`[estoque-snapshot] SKUs com histórico de ruptura: ${rupturaDiasPorSku.size}`);

    // 3. Preparar Snapshots
    const today = new Date().toISOString().split('T')[0];
    const snapshots = items.map(item => {
      const sku = (item.sku || '').trim().toUpperCase();
      const conta = (item.conta || '').trim();
      const vendas30d = vendasMap.get(`${sku}||${conta}`) || 0;

      // Dias úteis = 30 - dias em ruptura local (Tiny = 0)
      const diasRuptura = rupturaDiasPorSku.get(sku)?.size || 0;
      const tinyAtual = tinyMap.get(sku) ?? null;
      // Se Tiny atual está zerado, conta o dia de hoje também
      const diasRupturaAjustado = (tinyAtual !== null && tinyAtual <= 0)
        ? diasRuptura + (rupturaDiasPorSku.get(sku)?.has(today) ? 0 : 1)
        : diasRuptura;
      const diasComEstoque = Math.max(1, 30 - diasRupturaAjustado);
      const vmd = vendas30d / diasComEstoque;
      
      return {
        data_ref: today,
        sku: sku,
        conta: conta,
        quantidade: Number(item.aptasParaVenda || 0),
        em_transferencia: Number(item.emTransferencia || 0),
        entrada_pendente: Number(item.entradaPendente || 0),
        tiny_quantidade: tinyAtual,
        dias_ruptura_30d: diasRupturaAjustado,
        vmd_calculado: Number(vmd.toFixed(2)),
        synced_at: new Date().toISOString()
      };
    }).filter(s => s.sku);

    // Dedup
    const dedupMap = new Map<string, any>();
    for (const s of snapshots) {
      const k = `${s.data_ref}||${s.sku}||${s.conta}`;
      const existing = dedupMap.get(k);
      if (existing) {
        existing.quantidade += s.quantidade;
        existing.em_transferencia += s.em_transferencia;
        existing.entrada_pendente += s.entrada_pendente;
      } else {
        dedupMap.set(k, { ...s });
      }
    }
    const dedupedSnapshots = Array.from(dedupMap.values());
    console.log(`[estoque-snapshot] Dedup: ${snapshots.length} -> ${dedupedSnapshots.length}`);

    // 4. Upsert
    const BATCH_SIZE = 500;
    let totalInserted = 0;
    let totalErrors = 0;
    for (let i = 0; i < dedupedSnapshots.length; i += BATCH_SIZE) {
      const batch = dedupedSnapshots.slice(i, i + BATCH_SIZE);
      const upsertRes = await supabaseFetch('/estoque_snapshots?on_conflict=data_ref,sku,conta', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(batch)
      });
      
      if (!upsertRes.ok) {
        const err = await upsertRes.text();
        console.error(`[estoque-snapshot] Erro ao inserir lote ${i}:`, err);
        totalErrors += batch.length;
      } else {
        totalInserted += batch.length;
      }
    }

    console.log(`[estoque-snapshot] Snapshot concluído: ${totalInserted} ok, ${totalErrors} erros.`);

    return new Response(JSON.stringify({ 
      success: true, 
      count: snapshots.length,
      skus_com_ruptura_historica: rupturaDiasPorSku.size 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[estoque-snapshot] Error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
