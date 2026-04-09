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

async function generateAISuggestion(questionText: string): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return ''
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Você é um assistente de vendas de produtos de casa e construção (torneiras, pias, suportes, chuveiros a gás, iluminação). Responda a pergunta abaixo de forma direta, profissional e em português. Máximo 300 caracteres.\n\nPergunta: ${questionText}`,
        }],
      }),
    })
    const data = await res.json()
    return data.content?.[0]?.text ?? ''
  } catch {
    return ''
  }
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
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const { data: pending } = await supabase
      .from('ml_questions_queue')
      .select('*')
      .eq('status', 'pending')
      .order('date_created', { ascending: true })
      .limit(100)

    let autoCount = 0
    let manualCount = 0

    for (const question of pending ?? []) {
      const { data: templates } = await supabase
        .from('ml_answer_templates')
        .select('*')
        .eq('seller_id', question.seller_id)
        .eq('active', true)

      let bestTemplate: any = null
      let bestScore = 0
      for (const tpl of templates ?? []) {
        const score = matchScore(question.question_text, tpl.keywords)
        if (score > bestScore) { bestScore = score; bestTemplate = tpl }
      }

      // Buscar config do bot
      const { data: config } = await supabase
        .from('ml_bot_config')
        .select('mode, min_score')
        .eq('seller_id', question.seller_id)
        .maybeSingle()

      const botMode = config?.mode ?? 'learning'
      const minScore = config?.min_score ?? 0.70

      if (bestTemplate && bestScore >= minScore) {
        if (botMode === 'active') {
          // Buscar token do seller
          const { data: seller } = await supabase
            .from('ml_accounts')
            .select('access_token, refresh_token, id')
            .eq('seller_id', question.seller_id)
            .maybeSingle()

          const token = seller?.access_token
          if (!token) continue

          const mlRes = await sendAnswer(token, question.question_id, bestTemplate.answer_text)
          const responseTimeMin = Math.round(
            (Date.now() - new Date(question.date_created).getTime()) / 60000
          )

          if (mlRes.ok) {
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
            await supabase.from('ml_questions_queue').update({
              status: 'error',
              error_message: JSON.stringify(err),
            }).eq('id', question.id)
          }
        } else {
          // Modo learning: preenche sugestão mas não envia
          await supabase.from('ml_questions_queue').update({
            match_template_id: bestTemplate.id,
            match_score: bestScore,
            suggested_answer: bestTemplate.answer_text,
          }).eq('id', question.id)
          manualCount++
        }
      } else {
        // Sem match: gerar sugestão com IA
        const suggestion = await generateAISuggestion(question.question_text)
        await supabase.from('ml_questions_queue').update({
          match_template_id: bestTemplate?.id ?? null,
          match_score: bestScore > 0 ? bestScore : null,
          suggested_answer: suggestion || null,
        }).eq('id', question.id)
        manualCount++
      }
    }

    return new Response(JSON.stringify({ ok: true, auto: autoCount, queued_manual: manualCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
