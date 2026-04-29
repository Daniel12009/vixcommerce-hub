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

async function getRecentAnswers(
  supabase: any,
  sellerId: string,
  itemId: string,
  logFunc: (msg: string) => void
): Promise<string> {
  try {
    // 1. Tenta buscar perguntas do mesmo item
    const { data: itemHistory } = await supabase
      .from('ml_questions_history')
      .select('question_text, answer_text')
      .eq('seller_id', sellerId)
      .eq('item_id', itemId)
      .order('date_created', { ascending: false })
      .limit(10)

    // 2. Se tiver menos de 5 do item, complementa com perguntas gerais do seller
    let rows = itemHistory ?? []
    if (rows.length < 5) {
      const { data: sellerHistory } = await supabase
        .from('ml_questions_history')
        .select('question_text, answer_text')
        .eq('seller_id', sellerId)
        .neq('item_id', itemId)
        .order('date_created', { ascending: false })
        .limit(10 - rows.length)

      rows = [...rows, ...(sellerHistory ?? [])]
    }

    if (!rows.length) return ''

    return rows
      .map((r: any) => `P: ${r.question_text}\nR: ${r.answer_text}`)
      .join('\n\n')
  } catch (e: any) {
    logFunc(`[BOT] Erro ao buscar histórico do banco: ${e.message}`)
    return ''
  }
}

async function getItemContext(
  itemId: string,
  token: string,
  logFunc: (msg: string) => void
): Promise<string> {
  try {
    logFunc(`[BOT] Buscando dados do anúncio ${itemId}...`)

    // Busca principal: título, descrição curta, atributos e variações
    const [itemRes, descRes] = await Promise.all([
      fetch(`https://api.mercadolibre.com/items/${itemId}?attributes=title,short_description,attributes,variations`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`https://api.mercadolibre.com/items/${itemId}/description`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ])

    const lines: string[] = []

    if (itemRes.ok) {
      const item = await itemRes.json()

      if (item.title) {
        lines.push(`Título: ${item.title}`)
      }

      if (item.attributes?.length) {
        const attrs = item.attributes
          .filter((a: any) => a.value_name && a.value_name.trim() !== '')
          .map((a: any) => `${a.name}: ${a.value_name}`)
        
        if (attrs.length) {
          lines.push(`\nAtributos do produto:\n${attrs.join('\n')}`)
        }
      }

      // Variações disponíveis (ex: cores, tamanhos)
      if (item.variations?.length) {
        const varLines: string[] = []
        for (const v of item.variations.slice(0, 10)) { // máximo 10 variações
          const attrs = (v.attribute_combinations ?? [])
            .map((a: any) => `${a.name}: ${a.value_name}`)
            .join(', ')
          if (attrs) varLines.push(`- ${attrs}`)
        }
        if (varLines.length) {
          lines.push(`\nVariações disponíveis:\n${varLines.join('\n')}`)
        }
      }
    } else {
      logFunc(`[BOT] Erro ao buscar item ${itemId}: ${itemRes.status}`)
    }

    // Descrição do anúncio (texto livre do vendedor)
    if (descRes.ok) {
      const desc = await descRes.json()
      const texto = (desc.plain_text || desc.text || '').trim()
      if (texto) {
        // Aumentado o limite para 1500 chars 
        lines.push(`\nDescrição do anúncio:\n${texto.slice(0, 1500)}${texto.length > 1500 ? '...' : ''}`)
      }
    }

    return lines.join('\n')
  } catch (e: any) {
    logFunc(`[BOT] Erro ao buscar contexto do anúncio: ${e.message}`)
    return ''
  }
}

async function generateAISuggestion(
  questionText: string,
  historicalContext: string,
  itemContext: string,
  logFunc: (msg: string) => void
): Promise<string> {
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
3. Use SOMENTE texto puro. NUNCA use Markdown, asteriscos, negrito, itálico, emojis ou qualquer formatação especial. O texto será exibido diretamente ao cliente no Mercado Livre.
4. Baseie sua resposta nas informações reais do produto abaixo. Se a informação não estiver disponível, sugira que o cliente acesse "Ver mais dados deste vendedor" para conferir o catálogo completo.

${itemContext ? `=== DADOS DO PRODUTO ===\n${itemContext}\n========================\n\n` : ''}${historicalContext ? `=== RESPOSTAS ANTERIORES (tom de referência) ===\n${historicalContext}\n================================================\n\n` : ''}Pergunta do Cliente: ${questionText}`,
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

  // Check for system pause flag (kill switch)
  try {
    const { data: pauseFlag } = await supabase
      .from('app_data')
      .select('data_value')
      .eq('data_key', 'system_pause_flag')
      .maybeSingle();
      
    if (pauseFlag?.data_value?.paused) {
      return new Response(JSON.stringify({ 
        ok: false, 
        message: `Robô pausado pelo comando STOP-LOCAL (${pauseFlag.data_value.paused_at})` 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (e) {
    console.warn('Erro ao checar pause flag:', e);
  }

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
      // Check for kill switch INSIDE the loop
      const { data: pf } = await supabase
        .from('app_data')
        .select('data_value')
        .eq('data_key', 'system_pause_flag')
        .maybeSingle();
      
      if (pf?.data_value?.paused) {
        log(`[BOT] 🛑 INTERRUPÇÃO POR STOP-LOCAL.`);
        break;
      }

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
      
      const botMode = 'active' // Forçar modo ativo — sempre responder
      const minScore = config?.min_score ?? 0.30 // Score mínimo baixo para aproveitar templates
      log(`[BOT] Bot Mode: ${botMode} (forçado), Min Score: ${minScore}`);

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
        log(`[BOT] No match (Score: ${bestScore}). Starting AI generation...`)

        log(`[BOT] Buscando contexto histórico do banco para o item ${question.item_id}...`)
        let context = await getRecentAnswers(supabase, question.seller_id, question.item_id, log)

        // Buscar token do seller para contexto do anúncio
        const { data: sellerForItem } = await supabase
          .from('ml_accounts')
          .select('access_token, refresh_token, id')
          .eq('seller_id', question.seller_id)
          .maybeSingle()

        let itemContext = ''
        if (sellerForItem?.access_token) {
          itemContext = await getItemContext(question.item_id, sellerForItem.access_token, log)
          log(`[BOT] Item context completo:\n${itemContext}`)
        }

        const suggestion = await generateAISuggestion(question.question_text, context, itemContext, log)
        log(`[BOT] AI suggestion generated (length: ${suggestion?.length || 0})`)

        // Sempre enviar automaticamente se gerou sugestão
        if (suggestion) {
          log(`[BOT] Enviando sugestão de IA automaticamente...`)

          const { data: sellerData } = await supabase
            .from('ml_accounts')
            .select('access_token, id')
            .eq('seller_id', question.seller_id)
            .maybeSingle()

          const token = sellerData?.access_token
          if (token) {
            const mlRes = await sendAnswer(token, question.question_id, suggestion)
            const responseTimeMin = Math.round(
              (Date.now() - new Date(question.date_created).getTime()) / 60000
            )

            if (mlRes.ok) {
              log(`[BOT] Sugestão de IA enviada com sucesso.`)
              await supabase.from('ml_questions_queue').update({
                status: 'auto_answered',
                final_answer: suggestion,
                suggested_answer: suggestion,
                answered_at: new Date().toISOString(),
              }).eq('id', question.id)

              await supabase.from('ml_answers_log').insert({
                question_id: question.question_id,
                seller_id: question.seller_id,
                answer_text: suggestion,
                answer_type: 'ai_suggested',
                response_time_min: responseTimeMin,
              })

              await supabase.from('ml_bot_config').update({
                auto_count: (config?.auto_count || 0) + 1,
              }).eq('seller_id', question.seller_id)

              autoCount++
            } else {
              const err = await mlRes.json()
              log(`[BOT] Erro ao enviar sugestão de IA: ${JSON.stringify(err)}`)
              await supabase.from('ml_questions_queue').update({
                status: 'error',
                error_message: JSON.stringify(err),
              }).eq('id', question.id)
            }
          } else {
            log(`[BOT] Token não encontrado, salvando como sugestão.`)
            await supabase.from('ml_questions_queue').update({
              status: 'suggested',
              suggested_answer: suggestion,
            }).eq('id', question.id)
            manualCount++
          }
        } else {
          // Modo learning ou sem sugestão → só salva para revisão manual
          await supabase.from('ml_questions_queue').update({
            status: 'suggested',
            match_score: bestScore > 0 ? bestScore : null,
            suggested_answer: suggestion || null,
          }).eq('id', question.id)
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
