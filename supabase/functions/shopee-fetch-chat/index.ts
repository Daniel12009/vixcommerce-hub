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
    log(`[SHOPEE-CHAT] Verificando chats da conta ${account.nome}...`);
    try {
      const chatListData = await shopeeFetch(account, '/api/v2/message/get_conversation_list', {
        offset: '0',
        page_size: '20',
        type: 'unread', // usually filtering unread
      });

      const conversations = chatListData?.response?.conversation_list ?? [];

      for (const conv of conversations) {
        // Shopee return unread_count or latest_message
        const convId = conv.conversation_id;

        // Pega as mensagens da conversa
        const msgsData = await shopeeFetch(account, '/api/v2/message/get_message', {
          offset: '0',
          page_size: '20',
          conversation_id: String(convId),
        });

        const messages = msgsData?.response?.message_list ?? [];
        if (messages.length === 0) continue;

        const latestMsg = messages[messages.length - 1]; // or [0] depending on Shopee API ordering
        // Actually Shopee v2 usually returns latest first at index 0 or we can sort
        // Let's find the latest message from buyer
        
        const latestFromBuyer = messages.find((m: any) => String(m.from_id) !== shopId && String(m.from_id) === String(conv.to_id));
        if (!latestFromBuyer) continue;
        
        // We only care if the last message in the thread is from the buyer and unread
        // Alternatively, the user mentioned we just need to queue it and auto-chat will check if the last msg is from seller to prevent double-reply

        let textContent = '';
        if (latestFromBuyer.message_type === 'text') {
            textContent = latestFromBuyer.content?.text || '';
        } else {
            textContent = `[${latestFromBuyer.message_type}]`;
        }

        await supabase.from('shopee_chat_queue').upsert({
          shop_id: shopId,
          conversation_id: convId,
          message_id: latestFromBuyer.message_id,
          buyer_id: latestFromBuyer.from_id,
          buyer_name: latestFromBuyer.from_name || 'Comprador',
          message_text: textContent,
          order_sn: latestFromBuyer.order_sn || null, // Shopee might return this if linked
          date_created: new Date(latestFromBuyer.created_timestamp * 1000).toISOString(),
          status: 'pending',
        }, { onConflict: 'message_id', ignoreDuplicates: true });

        totalQueued++;
      }
    } catch (e: any) {
      log(`[SHOPEE-CHAT] Erro conta ${account.nome}: ${e.message}`);
    }
  }

  log(`[SHOPEE-CHAT] Total inseridas/verificadas: ${totalQueued}`);

  return new Response(JSON.stringify({ ok: true, queued: totalQueued, logs: logMessages }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
