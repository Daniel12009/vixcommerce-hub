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
    (Deno.env.get('EXTERNAL_DB_URL') || Deno.env.get('SUPABASE_URL'))!,
    (Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
  )

  try {
    const { queue_id, answer_text } = await req.json()

    if (!queue_id || !answer_text?.trim()) {
      return new Response(JSON.stringify({ error: 'queue_id and answer_text are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (answer_text.length > 2000) {
      return new Response(JSON.stringify({ error: 'answer_text exceeds 2000 characters' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: q } = await supabase
      .from('ml_questions_queue')
      .select('*')
      .eq('id', queue_id)
      .single()

    if (!q) return new Response(JSON.stringify({ error: 'Question not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

    // Buscar token do seller
    const { data: seller } = await supabase
      .from('ml_accounts')
      .select('access_token, refresh_token, id')
      .eq('seller_id', q.seller_id)
      .maybeSingle()

    if (!seller?.access_token) {
      return new Response(JSON.stringify({ error: 'ML account not found or no token' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let token = seller.access_token

    const sendAnswer = async (t: string) => fetch('https://api.mercadolibre.com/answers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ question_id: q.question_id, text: answer_text }),
    })

    let mlRes = await sendAnswer(token)

    // Auto-refresh se 401
    if (mlRes.status === 401 && seller.refresh_token) {
      const { data: creds } = await supabase.from('app_data').select('data_value').eq('data_key', 'ml_credentials').maybeSingle()
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
        await supabase.from('ml_accounts').update({ access_token: token, refresh_token: tokens.refresh_token }).eq('id', seller.id)
        mlRes = await sendAnswer(token)
      }
    }

    if (!mlRes.ok) {
      const err = await mlRes.json()
      return new Response(JSON.stringify({ error: err }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const responseTimeMin = Math.round(
      (Date.now() - new Date(q.date_created).getTime()) / 60000
    )

    await supabase.from('ml_questions_queue').update({
      status: 'manually_answered',
      final_answer: answer_text,
      answered_at: new Date().toISOString(),
    }).eq('id', queue_id)

    const answerType = q.suggested_answer ? 'ai_suggested' : 'manual'
    await supabase.from('ml_answers_log').insert({
      question_id: q.question_id,
      seller_id: q.seller_id,
      answer_text,
      answer_type: answerType,
      response_time_min: responseTimeMin,
    })

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
