import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  
  return new Response(JSON.stringify({ ok: true, total_imported: 0, msg: "Implementação completa da importação de histórico virá em breve" }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
