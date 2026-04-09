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
    // Verificar autenticação
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '') ?? ''
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

    const { seller_id, mode, min_score } = await req.json()
    if (!seller_id || !mode) {
      return new Response(JSON.stringify({ error: 'seller_id and mode are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const now = new Date().toISOString()
    await supabase.from('ml_bot_config').upsert({
      seller_id,
      mode,
      min_score: min_score ?? 0.70,
      ...(mode === 'active'
        ? { activated_at: now, activated_by: user.id, paused_at: null }
        : { paused_at: now }),
      updated_at: now,
    }, { onConflict: 'seller_id' })

    return new Response(JSON.stringify({ ok: true, mode }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
