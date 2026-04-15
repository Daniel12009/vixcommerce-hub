// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function matchScore(questionText: string, keywords: string[]): number {
  if (!keywords.length) return 0
  const q = questionText.toLowerCase()
  const hits = keywords.filter(kw => q.includes(kw.toLowerCase())).length
  return hits / keywords.length
}

async function getRecentAnswers(seller: any, itemId: string, logFunc: (msg: string) => void): Promise<string> {
  try {
    const res = await fetch(`https://api.mercadolibre.com/questions/search?item=${itemId}&status=ANSWERED&limit=15&api_version=4`, {
      headers: { Authorization: `Bearer ${seller.access_token}` }
    })
    if (!res.ok) return ''
    const data = await res.json()
    const questions = (data.questions ?? [])
      .filter((q: any) => q.text && q.answer?.text)
      .map((q: any) => `P: ${q.text}\nR: ${q.answer.text}`)
      .join('\n\n')
    return questions
  } catch (e) {
    logFunc(`[BOT] Erro ao buscar histórico: ${e.message}`)
    return ''
  }
}

async function generateAISuggestion(questionText: string, historicalContext: string, logFunc: (msg: string) => void): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    logFunc("[BOT] ANTHROPIC_API_KEY not found in env.");
    return '';
  }

  const model = 'claude-sonnet-4-6';
  
  try {
    logFunc(`[BOT] Gerando sugestão com ${model}...`);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Você é um assistente de vendas no Mercado Livre Brasil, especializado em produtos de casa e construção (torneiras, pias, suportes, chuveiros, iluminação). 

Instruções:
1. Responda de forma direta, profissional e gentil.
2. Máximo 300 caracteres.
3. Se o cliente pedir outros produtos, links ou variações que você não tem certeza, sugira que ele acesse 'Ver mais dados deste vendedor' para conferir nosso catálogo completo no Mercado Livre.

${historicalContext ? `Baseie-se nestas respostas anteriores para manter o tom:\n\n${historicalContext}\n\n` : ''}
Pergunta do Cliente: ${questionText}`,
        }],
      }),
    })
    
    if (res.ok) {
      const data = await res.json()
      const text = data.content?.[0]?.text ?? ''
      if (text) {
        return text;
      }
    } else {
      const errText = await res.text();
      logFunc(`[BOT] Erro na IA (${model}): ${res.status} - ${errText}`);
    }
  } catch (e: any) {
    logFunc(`[BOT] Erro de conexão com a IA: ${e.message}`);
  }
  
  return '';
}

async function getToken(supabase: any, seller: any): Promise<string | null> {
  let token = seller.access_token
  return token
}

async function sendAnswer(token: string, questionId: number, text: string) {
  return fetch('https://api.mercadolibre.com/answers', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ question_id: questionId, text }),
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    (Deno.env.get('EXTERNAL_DB_URL') || Deno.env.get('SUPABASE_URL'))!,
    (Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
  )

  try {
    const { data: pending } = await supabase
      .from('ml_questions_queue')
      .select('*')
      .eq('status', 'pending')
    const debugLog: string[] = [];
    const log = (msg: string) => {
      console.log(msg);
      debugLog.push(msg);
    };

    log(`[BOT] Found ${pending?.length || 0} pending questions.`);
    let autoCount = 0
    let manualCount = 0

    for (const question of pending ?? []) {
      log(`[BOT] Processing question ${question.id} for seller ${question.seller_id}...`);
      
      const { data: templates, error: tErr } = await supabase
        .from('ml_answer_templates')
        .select('*')
        .eq('seller_id', question.seller_id)
        .eq('active', true)

      if (tErr) log(`[BOT] Error fetching templates: ${JSON.stringify(tErr)}`);
      log(`[BOT] Found ${templates?.length || 0} active templates.`);

      let bestTemplate: any = null
      let bestScore = 0
      for (const tpl of templates ?? []) {
        const score = matchScore(question.question_text, tpl.keywords)
        if (score > bestScore) { bestScore = score; bestTemplate = tpl }
      }
      log(`[BOT] Best template match score: ${bestScore}`);

      // Buscar config do bot
      const { data: config, error: cErr } = await supabase
        .from('ml_bot_config')
        .select('mode, min_score')
        .eq('seller_id', question.seller_id)
        .maybeSingle()

      if (cErr) log(`[BOT] Error fetching config: ${JSON.stringify(cErr)}`);
      
      const botMode = config?.mode ?? 'learning'
      const minScore = config?.min_score ?? 0.70
      log(`[BOT] Bot Mode: ${botMode}, Min Score: ${minScore}`);

      if (bestTemplate && bestScore >= minScore) {
        log(`[BOT] Match found! Template ID: ${bestTemplate.id}`);
        if (botMode === 'active') {
          log(`[BOT] Bot is active. Attempting to send answer...`);
          // Buscar token do seller
          const { data: seller } = await supabase
            .from('ml_accounts')
            .select('access_token, refresh_token, id')
            .eq('seller_id', question.seller_id)
            .maybeSingle()

          const token = seller?.access_token
          if (!token) {
            log(`[BOT] No access token found for seller ${question.seller_id}`);
            continue
          }

          const mlRes = await sendAnswer(token, question.question_id, bestTemplate.answer_text)
          const responseTimeMin = Math.round(
            (Date.now() - new Date(question.date_created).getTime()) / 60000
          )

          if (mlRes.ok) {
            log(`[BOT] Answer sent successfully.`);
            await supabase.from('ml_questions_queue').update({
              status: 'auto_answered',
              match_template_id: bestTemplate.id,
              match_score: bestScore,
              final_answer: bestTemplate.answer_text,
              answered_at: new Date().toISOString(),
            }).eq('id', question.id)

            await supabase.from('ml_answers_log').insert({
              question_id: question.question_id,
              seller_id: question.seller_id,
              answer_text: bestTemplate.answer_text,
              answer_type: 'auto',
              template_id: bestTemplate.id,
              response_time_min: responseTimeMin,
            })

            // Incrementar uso do template
            await supabase.from('ml_answer_templates').update({
              use_count: (bestTemplate.use_count || 0) + 1,
              last_used_at: new Date().toISOString(),
            }).eq('id', bestTemplate.id)

            // Incrementar contador do bot
            await supabase.from('ml_bot_config').update({
              auto_count: (config?.auto_count || 0) + 1,
            }).eq('seller_id', question.seller_id)

            autoCount++
          } else {
            const err = await mlRes.json()
            log(`[BOT] ML API Error: ${JSON.stringify(err)}`);
            await supabase.from('ml_questions_queue').update({
              status: 'error',
              error_message: JSON.stringify(err),
            }).eq('id', question.id)
          }
        } else {
          log(`[BOT] Bot is in learning mode. Suggesting matching template.`);
          // Modo learning: preenche sugestão mas não envia
          await supabase.from('ml_questions_queue').update({
            status: 'suggested',
            match_template_id: bestTemplate.id,
            match_score: bestScore,
            suggested_answer: bestTemplate.answer_text,
          }).eq('id', question.id)
          manualCount++
        }
      } else {
        // Sem match: gerar sugestão com IA
        log(`[BOT] No match (Score: ${bestScore}). Starting AI generation...`);
        
        // Buscar token do seller para o histórico
        const { data: seller } = await supabase
          .from('ml_accounts')
          .select('access_token, refresh_token, id')
          .eq('seller_id', question.seller_id)
          .maybeSingle()

        let context = ''
        if (seller?.access_token) {
          log(`[BOT] Buscando contexto histórico para o item ${question.item_id}...`);
          context = await getRecentAnswers(seller, question.item_id, log)
        }

        const suggestion = await generateAISuggestion(question.question_text, context, log)
        log(`[BOT] AI suggestion generated (length: ${suggestion?.length || 0})`);
        
        const { error: upErr } = await supabase.from('ml_questions_queue').update({
          status: 'suggested',
          match_template_id: bestTemplate?.id ?? null,
          match_score: bestScore > 0 ? bestScore : null,
          suggested_answer: suggestion || null,
        }).eq('id', question.id)

        if (upErr) {
          log(`[BOT] DB Update error: ${JSON.stringify(upErr)}`);
        } else {
          log(`[BOT] Question ${question.id} successfully updated to 'suggested'.`);
          manualCount++
        }
      }
    }

    return new Response(JSON.stringify({ 
      ok: true, 
      auto: autoCount, 
      queued_manual: manualCount,
      found_pending: pending?.length || 0,
      debug_log: debugLog 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
