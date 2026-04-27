import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const debug: any = {};
  try {
    const extUrl = Deno.env.get('EXTERNAL_DB_URL');
    const extKey = Deno.env.get('EXTERNAL_DB_SERVICE_KEY');
    const url = (extUrl || Deno.env.get('SUPABASE_URL'))!;
    const key = (extKey || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;

    debug.hasExtUrl = !!extUrl;
    debug.hasExtKey = !!extKey;
    debug.urlHost = url ? new URL(url).host : null;

    // Sem filtro, pega tudo
    const res = await fetch(
      `${url}/rest/v1/estoque_snapshots?select=*&order=data_ref.desc&limit=200`,
      {
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
        },
      }
    );

    debug.status = res.status;
    const text = await res.text();
    debug.bodyPreview = text.slice(0, 300);

    let data: any[] = [];
    try { data = JSON.parse(text); } catch {}

    debug.count = Array.isArray(data) ? data.length : 0;

    return new Response(JSON.stringify({ snapshots: Array.isArray(data) ? data : [], debug }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg, snapshots: [], debug }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
