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
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 4000,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude error HTTP ${res.status}: ${errText}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function supabaseFetch(path: string) {
  const url = (Deno.env.get('EXTERNAL_DB_URL') || Deno.env.get('SUPABASE_URL'))!;
  const key = (Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
  const res = await fetch(`${url}/rest/v1${path}`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  return res.json();
}

async function callMLFunction(body: any) {
  const url = (Deno.env.get('EXTERNAL_DB_URL') || Deno.env.get('SUPABASE_URL'))!;
  const key = (Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
  const res = await fetch(`${url}/functions/v1/mercado-livre`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'apikey': key,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ML function error: ${res.status}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { mode, question, context_data, history, system_prompt } = await req.json();

    // Buscar contas ML ativas de forma segura
    let contasList = '';
    try {
      const accounts = await supabaseFetch('/ml_accounts?ativo=eq.true&select=id,nome,seller_id');
      contasList = (Array.isArray(accounts) ? accounts : []).map((a: any) => `${a.nome} (id: ${a.id})`).join(', ');
    } catch (e: any) {
      console.warn('Falha ao buscar ml_accounts:', e.message);
    }

    const defaultSystem = `Você é um analista e assistente executivo de e-commerce brasileiro especializado em Mercado Livre.

CONTAS ATIVAS: ${contasList}

REGRA CRÍTICA: Sempre especifique a conta em CADA recomendação e ação. Nunca diga "o anúncio FC-138" — sempre diga "FC-138 da GS Torneiras" ou "FC-138 da Via Flix".

Você recebe dois tipos de dados:
1. **Dados das planilhas** (histórico, financeiro, margem real, VMD) — fonte: Google Sheets
2. **Dados da API ML em tempo real** (estoque atual, ADS do dia, ROAS ao vivo) — fonte: API Mercado Livre

Quando os dois estiverem disponíveis, cruze as informações.

VOCÊ PODE EXECUTAR AÇÕES via comandos especiais. Quando o usuário pedir uma ação:
1. Colete as informações necessárias (SKU, conta, o que alterar)
2. Se precisar de dados antes de agir (campanhas, promoções disponíveis), use um comando FETCH
3. Descreva EXATAMENTE o que vai fazer e PEÇA CONFIRMAÇÃO: "Confirma: [ação detalhada]? Responda SIM para executar."
4. Ao receber "SIM", "sim" ou "confirmo", execute com o comando EXECUTE

COMANDOS DISPONÍVEIS:

FETCH — buscar dados antes de agir:
FETCH_CAMPAIGNS:{"sku":"FC-97","conta":"GS Torneiras","account_id":"ID_DA_CONTA"}
FETCH_PROMOTIONS:{"account_id":"ID_DA_CONTA","conta":"GS Torneiras"}
FETCH_PROMO_ITEMS:{"promotion_id":"PROMO_ID","account_id":"ID_DA_CONTA"}

EXECUTE — executar ação (só após confirmação SIM):
EXECUTE:{"type":"update_campaign","campaign_id":"ID","account_id":"ID_CONTA","budget":50}
EXECUTE:{"type":"update_campaign","campaign_id":"ID","account_id":"ID_CONTA","roas_target":8}
EXECUTE:{"type":"update_campaign","campaign_id":"ID","account_id":"ID_CONTA","status":"paused"}
EXECUTE:{"type":"update_item","item_id":"MLBXXX","account_id":"ID_CONTA","fields":{"price":99.90}}
EXECUTE:{"type":"update_item","item_id":"MLBXXX","account_id":"ID_CONTA","fields":{"status":"paused"}}
EXECUTE:{"type":"add_to_promotion","promotion_id":"PROMO_ID","item_id":"MLBXXX","account_id":"ID_CONTA","deal_price":79.90}
EXECUTE:{"type":"remove_from_promotion","promotion_id":"PROMO_ID","item_id":"MLBXXX","account_id":"ID_CONTA"}

Use os IDs reais das contas: ${contasList}
Nunca invente IDs. Se não tiver o campaign_id ou item_id, use FETCH primeiro.

Formate respostas em markdown. **Negrito** para alertas urgentes. Seja direto e específico.
Sempre indique se está usando dados da planilha ou da API ML para cada afirmação importante.`;

    const SYSTEM = system_prompt || defaultSystem;

    // Construir histórico de mensagens
    const msgHistory: any[] = [];
    if (history && Array.isArray(history)) {
      for (const h of history.slice(-8)) {
        msgHistory.push({ role: h.role, content: h.content });
      }
    }

    // Montar mensagem do usuário com contexto
    const contextStr = context_data
      ? `\n\nDados disponíveis:\n${JSON.stringify(context_data)}`
      : '';

    let userContent = '';
    if (mode === 'briefing') {
      userContent = `Gere um BRIEFING DO DIA em 3 seções:
## 🚨 Alertas Urgentes (máximo 3, com conta especificada, ordenados por impacto)
## 📊 Destaques do Dia (com conta de cada item)
## ✅ Top 3 Ações para Hoje (específicas: SKU + conta + valor)
${contextStr}`;
    } else {
      userContent = `${question}${contextStr}`;
    }

    msgHistory.push({ role: 'user', content: userContent });

    // Primeira chamada ao Claude
    let answer = await callClaude(SYSTEM, msgHistory);

    const extraData: any = {};

    // Processar comandos FETCH_CAMPAIGNS
    const fetchCampaignsMatch = answer.match(/FETCH_CAMPAIGNS:({[^}]+})/);
    if (fetchCampaignsMatch) {
      try {
        const params = JSON.parse(fetchCampaignsMatch[1]);
        const adsData = await callMLFunction({
          action: 'get_ads_data',
          account_id: params.account_id,
          date_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          date_to: new Date().toISOString().split('T')[0],
        }).catch(() => ({ items: [], campaigns: [] }));

        const relatedAds = (adsData?.items || []).filter((ad: any) =>
          ad.title?.toLowerCase().includes(params.sku.toLowerCase())
        );
        const campaignIds = [...new Set(relatedAds.map((ad: any) => ad.campaign_id).filter(Boolean))];
        const campaigns = (adsData?.campaigns || []).filter((c: any) => campaignIds.includes(c.id));

        extraData.campaigns_data = {
          sku: params.sku,
          conta: params.conta,
          account_id: params.account_id,
          campaigns,
        };

        const followUp = `Dados das campanhas de ${params.sku} na conta ${params.conta}:
Campanhas: ${JSON.stringify(campaigns)}
Continue a resposta original com esses dados.`;

        msgHistory.push({ role: 'assistant', content: answer.replace(/FETCH_CAMPAIGNS:{[^}]+}/, '[buscando campanhas...]') });
        msgHistory.push({ role: 'user', content: followUp });
        answer = await callClaude(SYSTEM, msgHistory);
      } catch (e) {
        console.error('FETCH_CAMPAIGNS error:', e);
      }
    }

    // Processar FETCH_PROMOTIONS
    const fetchPromoMatch = answer.match(/FETCH_PROMOTIONS:({[^}]+})/);
    if (fetchPromoMatch) {
      try {
        const params = JSON.parse(fetchPromoMatch[1]);
        const promoData = await callMLFunction({
          action: 'list_seller_promotions',
          account_id: params.account_id,
        });

        extraData.promotions_data = {
          conta: params.conta,
          account_id: params.account_id,
          promotions: promoData?.promotions || [],
        };

        const followUp = `Promoções ativas na conta ${params.conta}:
${JSON.stringify(promoData?.promotions || [])}
Liste as promoções de forma clara para o usuário escolher.`;

        msgHistory.push({ role: 'assistant', content: answer.replace(/FETCH_PROMOTIONS:{[^}]+}/, '[buscando promoções...]') });
        msgHistory.push({ role: 'user', content: followUp });
        answer = await callClaude(SYSTEM, msgHistory);
      } catch (e) {
        console.error('FETCH_PROMOTIONS error:', e);
      }
    }

    // Processar FETCH_PROMO_ITEMS
    const fetchPromoItemsMatch = answer.match(/FETCH_PROMO_ITEMS:({[^}]+})/);
    if (fetchPromoItemsMatch) {
      try {
        const params = JSON.parse(fetchPromoItemsMatch[1]);
        const itemsData = await callMLFunction({
          action: 'get_promotion_items',
          promotion_id: params.promotion_id,
          account_id: params.account_id,
        });
        extraData.promo_items_data = itemsData;

        const followUp = `Itens da promoção ${params.promotion_id}:
${JSON.stringify(itemsData?.items || [])}
Continue a resposta com esses dados.`;

        msgHistory.push({ role: 'assistant', content: answer.replace(/FETCH_PROMO_ITEMS:{[^}]+}/, '[buscando itens...]') });
        msgHistory.push({ role: 'user', content: followUp });
        answer = await callClaude(SYSTEM, msgHistory);
      } catch (e) {
        console.error('FETCH_PROMO_ITEMS error:', e);
      }
    }

    // Processar comando EXECUTE
    const executeMatch = answer.match(/EXECUTE:({.+?})/s);
    let executeResult = null;
    if (executeMatch) {
      try {
        const action = JSON.parse(executeMatch[1]);
        let mlBody: any = {};

        if (action.type === 'update_campaign') {
          mlBody = {
            action: 'update_campaign',
            campaign_id: action.campaign_id,
            account_id: action.account_id,
            budget: action.budget,
            roas_target: action.roas_target,
            status: action.status,
          };
        } else if (action.type === 'update_item') {
          mlBody = {
            action: 'update_item',
            item_id: action.item_id,
            account_id: action.account_id,
            fields: action.fields,
          };
        } else if (action.type === 'add_to_promotion') {
          mlBody = {
            action: 'add_item_to_promotion',
            promotion_id: action.promotion_id,
            item_id: action.item_id,
            account_id: action.account_id,
            fields: { deal_price: action.deal_price },
          };
        } else if (action.type === 'remove_from_promotion') {
          mlBody = {
            action: 'remove_item_from_promotion',
            promotion_id: action.promotion_id,
            item_id: action.item_id,
            account_id: action.account_id,
          };
        }

        if (mlBody.action) {
          const result = await callMLFunction(mlBody);
          const ok = !result?.error && !result?.message?.includes('error');
          executeResult = {
            ok,
            message: ok
              ? `✅ Ação executada com sucesso`
              : `❌ Erro: ${result?.message || result?.error || JSON.stringify(result).slice(0, 200)}`,
          };
        }
      } catch (e: any) {
        executeResult = { ok: false, message: `❌ Erro: ${e.message}` };
      }
    }

    // Limpar comandos da resposta final
    const cleanAnswer = answer
      .replace(/FETCH_CAMPAIGNS:{[^}]+}/g, '')
      .replace(/FETCH_PROMOTIONS:{[^}]+}/g, '')
      .replace(/FETCH_PROMO_ITEMS:{[^}]+}/g, '')
      .replace(/EXECUTE:{.+?}/gs, '')
      .trim();

    return new Response(JSON.stringify({
      answer: cleanAnswer,
      execute_result: executeResult,
      ...extraData,
      mode,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    const message = error.message || String(error);
    console.error('ai-analyst error:', message);

    let modelsList = '';
    if (message.includes('not_found_error')) {
      try {
        const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
        const resModels = await fetch('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': apiKey!, 'anthropic-version': '2023-06-01' }
        });
        const modelsData = await resModels.json();
        modelsList = '\n\nModelos Disponíveis (copie para mim!):\n' + (modelsData.data ? modelsData.data.map((m: any) => m.id).join('\n') : 'Não autorizado a listar modelos');
      } catch (em) {
        modelsList = '\n\n[Falha ao buscar lista de modelos permitidos]';
      }
    }

    // Return 200 so supabase-js actually parses the JSON body instead of throwing generic non-2xx
    return new Response(JSON.stringify({ 
      answer: `🚀 DIAGNÓSTICO DE ERRO NO SERVIDOR:\n\n${message}${modelsList}\n\nCopie essa mensagem inteira para o assistente!`,
      error: message, 
      exception: true 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
