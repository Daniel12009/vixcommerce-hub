import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function callClaude(system: string, messages: any[]): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system,
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Claude error: ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function supabaseFetch(path: string) {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const res = await fetch(`${url}/rest/v1${path}`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  return res.json();
}

async function refreshToken(account: any): Promise<string> {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: account.client_id,
      client_secret: account.client_secret,
      refresh_token: account.refresh_token,
    }),
  });
  const data = await res.json();
  await fetch(`${url}/rest/v1/ml_accounts?id=eq.${account.id}`, {
    method: 'PATCH',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: data.access_token, refresh_token: data.refresh_token }),
  });
  return data.access_token;
}

async function mlGet(account: any, path: string): Promise<any> {
  let token = account.access_token;
  if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
    token = await refreshToken(account);
  }
  const res = await fetch(`https://api.mercadolibre.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    token = await refreshToken(account);
    const res2 = await fetch(`https://api.mercadolibre.com${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res2.ok ? res2.json() : null;
  }
  return res.ok ? res.json() : null;
}

async function mlWrite(account: any, path: string, method: 'PUT' | 'POST', body: any): Promise<any> {
  let token = account.access_token;
  if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
    token = await refreshToken(account);
  }
  const doFetch = (t: string) => fetch(`https://api.mercadolibre.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let res = await doFetch(token);
  if (res.status === 401) {
    token = await refreshToken(account);
    res = await doFetch(token);
  }
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { ok: res.ok, text }; }
}

// Buscar campanhas de um SKU específico
async function getCampaignsForSku(account: any, sku: string, _itemId?: string): Promise<any[]> {
  try {
    const token = account.access_token;
    const advRes = await fetch('https://api.mercadolibre.com/advertising/advertisers?product_id=PADS', {
      headers: { 'Authorization': `Bearer ${token}`, 'Api-Version': '1' },
    });
    if (!advRes.ok) return [];
    const advData = await advRes.json();
    const mlbAdv = (advData?.advertisers || []).find((a: any) => a.site_id === 'MLB');
    if (!mlbAdv) return [];

    const now = new Date().toISOString().split('T')[0];
    const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const adsRes = await fetch(
      `https://api.mercadolibre.com/advertising/MLB/advertisers/${mlbAdv.advertiser_id}/product_ads/ads/search?limit=100&date_from=${past}&date_to=${now}&metrics=clicks,cost,roas,total_amount`,
      { headers: { 'Authorization': `Bearer ${token}`, 'Api-Version': '2' } }
    );
    if (!adsRes.ok) return [];
    const adsData = await adsRes.json();

    const filtered = (adsData?.results || []).filter((ad: any) => {
      return ad.title?.toLowerCase().includes(sku.toLowerCase()) || ad.item_id?.includes(sku);
    });

    const campaignIds = [...new Set(filtered.map((ad: any) => ad.campaign_id).filter(Boolean))];
    const campaigns: any[] = [];

    for (const campId of campaignIds) {
      const campRes = await fetch(
        `https://api.mercadolibre.com/advertising/MLB/product_ads/campaigns/${campId}`,
        { headers: { 'Authorization': `Bearer ${token}`, 'Api-Version': '2' } }
      );
      if (campRes.ok) {
        const camp = await campRes.json();
        const adForCamp = filtered.find((ad: any) => ad.campaign_id === campId);
        campaigns.push({
          campaign_id: campId,
          name: camp.name || `Campanha ${campId}`,
          status: camp.status,
          budget: camp.budget || 0,
          roas_target: camp.roas_target || 0,
          metrics_30d: adForCamp?.metrics || {},
          advertiser_id: mlbAdv.advertiser_id,
        });
      }
    }

    return campaigns;
  } catch (e) {
    console.error('getCampaignsForSku error:', e);
    return [];
  }
}

// Executar ação na API ML
async function executeAction(action: any, accounts: any[]): Promise<{ ok: boolean; message: string }> {
  const account = accounts.find(a => a.nome === action.conta || a.id === action.account_id) || accounts[0];
  if (!account) return { ok: false, message: 'Conta não encontrada' };

  try {
    if (action.type === 'update_campaign') {
      const token = account.access_token;
      const body: any = {};
      if (action.budget !== undefined) body.budget = Number(action.budget);
      if (action.roas_target !== undefined) body.roas_target = Number(action.roas_target);
      if (action.status !== undefined) body.status = action.status;

      const advRes = await fetch('https://api.mercadolibre.com/advertising/advertisers?product_id=PADS', {
        headers: { 'Authorization': `Bearer ${token}`, 'Api-Version': '1' },
      });
      const advData = await advRes.json();
      const mlbAdv = (advData?.advertisers || []).find((a: any) => a.site_id === 'MLB');
      if (!mlbAdv) return { ok: false, message: 'Advertiser não encontrado' };

      const putRes = await fetch(
        `https://api.mercadolibre.com/advertising/${mlbAdv.site_id}/product_ads/campaigns/${action.campaign_id}`,
        {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Api-Version': '2' },
          body: JSON.stringify(body),
        }
      );
      const result = await putRes.text();
      return {
        ok: putRes.ok,
        message: putRes.ok
          ? `✅ Campanha atualizada na conta ${account.nome}`
          : `❌ Erro: ${result.slice(0, 200)}`,
      };
    }

    if (action.type === 'update_item') {
      const result = await mlWrite(account, `/items/${action.item_id}`, 'PUT', action.fields);
      return {
        ok: !result?.error,
        message: result?.error
          ? `❌ Erro: ${result.message || result.error}`
          : `✅ Anúncio ${action.item_id} atualizado na conta ${account.nome}`,
      };
    }

    return { ok: false, message: `Ação desconhecida: ${action.type}` };
  } catch (e: any) {
    return { ok: false, message: `❌ Erro: ${e.message}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { mode, question, context_data, history, execute_action } = await req.json();

    // Buscar contas ML para contexto e execução
    const accounts = await supabaseFetch('/ml_accounts?ativo=eq.true&select=*');

    // ━━━ MODO EXECUÇÃO ━━━
    if (execute_action) {
      const result = await executeAction(execute_action, accounts);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ━━━ MODO ANÁLISE + CHAT ━━━
    const contasNomes = (accounts || []).map((a: any) => a.nome).join(', ');

    const SYSTEM = `Você é um analista e assistente executivo de e-commerce brasileiro especializado em Mercado Livre.

CONTAS DISPONÍVEIS: ${contasNomes}
IMPORTANTE: Sempre especifique a conta (${contasNomes}) em CADA recomendação. Nunca fale "o anúncio FC-138" sem dizer "FC-138 da GS Torneiras" ou "FC-138 da Via Flix".

Você recebe dois tipos de dados:
1. **Dados das planilhas** (histórico, financeiro, margem real, VMD) — fonte: Google Sheets importado pelo usuário
2. **Dados da API ML em tempo real** (estoque atual, ADS do dia, ROAS ao vivo) — fonte: API Mercado Livre

Quando os dois estiverem disponíveis, cruze as informações:
- Compare estoque da planilha com estoque_ml_critico da API
- Compare ads_planilha com ads_live_hoje da API para identificar discrepâncias de atribuição
- Use financeiro das planilhas para calcular margem líquida real das campanhas

VOCÊ PODE EXECUTAR AÇÕES. Quando o usuário pedir uma ação:
1. Identifique o SKU, a conta e a ação solicitada
2. Se não tiver dados suficientes (ex: campaign_id), informe que precisa buscar as campanhas primeiro
3. Descreva exatamente o que vai fazer e PEÇA CONFIRMAÇÃO em texto: "Confirma: [descrição da ação]? Responda SIM para executar."
4. Quando o usuário confirmar com "SIM" ou "sim" ou "confirmo", responda com um JSON de ação no formato:

EXECUTE_ACTION:{"type":"update_campaign","campaign_id":"ID","conta":"Nome da Conta","budget":50}

ou

EXECUTE_ACTION:{"type":"update_item","item_id":"MLB123","conta":"Nome da Conta","fields":{"price":99.90}}

ou

EXECUTE_ACTION:{"type":"update_campaign","campaign_id":"ID","conta":"Nome da Conta","status":"paused"}

AÇÕES DISPONÍVEIS:
- update_campaign: budget (número), roas_target (número), status ("active" ou "paused")
- update_item: fields com price (número) ou status ("active" ou "paused")

Para buscar campanhas de um SKU, indique: FETCH_CAMPAIGNS:{"sku":"FC-138","conta":"GS Torneiras"}

Formate respostas em markdown. **Negrito** para alertas urgentes. Seja direto e específico.
Sempre indique se está usando dados da planilha ou da API ML para cada afirmação importante.`;

    // Construir histórico de mensagens
    const messages = [];
    if (history && Array.isArray(history)) {
      for (const h of history) {
        messages.push({ role: h.role, content: h.content });
      }
    }

    // Adicionar contexto na primeira mensagem ou quando briefing
    const contextStr = context_data
      ? `\n\nDados disponíveis:\n${JSON.stringify(context_data, null, 2).slice(0, 7000)}`
      : '';

    if (mode === 'briefing') {
      messages.push({
        role: 'user',
        content: `Gere um BRIEFING DO DIA em 3 seções:
## 🚨 Alertas Urgentes (máximo 3, com conta especificada, ordenados por impacto financeiro)
## 📊 Destaques do Dia
## ✅ Top 3 Ações para Hoje (com conta e valores específicos)
${contextStr}`,
      });
    } else {
      messages.push({
        role: 'user',
        content: `${question}${contextStr}`,
      });
    }

    const answer = await callClaude(SYSTEM, messages);

    // Verificar se tem comando de busca de campanhas
    let fetchCampaignsData = null;
    const fetchMatch = answer.match(/FETCH_CAMPAIGNS:({[^}]+})/);
    if (fetchMatch) {
      try {
        const { sku, conta } = JSON.parse(fetchMatch[1]);
        const account = accounts.find((a: any) => a.nome === conta) || accounts[0];
        if (account) {
          const campaigns = await getCampaignsForSku(account, sku);
          fetchCampaignsData = { sku, conta: account.nome, campaigns };
        }
      } catch { /* ignore */ }
    }

    // Verificar se tem comando de execução
    let executeData = null;
    const execMatch = answer.match(/EXECUTE_ACTION:({.+})/);
    if (execMatch) {
      try {
        const actionObj = JSON.parse(execMatch[1]);
        const result = await executeAction(actionObj, accounts);
        executeData = result;
      } catch { /* ignore */ }
    }

    return new Response(JSON.stringify({
      answer: answer
        .replace(/EXECUTE_ACTION:{.+}/, '')
        .replace(/FETCH_CAMPAIGNS:{[^}]+}/, '')
        .trim(),
      execute_result: executeData,
      campaigns_data: fetchCampaignsData,
      mode,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('ai-analyst error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
