import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { shopeeFetch } from '../_shared/shopee-utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    (Deno.env.get('EXTERNAL_DB_URL') || Deno.env.get('SUPABASE_URL'))!,
    (Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
  );

  const { data: accounts } = await supabase
    .from('shopee_accounts')
    .select('*')
    .eq('ativo', true);

  let totalQueued = 0;
  const logMessages: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logMessages.push(msg);
  };

  for (const account of accounts ?? []) {
    const shopId = String(account.shop_id);
    log(`[SHOPEE-FETCH] Verificando perguntas conta ${account.nome}...`);
    try {
      const data = await shopeeFetch(account, '/api/v2/product/get_comment', {
        filter_type: '0',   // 0 = sem resposta do vendedor
        offset: '0',
        limit: '50',
      });

      for (const item of data?.response?.comment_list ?? []) {
        if (!item.comment || item.comment.trim() === '') continue;

        await supabase.from('shopee_questions_queue').upsert({
          shop_id: shopId,
          question_id: item.comment_id,
          item_id: item.item_id,
          question_text: item.comment.trim(),
          buyer_id: item.buyer_id ?? null,
          date_created: new Date(item.create_time * 1000).toISOString(),
          status: 'pending',
        }, { onConflict: 'question_id', ignoreDuplicates: true });

        totalQueued++;
      }
    } catch (e: any) {
      log(`[SHOPEE-FETCH] Erro conta ${account.nome}: ${e.message}`);
    }
  }

  log(`[SHOPEE-FETCH] Total inseridas/verificadas: ${totalQueued}`);

  return new Response(JSON.stringify({ ok: true, queued: totalQueued, logs: logMessages }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
