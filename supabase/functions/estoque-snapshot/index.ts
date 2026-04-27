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
  // extraHeaders sobrescrevem baseHeaders (pra permitir Prefer customizado)
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
    
    // 1. Buscar estoque atual do cache (app_data)
    const appDataRes = await supabaseFetch(`/app_data?data_key=eq.estoque_full_data&select=data_value`);
    const appData = await appDataRes.json();
    
    if (!Array.isArray(appData) || appData.length === 0 || !appData[0].data_value) {
      throw new Error('Cache de estoque (estoque_full_data) não encontrado em app_data');
    }
    
    const items = appData[0].data_value as any[];
    console.log(`[estoque-snapshot] Processando ${items.length} itens do cache.`);

    // 2. Buscar VMD calculado do banco (RPC get_marketplace_sku para os últimos 30 dias)
    // Nota: Como não podemos chamar RPC via REST facilmente com agrupamento complexo de fora, 
    // vamos buscar as vendas por SKU dos últimos 30 dias
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
    const vmdMap = new Map<string, number>();
    if (Array.isArray(vmdData)) {
      vmdData.forEach(v => {
        const k = `${v.sku?.trim().toUpperCase()}||${v.conta?.trim()}`;
        vmdMap.set(k, (v.quantidade || 0) / 30);
      });
    }

    // 3. Preparar Snapshots
    const today = new Date().toISOString().split('T')[0];
    const snapshots = items.map(item => {
      const sku = (item.sku || '').trim().toUpperCase();
      const conta = (item.conta || '').trim();
      const vmd = vmdMap.get(`${sku}||${conta}`) || 0;
      
      return {
        data_ref: today,
        sku: sku,
        conta: conta,
        quantidade: Number(item.aptasParaVenda || 0),
        em_transferencia: Number(item.emTransferencia || 0),
        entrada_pendente: Number(item.entradaPendente || 0),
        vmd_calculado: Number(vmd.toFixed(2)),
        synced_at: new Date().toISOString()
      };
    }).filter(s => s.sku);

    // 4. Upsert no banco
    // Dividir em lotes para evitar estourar o limite de payload
    const BATCH_SIZE = 500;
    for (let i = 0; i < snapshots.length; i += BATCH_SIZE) {
      const batch = snapshots.slice(i, i + BATCH_SIZE);
      const upsertRes = await supabaseFetch('/estoque_snapshots', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(batch)
      });
      
      if (!upsertRes.ok) {
        const err = await upsertRes.text();
        console.error(`[estoque-snapshot] Erro ao inserir lote ${i}:`, err);
      }
    }

    console.log(`[estoque-snapshot] Snapshot concluído com sucesso: ${snapshots.length} registros.`);

    return new Response(JSON.stringify({ success: true, count: snapshots.length }), {
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
