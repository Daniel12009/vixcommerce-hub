import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = (Deno.env.get('EXTERNAL_DB_URL') || Deno.env.get('SUPABASE_URL'))!;
    const key = (Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;

    // Últimos 30 dias
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceStr = since.toISOString().split('T')[0];

    const res = await fetch(
      `${url}/rest/v1/estoque_snapshots?data_ref=gte.${sinceStr}&select=*&order=data_ref.asc&limit=10000`,
      {
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
        },
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Falha ao buscar snapshots: ${err}`);
    }

    const data = await res.json();
    const snapshots = Array.isArray(data) ? data : [];

    return new Response(JSON.stringify({ snapshots, count: snapshots.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[read-external-snapshots] Error:', msg);
    return new Response(JSON.stringify({ error: msg, snapshots: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
