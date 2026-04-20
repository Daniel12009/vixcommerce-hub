import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { shopeeFetch } from '../_shared/shopee-utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function getItemContext(
  account: any,
  itemId: string,
  supabase: any,
  logFunc: (msg: string) => void
): Promise<string> {
  try {
    const data = await shopeeFetch(account, '/api/v2/product/get_item_base_info', {
      item_id_list: itemId,
    });

    const item = data?.response?.item_list?.[0];
    if (!item) return '';

    const lines: string[] = [];
    if (item.item_name) lines.push(`Título: ${item.item_name}`);
    if (item.description) {
      const desc = item.description.trim();
      lines.push(`\nDescrição do anúncio:\n${desc.slice(0, 500)}${desc.length > 500 ? '...' : ''}`);
    }
    return lines.join('\n');
  } catch (e: any) {
    logFunc(`[BOT] Erro ao buscar contexto do anúncio: ${e.message}`);
    return '';
  }
}

async function generateAISuggestion(
  questionText: string,
  itemContext: string,
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
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Você é um assistente de vendas na Shopee, especializado em produtos de casa e construção.

Instruções:
1. Responda de forma direta, profissional e gentil.
2. Máximo 300 caracteres.
3. Use SOMENTE texto puro. NUNCA use Markdown, asteriscos, negrito, itálico ou emojis.
4. Baseie sua resposta nas informações reais do produto abaixo. Se não souber, peça para conferir os detalhes na página da loja.

${itemContext ? `=== DADOS DO PRODUTO ===\n${itemContext}\n========================\n\n` : ''}Pergunta do Cliente: ${questionText}`,
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
    .from('shopee_questions_queue')
    .select('*')
    .eq('status', 'pending')
    .order('date_created', { ascending: true })
    .limit(10);

  if (!pending?.length) return new Response(JSON.stringify({ ok: true, msg: 'No pending questions' }), { headers: corsHeaders });

  const logMessages: string[] = [];
  const log = (msg: string) => { console.log(msg); logMessages.push(msg); };

  for (const question of pending) {
    const { data: accounts } = await supabase.from('shopee_accounts').select('*').eq('shop_id', question.shop_id).maybeSingle();
    if (!accounts) continue;

    // TODO: implement matching template logic for shopee if config table exists later
    // For now we assume AI generation.

    const itemContext = await getItemContext(accounts, question.item_id, supabase, log);
    const suggestion = await generateAISuggestion(question.question_text, itemContext, log);

    // Default to 'active' so we can see it send
    const botMode = 'active';

    if (botMode === 'active' && suggestion) {
      try {
        const replyRes = await shopeeFetch(accounts, '/api/v2/product/reply_comment', {
          comment_id: question.question_id,
          comment: suggestion,
        }, { method: 'POST', body: JSON.stringify({ comment_id: question.question_id, comment: suggestion }) });

        log(`[BOT] Reply sent successfully for comment ${question.question_id}`);

        await supabase.from('shopee_questions_queue').update({
          status: 'auto_answered',
          final_answer: suggestion,
          suggested_answer: suggestion,
          answered_at: new Date().toISOString(),
        }).eq('id', question.id);

      } catch (err: any) {
         await supabase.from('shopee_questions_queue').update({
          status: 'error',
          error_message: err.message,
        }).eq('id', question.id);
      }
    } else {
       await supabase.from('shopee_questions_queue').update({
          status: 'suggested',
          suggested_answer: suggestion || null,
        }).eq('id', question.id);
    }
  }

  return new Response(JSON.stringify({ ok: true, logs: logMessages }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
