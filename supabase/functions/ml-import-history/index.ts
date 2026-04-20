// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Refresh do token ML — igual ao ml-fetch-questions
async function refreshToken(supabase: any, seller: any): Promise<string | null> {
  const { data: creds } = await supabase
    .from('app_data')
    .select('data_value')
    .eq('data_key', 'ml_credentials')
    .maybeSingle()
  const mlCreds = creds?.data_value as any

  const clientId = seller.client_id || mlCreds?.client_id || Deno.env.get('ML_CLIENT_ID')
  const clientSecret = seller.client_secret || mlCreds?.client_secret || Deno.env.get('ML_CLIENT_SECRET')

  if (!clientId || !clientSecret) return null

  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: seller.refresh_token,
    }),
  })

  if (!res.ok) return null

  const tokens = await res.json()
  await supabase.from('ml_accounts').update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  }).eq('id', seller.id)

  return tokens.access_token
}

// Busca perguntas ANSWERED com paginação (até 90 total, 2 páginas de 50)
async function fetchAnsweredQuestions(
  sellerId: string,
  token: string,
  log: (msg: string) => void
): Promise<any[]> {
  const all: any[] = []
  const offsets = [0, 50]

  for (const offset of offsets) {
    const needed = 90 - all.length
    if (needed <= 0) break

    const pageLimit = Math.min(50, needed)
    const url = `https://api.mercadolibre.com/questions/search?seller_id=${sellerId}&status=ANSWERED&api_version=4&sort_fields=date_created&sort_types=DESC&limit=${pageLimit}&offset=${offset}`

    log(`[HISTORY] Buscando offset=${offset} limit=${pageLimit}...`)

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        log(`[HISTORY] Erro HTTP ${res.status} no offset ${offset}`)
        break
      }

      const data = await res.json()
      const questions = data.questions ?? []
      log(`[HISTORY] Retornou ${questions.length} perguntas no offset ${offset}`)
      all.push(...questions)

      if (questions.length < pageLimit) break
    } catch (e: any) {
      log(`[HISTORY] Erro de rede no offset ${offset}: ${e.message}`)
      break
    }
  }

  return all
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    (Deno.env.get('EXTERNAL_DB_URL') || Deno.env.get('SUPABASE_URL'))!,
    (Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
  )

  const debugLog: string[] = []
  const log = (msg: string) => { console.log(msg); debugLog.push(msg) }

  try {
    // Aceita seller_id específico no body (importação manual) ou processa todas as contas
    let bodySellerIds: string[] | null = null
    try {
      const body = await req.json()
      if (body?.seller_id) bodySellerIds = [String(body.seller_id)]
    } catch { /* sem body → processa todas */ }

    let query = supabase
      .from('ml_accounts')
      .select('id, nome, seller_id, access_token, refresh_token, client_id, client_secret')
      .eq('ativo', true)

    if (bodySellerIds) {
      query = query.in('seller_id', bodySellerIds)
    }

    const { data: sellers, error: sellersError } = await query
    if (sellersError) throw sellersError

    log(`[HISTORY] Processando ${sellers?.length ?? 0} conta(s)...`)

    let totalImported = 0
    let totalSkipped = 0
    const results: any[] = []

    for (const seller of sellers ?? []) {
      const sellerId = String(seller.seller_id || seller.id)
      let token = seller.access_token

      log(`[HISTORY] === Conta: ${seller.nome} (${sellerId}) ===`)

      let questions = await fetchAnsweredQuestions(sellerId, token, log)

      // Token expirado? tenta refresh
      if (questions.length === 0 && seller.refresh_token) {
        log(`[HISTORY] Token pode estar expirado. Tentando refresh...`)
        const newToken = await refreshToken(supabase, seller)
        if (newToken) {
          token = newToken
          questions = await fetchAnsweredQuestions(sellerId, token, log)
        }
      }

      log(`[HISTORY] Total encontrado para ${seller.nome}: ${questions.length}`)

      const valid = questions.filter(
        (q: any) => q.text?.trim() && q.answer?.text?.trim()
      )

      log(`[HISTORY] Perguntas válidas (com resposta): ${valid.length}`)

      const rows = valid.map((q: any) => ({
        seller_id: sellerId,
        question_id: q.id,
        item_id: String(q.item_id),
        question_text: q.text.trim(),
        answer_text: q.answer.text.trim(),
        date_created: q.date_created,
        date_answered: q.answer?.date_created ?? null,
      }))

      if (rows.length > 0) {
        const { error: upsertErr, count } = await supabase
          .from('ml_questions_history')
          .upsert(rows, { onConflict: 'question_id', ignoreDuplicates: true })
          .select('id', { count: 'exact', head: true })

        if (upsertErr) {
          log(`[HISTORY] Erro ao inserir para ${seller.nome}: ${upsertErr.message}`)
        } else {
          const inserted = count ?? rows.length
          totalImported += inserted
          totalSkipped += rows.length - inserted
          log(`[HISTORY] Inseridos: ${inserted}, já existiam: ${rows.length - inserted}`)
        }
      }

      results.push({
        seller: seller.nome,
        seller_id: sellerId,
        found: questions.length,
        valid: valid.length,
      })
    }

    return new Response(JSON.stringify({
      ok: true,
      total_imported: totalImported,
      total_skipped: totalSkipped,
      sellers: results,
      debug_log: debugLog,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    log(`[HISTORY] ERRO GERAL: ${err.message}`)
    return new Response(JSON.stringify({ error: err.message, debug_log: debugLog }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
