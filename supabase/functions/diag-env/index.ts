// Diagnóstico temporário: mostra se SUPABASE_URL e EXTERNAL_DB_URL apontam pro mesmo banco.
// Pode ser deletado depois.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supaUrl = Deno.env.get('SUPABASE_URL') || '';
  const extUrl = Deno.env.get('EXTERNAL_DB_URL') || '';
  const supaKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const extKey = Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || '';

  // testa um insert pequeno em vendas_items (ROW_TEST) usando SUPABASE_URL
  let supaInsert = 'skipped';
  try {
    const r = await fetch(`${supaUrl}/rest/v1/vendas_items?on_conflict=numero_pedido,sku`, {
      method: 'POST',
      headers: {
        'apikey': supaKey, 'Authorization': `Bearer ${supaKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([{ numero_pedido: 'DIAG_TEST_001', sku: 'DIAG-SKU', conta: 'DIAG', data: '2026-04-23' }])
    });
    supaInsert = `${r.status} ${await r.text()}`;
  } catch (e) { supaInsert = 'err: ' + (e as Error).message; }

  return new Response(JSON.stringify({
    SUPABASE_URL: supaUrl,
    EXTERNAL_DB_URL: extUrl,
    same_url: supaUrl === extUrl,
    SUPABASE_KEY_len: supaKey.length,
    EXTERNAL_KEY_len: extKey.length,
    same_key: supaKey === extKey,
    supa_insert_test: supaInsert,
  }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
