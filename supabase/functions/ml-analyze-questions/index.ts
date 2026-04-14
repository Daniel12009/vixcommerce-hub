// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AnalyzePayload {
  seller_id: string
  include_own: boolean
  competitor_item_ids: string[]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const { seller_id, include_own, competitor_item_ids }: AnalyzePayload = await req.json()
    const allQuestions: string[] = []

    const { data: seller } = await supabase
      .from('ml_accounts')
      .select('access_token')
      .eq('seller_id', seller_id)
      .maybeSingle()

    // 1. Perguntas próprias (últimos 90 dias) - Busca direto da API do ML
    if (include_own && seller?.access_token) {
      let offset = 0
      while (true) {
        const res = await fetch(
          `https://api.mercadolibre.com/questions/search?seller_id=${seller_id}&api_version=4&limit=50&offset=${offset}`,
          { headers: { Authorization: `Bearer ${seller.access_token}` } }
        )
        const json = await res.json()
        const questions = (json.questions ?? [])
          .filter((q: any) => q.text)
          .map((q: any) => q.text as string)
        allQuestions.push(...questions)
        if (questions.length < 50) break
        offset += 50
        if (offset >= 500) break // max 500
      }
    }

    // 2. Perguntas públicas dos concorrentes

    if (seller?.access_token) {
      for (const itemId of competitor_item_ids ?? []) {
        let offset = 0
        while (true) {
          const res = await fetch(
            `https://api.mercadolibre.com/questions/search?item=${itemId}&api_version=4&limit=50&offset=${offset}`,
            { headers: { Authorization: `Bearer ${seller.access_token}` } }
          )
          const json = await res.json()
          const questions = (json.questions ?? [])
            .filter((q: any) => q.status === 'ANSWERED' && q.text)
            .map((q: any) => q.text as string)
          allQuestions.push(...questions)
          if (questions.length < 50) break
          offset += 50
          if (offset >= 500) break
        }
      }
    }

    if (allQuestions.length === 0) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const prompt = `Você é um especialista em atendimento ao cliente de e-commerce brasileiro, especialmente produtos de casa e construção (torneiras, pias, suportes de segurança, chuveiros a gás, iluminação).

Abaixo estão ${allQuestions.length} perguntas reais recebidas por vendedores no Mercado Livre.
Analise-as e retorne um JSON com os 8 temas mais frequentes, cada um com:
- theme: nome curto do tema (ex: "Compatibilidade com drywall")
- frequency: número estimado de perguntas relacionadas
- example_questions: array com 3 exemplos reais (strings curtas)
- keywords: array de 5-8 palavras-chave para detectar esse tema (em minúsculas)
- suggested_answer: resposta padrão ideal em português, profissional, máximo 300 caracteres
- priority: "alta" | "media" | "baixa" baseado na frequência

Retorne SOMENTE o JSON, sem texto adicional, sem markdown, sem backticks.
Formato: { "suggestions": [ { "theme": "...", "frequency": 0, "example_questions": [], "keywords": [], "suggested_answer": "...", "priority": "alta" } ] }

Perguntas:
${allQuestions.slice(0, 400).join('\n')}`

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const aiData = await aiRes.json()
    if (!aiRes.ok) {
      throw new Error(aiData.error?.message || 'Erro na API do Claude')
    }

    let raw = aiData.content?.[0]?.text ?? '{}'
    raw = raw.replace(/^```json/, '').replace(/```$/, '').trim() // remove markdown se houver

    let parsed: { suggestions: any[] } = { suggestions: [] }
    try { parsed = JSON.parse(raw) } catch (e) { console.error('Parse error:', e, raw) }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('Edge Function Fatal Error:', err.message, err.stack)
    return new Response(JSON.stringify({ error: `Internal Error: ${err.message}` }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
