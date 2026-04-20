import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { shopeeFetch } from '../_shared/shopee-utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function getOrderContext(account: any, orderSn: string): Promise<string> {
  if (!orderSn) return '';
  try {
    const data = await shopeeFetch(account, '/api/v2/order/get_order_detail', {
      order_sn_list: orderSn,
      response_optional_fields: 'order_status,shipping_carrier,total_amount,item_list',
    });
    const order = data?.response?.order_list?.[0];
    if (!order) return '';

    const lines = [
      `ID do Pedido: ${order.order_sn}`,
      `Status do Pedido: ${order.order_status}`,
      `Transportadora: ${order.shipping_carrier || 'Padrão Shopee'}`,
      `Total: R$ ${order.total_amount}`
    ];
    if (order.item_list) {
      lines.push('Itens comprados:');
      order.item_list.forEach((i: any) => lines.push(`- ${i.item_name} (Qtd: ${i.model_quantity_purchased})`));
    }
    return lines.join('\n');
  } catch (e) {
    return '';
  }
}

async function getChatHistory(account: any, conversationId: string): Promise<{ historyStr: string; lastIsSeller: boolean }> {
  try {
    const data = await shopeeFetch(account, '/api/v2/message/get_message', {
      offset: '0',
      page_size: '5',
      conversation_id: conversationId,
    });
    const messages = data?.response?.message_list ?? [];
    if (!messages.length) return { historyStr: '', lastIsSeller: false };
    
    // Reverse for chronological order (assuming latest is index 0)
    const chronological = [...messages].reverse();
    const historyStr = chronological.map(m => {
      const author = String(m.from_id) === String(account.shop_id) ? 'Loja (Nós)' : 'Comprador';
      const text = m.message_type === 'text' ? m.content?.text : `[Mensagem tipo ${m.message_type}]`;
      return `${author}: ${text}`;
    }).join('\n');

    const lastMsg = messages[0]; // Shopee returns latest as first
    const lastIsSeller = String(lastMsg.from_id) === String(account.shop_id);

    return { historyStr, lastIsSeller };
  } catch (e) {
    return { historyStr: '', lastIsSeller: false };
  }
}

async function generateAIChat(
  questionText: string,
  historyContext: string,
  orderContext: string,
  logFunc: (msg: string) => void
): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return '';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `Você é um assistente de pós-venda na Shopee.

Instruções:
1. Responda de forma direta e extremamente educada.
2. Seja empático.
3. Máximo 400 caracteres.
4. Use SOMENTE texto puro. NUNCA use formatação Markdown (nem asteriscos), itálico, ou emojis.

${orderContext ? `=== INFORMAÇÕES DO PEDIDO ===\n${orderContext}\n========================\n\n` : ''}
${historyContext ? `=== HISTÓRICO RECENTE DA CONVERSA ===\n${historyContext}\n========================\n\n` : ''}

Nova Mensagem do Comprador: ${questionText}`,
        }],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return data.content?.[0]?.text ?? '';
    }
  } catch {}
  return '';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    (Deno.env.get('EXTERNAL_DB_URL') || Deno.env.get('SUPABASE_URL'))!,
    (Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
  );

  const { data: pending } = await supabase
    .from('shopee_chat_queue')
    .select('*')
    .eq('status', 'pending')
    .order('date_created', { ascending: true })
    .limit(10);

  if (!pending?.length) return new Response(JSON.stringify({ ok: true, msg: 'No pending chat messages' }), { headers: corsHeaders });

  const logMessages: string[] = [];
  const log = (msg: string) => { console.log(msg); logMessages.push(msg); };

  for (const chat of pending) {
    const { data: accounts } = await supabase.from('shopee_accounts').select('*').eq('shop_id', chat.shop_id).maybeSingle();
    if (!accounts) {
        log(`[BOT-CHAT] Conta não encontrada para shop_id ${chat.shop_id}`);
        continue;
    }

    const { historyStr, lastIsSeller } = await getChatHistory(accounts, chat.conversation_id);
    
    if (lastIsSeller) {
       log(`[BOT-CHAT] Skiping message ${chat.id} because the last message in thread is already from Seller (we replied elsewhere)`);
       await supabase.from('shopee_chat_queue').update({
          status: 'ignored',
          error_message: 'Already replied by seller'
       }).eq('id', chat.id);
       continue;
    }

    const orderContext = await getOrderContext(accounts, chat.order_sn || '');
    const suggestion = await generateAIChat(chat.message_text, historyStr, orderContext, log);

    // Default para envio automático se AI gerou resposta
    const botMode = 'active'; 

    if (botMode === 'active' && suggestion) {
      try {
        await shopeeFetch(accounts, '/api/v2/message/send_message', {}, { 
            method: 'POST', 
            body: JSON.stringify({ 
                to_id: chat.buyer_id,
                message_type: 'text',
                content: { text: suggestion }
            }) 
        });

        log(`[BOT-CHAT] Message sent successfully to buyer ${chat.buyer_id}`);

        await supabase.from('shopee_chat_queue').update({
          status: 'auto_answered',
          final_answer: suggestion,
          suggested_answer: suggestion,
          answered_at: new Date().toISOString(),
        }).eq('id', chat.id);

      } catch (err: any) {
         await supabase.from('shopee_chat_queue').update({
          status: 'error',
          error_message: err.message,
        }).eq('id', chat.id);
      }
    } else {
       await supabase.from('shopee_chat_queue').update({
          status: 'suggested',
          suggested_answer: suggestion || null,
        }).eq('id', chat.id);
    }
  }

  return new Response(JSON.stringify({ ok: true, logs: logMessages }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
