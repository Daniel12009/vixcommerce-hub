// supabase/functions/telegram-webhook/index.ts
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://mbxpkqhjapmhehdngfaj.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ieHBrcWhqYXBtaGVoZG5nZmFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzkzMjg5NiwiZXhwIjoyMDg5NTA4ODk2fQ.Z5urVHTv5oLodyYnnXM_RBALEl8Ji_5ld-HNtLjxLjQ'
const TELEGRAM_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const ALLOWED_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID')!

async function sendTelegram(chatId: string, text: string) {
  // Telegram has message length limits (4096). Truncating just in case.
  const safeText = text.length > 4000 ? text.slice(0, 4000) + '... (cortado)' : text;
  
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: safeText,
      parse_mode: 'HTML',
    }),
  })
}

/* =======================================================
   FERRAMENTAS (TOOLS)
======================================================== */

const toolsDef = [
  {
    name: 'query_vendas',
    description: 'Consulta vendas por período, conta, SKU ou marketplace. Use para perguntas sobre faturamento, pedidos, produtos vendidos.',
    input_schema: {
      type: 'object',
      properties: {
        data_inicio: { type: 'string', description: 'Data inicial no formato YYYY-MM-DD' },
        data_fim: { type: 'string', description: 'Data final no formato YYYY-MM-DD' },
        conta: { type: 'string', description: 'Nome da conta (ex: Via Flix, Decarion Torneiras, GS Torneiras). Opcional.' },
        sku: { type: 'string', description: 'SKU específico. Opcional.' },
        marketplace: { type: 'string', description: 'Filtrar por marketplace: ML, Shopee, etc. Opcional.' },
        agrupar_por: { type: 'string', enum: ['sku', 'conta', 'dia', 'marketplace'], description: 'Como agrupar os resultados. Opcional.' },
        limit: { type: 'number', description: 'Máximo de resultados. Default 20.' },
      },
      required: [],
    },
  },
  {
    name: 'query_estoque',
    description: 'Consulta estoque atual por SKU, conta ou quantidade. Use para perguntas sobre ruptura, estoque baixo, fulfillment.',
    input_schema: {
      type: 'object',
      properties: {
        conta: { type: 'string', description: 'Filtrar por conta (ex: GS Torneiras). Opcional.' },
        sku: { type: 'string', description: 'SKU específico. Opcional.' },
        quantidade_max: { type: 'number', description: 'Filtrar SKUs com quantidade menor ou igual a este valor. Ex: 5 para estoque crítico.' },
        apenas_zerados: { type: 'boolean', description: 'Se true, retorna apenas SKUs com estoque zero.' },
      },
      required: [],
    },
  },
  {
    name: 'query_perguntas',
    description: 'Consulta perguntas pendentes ou respondidas no ML e Shopee.',
    input_schema: {
      type: 'object',
      properties: {
        marketplace: { type: 'string', enum: ['ml', 'shopee', 'todos'], description: 'Qual marketplace consultar.' },
        status: { type: 'string', enum: ['pending', 'suggested', 'auto_answered', 'todos'], description: 'Status das perguntas.' },
      },
      required: [],
    },
  },
  {
    name: 'executar_sync',
    description: 'Força a sincronização de vendas de uma conta ML ou Shopee para a planilha. Use quando o usuário pedir para "fazer as vendas" ou "sincronizar" uma conta.',
    input_schema: {
      type: 'object',
      properties: {
        modulo: { type: 'string', enum: ['ml_vendas', 'shopee_vendas', 'ml_ads', 'ml_performance'], description: 'Módulo a sincronizar.' },
        conta_nome: { type: 'string', description: 'Nome da conta (ex: Via Flix, Decarion). Opcional — se não informado, sincroniza todas.' },
        data: { type: 'string', description: 'Data no formato YYYY-MM-DD. Default: ontem.' },
      },
      required: ['modulo'],
    },
  },
  {
    name: 'controlar_robo',
    description: 'Ativa, pausa ou força execução imediata do robô de respostas ML.',
    input_schema: {
      type: 'object',
      properties: {
        acao: { type: 'string', enum: ['ativar', 'pausar', 'forcar'], description: 'Ação a executar.' },
        seller_id: { type: 'string', description: 'ID do seller. Opcional — se não informado, aplica a todos.' },
      },
      required: ['acao'],
    },
  }
];

async function query_vendas(params: any, supabase: any): Promise<string> {
  let query = supabase.from('vendas_db').select('data, conta, sku, quantidade, valor_total, marketplace')

  if (params.data_inicio) query = query.gte('data', params.data_inicio)
  if (params.data_fim) query = query.lte('data', params.data_fim)
  if (params.conta) query = query.ilike('conta', `%${params.conta}%`)
  if (params.sku) query = query.ilike('sku', `%${params.sku}%`)
  if (params.marketplace) query = query.ilike('marketplace', `%${params.marketplace}%`)

  query = query.order('data', { ascending: false }).limit(params.limit ?? 200)

  const { data, error } = await query
  if (error) return `Erro: ${error.message}`
  if (!data?.length) return 'Nenhuma venda encontrada com esses filtros.'

  // Agrupar se solicitado
  if (params.agrupar_por === 'sku') {
    const map: Record<string, { qtd: number; total: number }> = {}
    for (const v of data) {
      if (!map[v.sku]) map[v.sku] = { qtd: 0, total: 0 }
      map[v.sku].qtd += v.quantidade || 1
      map[v.sku].total += Number(v.valor_total)
    }
    const sorted = Object.entries(map).sort((a, b) => b[1].total - a[1].total).slice(0, 15)
    return sorted.map(([sku, d]) => `${sku}: ${d.qtd} un / R$ ${d.total.toFixed(2)}`).join('\n')
  }

  if (params.agrupar_por === 'conta') {
    const map: Record<string, { qtd: number; total: number }> = {}
    for (const v of data) {
      if (!map[v.conta]) map[v.conta] = { qtd: 0, total: 0 }
      map[v.conta].qtd += 1
      map[v.conta].total += Number(v.valor_total)
    }
    return Object.entries(map).map(([c, d]) => `${c}: ${d.qtd} pedidos / R$ ${d.total.toFixed(2)}`).join('\n')
  }

  if (params.agrupar_por === 'dia') {
    const map: Record<string, number> = {}
    for (const v of data) {
      map[v.data] = (map[v.data] || 0) + Number(v.valor_total)
    }
    return Object.entries(map).sort().reverse().slice(0, 14)
      .map(([d, t]) => `${d}: R$ ${t.toFixed(2)}`).join('\n')
  }

  // Sem agrupamento — retorna resumo
  const total = data.reduce((s: number, v: any) => s + Number(v.valor_total), 0)
  return `${data.length} pedidos encontrados. Total: R$ ${total.toFixed(2)}\n` +
    data.slice(0, 10).map((v: any) => `${v.data} | ${v.conta} | ${v.sku} | R$ ${v.valor_total}`).join('\n') +
    (data.length > 10 ? `\n... e mais ${data.length - 10} pedidos` : '')
}

async function query_estoque(params: any, supabase: any): Promise<string> {
  const { data: ultima } = await supabase
    .from('estoque_snapshots')
    .select('data_ref')
    .order('data_ref', { ascending: false })
    .limit(1)
    .single()

  const dataRef = ultima?.data_ref
  if (!dataRef) return 'Nenhum snapshot de estoque disponível ainda.'

  let query = supabase
    .from('estoque_snapshots')
    .select('sku, conta, quantidade, vmd_calculado')
    .eq('data_ref', dataRef)

  if (params.conta) query = query.ilike('conta', `%${params.conta}%`)
  if (params.sku) query = query.ilike('sku', `%${params.sku}%`)
  if (params.apenas_zerados) query = query.eq('quantidade', 0)
  if (params.quantidade_max !== undefined) query = query.lte('quantidade', params.quantidade_max)

  query = query.order('quantidade', { ascending: true }).limit(30)

  const { data, error } = await query
  if (error) return `Erro: ${error.message}`
  if (!data?.length) return `Nenhum SKU encontrado com esses filtros (snapshot: ${dataRef}).`

  return `Snapshot: ${dataRef}\n` +
    data.map((e: any) => `${e.sku} (${e.conta}): ${e.quantidade} un`).join('\n')
}

async function query_perguntas(params: any, supabase: any): Promise<string> {
  const marketplace = params.marketplace || 'todos';
  const status = params.status || 'pending';
  
  const statusList = status === 'todos' 
    ? ['pending', 'suggested', 'auto_answered', 'manually_answered', 'ignored', 'error'] 
    : [status];
  
  const tables = marketplace === 'todos' 
    ? ['ml_questions_queue', 'shopee_questions_queue'] 
    : [`${marketplace}_questions_queue`];
    
  let res = [];
  
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .in('status', statusList)
      
    if (error && error.code === '42P01') {
      res.push(`${table}: (Tabela não inicializada ainda)`);
    } else {
      res.push(`${table}: ${count ?? 0} perguntas (status: ${status})`);
    }
  }
  return res.join('\n');
}

async function executar_sync(params: any, supabase: any): Promise<string> {
  try {
    const body: any = { module: params.modulo }
    if (params.data) {
      body.date_from = params.data
      body.date_to = params.data
    }

    if (params.conta_nome) {
      const { data: contas } = await supabase
        .from('ml_accounts')
        .select('id, nome')
        .ilike('nome', `%${params.conta_nome}%`)
        .limit(1)

      if (contas?.length) {
        body.account_id = contas[0].id
        body.conta_nome = contas[0].nome
      }
    }

    const reqPromise = fetch(`${SUPABASE_URL}/functions/v1/daily-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify(body),
    }).catch(e => console.error('Erro no disparar daily-sync:', e));

    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(reqPromise);
    }

    return `Sync iniciado em background: ${params.modulo}${params.conta_nome ? ` (${params.conta_nome})` : ''}. O bot enviará uma mensagem separada assim que o processamento terminar.`
  } catch (e: any) {
    return `Erro ao executar sync: ${e.message}`
  }
}

async function controlar_robo(params: any, supabase: any): Promise<string> {
  const acao = params.acao;
  const seller_id = params.seller_id;
  
  if (acao === 'forcar') {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ml-auto-answer`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({})
    });
    return `Robô ML forçado a rodar imediatamente. Status HTTP: ${res.status}`;
  }
  
  const newMode = acao === 'ativar' ? 'active' : 'learning';
  
  // Update ML bots
  let queryML = supabase.from('ml_bot_config').update({ mode: newMode });
  if (seller_id) queryML = queryML.eq('seller_id', seller_id);
  else queryML = queryML.gt('id', 0); // Update all
  
  const { error: errML } = await queryML;
  
  // Update Shopee bots (if table exists)
  try {
    let queryShopee = supabase.from('shopee_bot_config').update({ mode: newMode });
    if (seller_id) queryShopee = queryShopee.eq('seller_id', seller_id);
    else queryShopee = queryShopee.gt('id', 0);
    await queryShopee;
  } catch {}

  if (errML) return `Erro ao alterar o modo do bot: ${errML.message}`;
  
  return `Robôs ${acao === 'ativar' ? 'ativados (active)' : 'pausados (learning)'} ${seller_id ? 'para o seller ' + seller_id : 'para todas as contas'}.`;
}

async function stopLocal(supabase: any): Promise<string> {
  // 1. Pause all bots
  await supabase.from('ml_bot_config').update({ mode: 'learning' }).gt('id', 0);
  try {
    await supabase.from('shopee_bot_config').update({ mode: 'learning' }).gt('id', 0);
  } catch {}
  
  // 2. Set a flag in app_data for daily-sync to check
  await supabase.from('app_data').upsert({ 
    data_key: 'system_pause_flag', 
    data_value: { paused: true, paused_at: new Date().toISOString() } 
  }, { onConflict: 'data_key' });

  return "🛑 COMANDO STOP-LOCAL RECEBIDO.\n\nTodos os robôs de resposta (ML e Shopee) foram colocados em modo LEARNING (Pausados).\nSincronizações em andamento podem continuar até o fim, mas novas não serão iniciadas se checarem a flag de pausa.";
}

async function startLocal(supabase: any): Promise<string> {
  // 1. Clear pause flag
  await supabase.from('app_data').update({ 
    data_value: { paused: false, resumed_at: new Date().toISOString() } 
  }).eq('data_key', 'system_pause_flag');

  return "✅ COMANDO START-LOCAL RECEBIDO.\n\nA flag de pausa global foi removida. Note que os robôs individuais (ML/Shopee) continuam em modo LEARNING até que você os ative manualmente ou peça para eu ativar.";
}

/* =======================================================
   CLAUDE LLM LOOP
======================================================== */

async function callClaude(messages: any[], tools: any[]): Promise<any> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6', // mantido conforme configuração do usuario
      max_tokens: 1024,
      tools,
      messages,
    }),
  })
  
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Claude HTTP ${res.status}: ${txt}`)
  }
  return res.json()
}

async function processWithTools(userMessage: string, supabase: any, chatId: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

  const messages: any[] = [{
    role: 'user',
    content: `Hoje é ${today}. Ontem foi ${yesterday}.
    
O usuário é o dono do negócio VixCommerce Hub — e-commerce de produtos de casa e construção (torneiras, pias, suportes, chuveiros, iluminação) vendendo no Mercado Livre e Shopee.

Contas ML ativas: Via Flix, Decarion Torneiras, GS Torneiras.

Responda em português, de forma direta e concisa. Sem Markdown. Máximo 300 palavras.
Use as ferramentas disponíveis para buscar dados reais antes de responder.

Pergunta: ${userMessage}`,
  }]

  let response = await callClaude(messages, toolsDef)
  let maxIterations = 3 

  while (maxIterations-- > 0) {
    // Check for kill switch INSIDE the loop
    const { data: pauseFlag } = await supabase
      .from('app_data')
      .select('data_value')
      .eq('data_key', 'system_pause_flag')
      .maybeSingle();
      
    if (pauseFlag?.data_value?.paused) {
      return "🛑 PROCESSAMENTO INTERROMPIDO PELO COMANDO STOP-LOCAL.";
    }

    const toolUseBlocks = (response.content || []).filter((b: any) => b.type === 'tool_use')
    if (!toolUseBlocks.length) break

    await sendTelegram(chatId, `🛠️ Ia decidindo... Executando ${toolUseBlocks.length} ferramentas: ${toolUseBlocks.map((t:any)=>t.name).join(', ')}`)

    const toolResults: any[] = []
    for (const toolUse of toolUseBlocks) {
      let result = ''
      try {
        if (toolUse.name === 'query_vendas') result = await query_vendas(toolUse.input, supabase)
        else if (toolUse.name === 'query_estoque') result = await query_estoque(toolUse.input, supabase)
        else if (toolUse.name === 'query_perguntas') result = await query_perguntas(toolUse.input, supabase)
        else if (toolUse.name === 'executar_sync') result = await executar_sync(toolUse.input, supabase)
        else if (toolUse.name === 'controlar_robo') result = await controlar_robo(toolUse.input, supabase)
        else result = 'Ferramenta não reconhecida'
      } catch (e: any) {
        result = `Erro interno na tool: ${e.message}`
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: String(result),
      })
    }

    messages.push({ role: 'assistant', content: response.content })
    messages.push({ role: 'user', content: toolResults })

    response = await callClaude(messages, toolsDef)
  }

  const textBlock = (response.content || []).find((b: any) => b.type === 'text')
  return textBlock?.text ?? 'Concluído o processamento, mas a IA devolveu a resposta em branco.'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 })

  if (req.method !== 'POST') {
    return new Response('ok', { status: 200 })
  }

  try {
    const update = await req.json()
    const message = update.message || update.edited_message
    if (!message) return new Response('ok', { status: 200 })

    const chatId = String(message.chat.id)
    const text = message.text?.trim()

    if (chatId !== String(ALLOWED_CHAT_ID)) {
      console.log(`[TELEGRAM] Mensagem de chat ignorada: ${chatId}`)
      return new Response('ok', { status: 200 })
    }

    if (!text || text.startsWith('/start')) {
      await sendTelegram(chatId, 'Olá! Sou seu assistente de gestão VixCommerce Hub via IA Autônoma.\n\nVocê pode me mandar rodar ações de sync, consultar vendas históricas por SKU e conferir estoques específicos pelas ferramentas.')
      return new Response('ok', { status: 200 })
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    if (text.toUpperCase() === 'STOP-LOCAL') {
      const msg = await stopLocal(supabase)
      await sendTelegram(chatId, msg)
      return new Response('ok', { status: 200 })
    }

    if (text.toUpperCase() === 'START-LOCAL') {
      const msg = await startLocal(supabase)
      await sendTelegram(chatId, msg)
      return new Response('ok', { status: 200 })
    }

    await sendTelegram(chatId, '⏳ Acionando IA para estruturar sua resposta...')

    try {
      const finalAnswer = await processWithTools(text, supabase, chatId)
      await sendTelegram(chatId, finalAnswer)
    } catch(err: any) {
      await sendTelegram(chatId, '🚨 ERRO: ' + err.message + ' | ' + err.stack);
    }

  } catch (e: any) {
    console.error('[TELEGRAM-WEBHOOK] Erro no JSON handler:', e.message)
  }

  return new Response('ok', { status: 200 })
})
