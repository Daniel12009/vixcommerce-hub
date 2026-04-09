// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    // Buscar todas as contas ML ativas
    const { data: sellers, error: sellersError } = await supabase
      .from('ml_accounts')
      .select('id, nome, seller_id, access_token, refresh_token')
      .eq('ativo', true)

    if (sellersError) throw sellersError

    let totalQueued = 0

    for (const seller of sellers ?? []) {
      const sellerId = String(seller.seller_id || seller.id)
      let token = seller.access_token

      // Buscar perguntas não respondidas
      const res = await fetch(
        `https://api.mercadolibre.com/questions/search?seller_id=${seller.seller_id}&status=UNANSWERED&api_version=4&sort_fields=date_created&sort_types=ASC&limit=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      )

      // Auto-refresh se 401
      if (res.status === 401 && seller.refresh_token) {
        const { data: creds } = await supabase
          .from('app_data')
          .select('data_value')
          .eq('data_key', 'ml_credentials')
          .maybeSingle()
        const mlCreds = creds?.data_value as any
        const refreshRes = await fetch('https://api.mercadolibre.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: mlCreds?.client_id || Deno.env.get('ML_CLIENT_ID')!,
            client_secret: mlCreds?.client_secret || Deno.env.get('ML_CLIENT_SECRET')!,
            refresh_token: seller.refresh_token,
          }),
        })
        if (refreshRes.ok) {
          const tokens = await refreshRes.json()
          token = tokens.access_token
          await supabase.from('ml_accounts').update({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
          }).eq('id', seller.id)
        }
        // Retry
        const retryRes = await fetch(
          `https://api.mercadolibre.com/questions/search?seller_id=${seller.seller_id}&status=UNANSWERED&api_version=4&sort_fields=date_created&sort_types=ASC&limit=50`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const json = await retryRes.json()
        for (const q of json.questions ?? []) {
          if (!q.text || q.text.trim() === '') continue
          const { error } = await supabase.from('ml_questions_queue').upsert({
            seller_id: sellerId,
            question_id: q.id,
            item_id: String(q.item_id),
            buyer_id: q.from?.id ?? null,
            question_text: q.text,
            date_created: q.date_created,
            status: 'pending',
          }, { onConflict: 'question_id', ignoreDuplicates: true })
          if (!error) totalQueued++
        }
        continue
      }

      const json = await res.json()
      for (const q of json.questions ?? []) {
        if (!q.text || q.text.trim() === '') continue
        const { error } = await supabase.from('ml_questions_queue').upsert({
          seller_id: sellerId,
          question_id: q.id,
          item_id: String(q.item_id),
          buyer_id: q.from?.id ?? null,
          question_text: q.text,
          date_created: q.date_created,
          status: 'pending',
        }, { onConflict: 'question_id', ignoreDuplicates: true })
        if (!error) totalQueued++
      }
    }

    return new Response(JSON.stringify({ ok: true, queued: totalQueued }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
