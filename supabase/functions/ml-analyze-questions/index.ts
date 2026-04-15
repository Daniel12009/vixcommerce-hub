import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const ML_API = 'https://api.mercadolibre.com'
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

interface AnalyzePayload {
  seller_id: string
  include_own: boolean
  competitor_item_ids: string[]
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isRecent(dateValue?: string) {
  if (!dateValue) return false
  const timestamp = new Date(dateValue).getTime()
  if (Number.isNaN(timestamp)) return false
  return Date.now() - timestamp <= NINETY_DAYS_MS
}

function normalizeContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((item) => typeof item === 'string' ? item : (item && typeof item === 'object' && 'text' in item ? String((item as any).text ?? '') : ''))
      .join('')
  }
  return ''
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    (Deno.env.get('EXTERNAL_DB_URL') || Deno.env.get('SUPABASE_URL'))!,
    (Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
  )

  try {
    const payload = await req.json().catch(() => null)
    if (!payload || typeof payload.seller_id !== 'string' || typeof payload.include_own !== 'boolean' || !Array.isArray(payload.competitor_item_ids)) {
      return jsonResponse({ error: 'Parâmetros inválidos para análise.' }, 400)
    }

    const { seller_id, include_own, competitor_item_ids }: AnalyzePayload = {
      seller_id: payload.seller_id.trim(),
      include_own: payload.include_own,
      competitor_item_ids: payload.competitor_item_ids.filter((item: unknown) => typeof item === 'string').map((item: string) => item.trim()).filter(Boolean),
    }

    if (!seller_id) {
      return jsonResponse({ error: 'seller_id é obrigatório.' }, 400)
    }

    const { data: seller } = await supabase
      .from('ml_accounts')
      .select('id, nome, seller_id, access_token, refresh_token, token_expires_at, client_id, client_secret')
      .eq('seller_id', seller_id)
      .maybeSingle()

    if (!seller) {
      return jsonResponse({ error: 'Conta do Mercado Livre não encontrada para este seller.' }, 404)
    }

    const { data: appCreds } = await supabase
      .from('app_data')
      .select('data_value')
      .eq('data_key', 'mercado_livre_credentials')
      .maybeSingle()

    const fallbackCreds = (appCreds?.data_value as any) || {}

    const refreshMlToken = async (account: any): Promise<string> => {
      const clientId = account.client_id || fallbackCreds.client_id || Deno.env.get('ML_CLIENT_ID')
      const clientSecret = account.client_secret || fallbackCreds.client_secret || Deno.env.get('ML_CLIENT_SECRET')
      const refreshToken = account.refresh_token

      if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('Credenciais do Mercado Livre incompletas para renovar o token.')
      }

      const refreshRes = await fetch(`${ML_API}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
        }),
      })

      const refreshText = await refreshRes.text()
      if (!refreshRes.ok) {
        throw new Error(`Falha ao renovar token do Mercado Livre: ${refreshText}`)
      }

      const tokens = JSON.parse(refreshText)
      await supabase
        .from('ml_accounts')
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: new Date(Date.now() + (Number(tokens.expires_in || 0) * 1000)).toISOString(),
        })
        .eq('id', account.id)

      account.access_token = tokens.access_token
      account.refresh_token = tokens.refresh_token
      account.token_expires_at = new Date(Date.now() + (Number(tokens.expires_in || 0) * 1000)).toISOString()
      return tokens.access_token
    }

    const mlFetchJson = async (account: any, path: string) => {
      let token = account.access_token
      const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0
      const shouldRefresh = !token || (expiresAt > 0 && expiresAt <= Date.now() + 60_000)

      if (shouldRefresh) {
        token = await refreshMlToken(account)
      }

      let res = await fetch(`${ML_API}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.status === 401) {
        token = await refreshMlToken(account)
        res = await fetch(`${ML_API}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      }

      const raw = await res.text()
      if (!res.ok) {
        throw new Error(`Mercado Livre retornou ${res.status}: ${raw}`)
      }

      return raw ? JSON.parse(raw) : {}
    }

    const ownQuestions: string[] = []
    const competitorQuestions: string[] = []

    if (include_own) {
      let offset = 0
      while (true) {
        const json = await mlFetchJson(seller, `/questions/search?seller_id=${seller_id}&api_version=4&limit=50&offset=${offset}`)
        const pageQuestions = (json.questions ?? [])
          .filter((q: any) => q?.text && isRecent(q?.date_created) && (q?.status === 'ANSWERED' || q?.answer?.text))
          .map((q: any) => q.text as string)

        ownQuestions.push(...pageQuestions)
        if ((json.questions?.length ?? 0) < 50) break
        offset += 50
        if (offset >= 500) break
      }
    }

    for (const itemId of competitor_item_ids) {
      let offset = 0
      while (true) {
        const json = await mlFetchJson(seller, `/questions/search?item=${itemId}&api_version=4&limit=50&offset=${offset}`)
        const pageQuestions = (json.questions ?? [])
          .filter((q: any) => q?.status === 'ANSWERED' && q?.text)
          .map((q: any) => q.text as string)

        competitorQuestions.push(...pageQuestions)
        if ((json.questions?.length ?? 0) < 50) break
        offset += 50
        if (offset >= 500) break
      }
    }

    const allQuestions = [...ownQuestions, ...competitorQuestions]

    if (allQuestions.length === 0) {
      return jsonResponse({
        suggestions: [],
        message: include_own
          ? 'Nenhuma pergunta respondida foi encontrada nos últimos 90 dias para esta conta.'
          : 'Nenhuma pergunta pública respondida foi encontrada nas fontes selecionadas.',
        meta: {
          own_questions: ownQuestions.length,
          competitor_questions: competitorQuestions.length,
        },
      })
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY')
    if (!apiKey) {
      return jsonResponse({ error: 'LOVABLE_API_KEY not configured' }, 500)
    }

    const systemPrompt = 'Você é um especialista em atendimento ao cliente de e-commerce brasileiro, especialmente produtos de casa e construção (torneiras, pias, suportes de segurança, chuveiros a gás, iluminação). Analise as perguntas recebidas e retorne apenas JSON válido.'
    const userPrompt = `Abaixo estão ${allQuestions.length} perguntas reais recebidas por vendedores no Mercado Livre.\n\nAnalise-as e retorne um JSON com os 8 temas mais frequentes, cada um com:\n- theme: nome curto do tema (ex: "Compatibilidade com drywall")\n- frequency: número estimado de perguntas relacionadas\n- example_questions: array com 3 exemplos reais (strings curtas)\n- keywords: array de 5-8 palavras-chave para detectar esse tema (em minúsculas)\n- suggested_answer: resposta padrão ideal em português, profissional, máximo 300 caracteres\n- priority: "alta" | "media" | "baixa" baseado na frequência\n\nFormato obrigatório: { "suggestions": [ { "theme": "...", "frequency": 0, "example_questions": [], "keywords": [], "suggested_answer": "...", "priority": "alta" } ] }\n\nPerguntas:\n${allQuestions.slice(0, 400).join('\n')}`

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    })

    const aiText = await aiRes.text()

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return jsonResponse({ error: 'Limite de requisições da IA atingido. Tente novamente em instantes.' }, 429)
      }
      if (aiRes.status === 402) {
        return jsonResponse({ error: 'Créditos de IA insuficientes no workspace. Adicione créditos e tente novamente.' }, 402)
      }
      return jsonResponse({ error: `AI Gateway Error (Status ${aiRes.status}): ${aiText}` }, 500)
    }

    const aiData = aiText ? JSON.parse(aiText) : {}
    let raw = normalizeContent(aiData.choices?.[0]?.message?.content ?? '{}')
    raw = raw.replace(/^```json\s*/, '').replace(/```$/, '').trim()

    let parsed: { suggestions: any[] } = { suggestions: [] }
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      console.error('Parse error:', e, raw)
      return jsonResponse({ error: 'A IA respondeu em um formato inválido. Tente novamente.' }, 500)
    }

    return jsonResponse({
      suggestions: Array.isArray(parsed?.suggestions) ? parsed.suggestions : [],
      meta: {
        own_questions: ownQuestions.length,
        competitor_questions: competitorQuestions.length,
      },
    })
  } catch (err: any) {
    console.error('ml-analyze-questions fatal error:', err?.message, err?.stack)
    return jsonResponse({ error: err?.message || 'Erro interno na análise' }, 500)
  }
})
