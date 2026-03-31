import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CLAUDE_MODEL = 'claude-sonnet-4-6';

async function callClaude(system: string, messages: any[], maxTokens = 1500): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const delays = [3000, 8000, 20000];
  let lastErr = '';
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, system, messages }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.content?.[0]?.text || '';
    }
    lastErr = `Claude error ${res.status}: ${await res.text()}`;
    if (res.status !== 529 || attempt >= delays.length) throw new Error(lastErr);
    await new Promise(r => setTimeout(r, delays[attempt]));
  }
  throw new Error(lastErr);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { message, history, knapsack_context, cbm_limit, days_horizon } = await req.json();

    const system = `Você é um assistente especializado em planejamento de compras para e-commerce.
O usuário acabou de rodar o otimizador Knapsack e quer ajustar ou criar um novo pedido de container.

CONTEXTO DO PEDIDO ATUAL:
${JSON.stringify(knapsack_context, null, 2)}

CAPACIDADE: ${cbm_limit} CBM | HORIZONTE: ${days_horizon} dias

Você pode responder de dois modos:

MODO 1 — RESPOSTA SIMPLES (análise, explicação, dúvida):
Responda normalmente em texto. Não inclua JSON.

MODO 2 — NOVO PEDIDO (quando o usuário pedir um pedido novo, ajuste ou variação):
Responda com uma explicação CURTA e então inclua obrigatoriamente um bloco JSON assim:
\`\`\`json
{
  "action": "rerun_knapsack",
  "params": {
    "cbm_limit": 69,
    "days_horizon": 30,
    "filtros_extras": {
      "apenas_criticos": false,
      "abc_excluir": [],
      "skus_forcar_incluir": [],
      "skus_forcar_excluir": [],
      "min_lucro_cbm": 0,
      "max_skus": null
    }
  },
  "justificativa": "Explique em 1-2 frases o que mudou e por quê"
}
\`\`\`

PARÂMETROS DISPONÍVEIS para ajustar:
- cbm_limit: reduzir/aumentar o container (ex: 55 para container menor)
- days_horizon: dias de planejamento (ex: 60 para bimestral)
- filtros_extras.apenas_criticos: true = só SKUs com risco de ruptura
- filtros_extras.abc_excluir: ex: ["L"] para excluir lançamentos, ["C"] para excluir curva C
- filtros_extras.skus_forcar_incluir: ex: ["FC-82", "FC-143"] força esses SKUs mesmo sem necessidade
- filtros_extras.skus_forcar_excluir: ex: ["FC-138"] remove esses do pedido
- filtros_extras.min_lucro_cbm: ex: 500 para só pegar SKUs com lucro/CBM acima de 500
- filtros_extras.max_skus: ex: 10 para limitar a 10 SKUs no pedido

EXEMPLOS de interpretação:
"só críticos" → apenas_criticos: true
"pedido conservador" → cbm_limit: 55
"foca nos mais rentáveis" → min_lucro_cbm: 800, max_skus: 15
"sem lançamentos" → abc_excluir: ["L"]
"adiciona FC-82" → skus_forcar_incluir: ["FC-82"]
"tira FC-138" → skus_forcar_excluir: ["FC-138"]
"pedido bimestral" → days_horizon: 60
"monte do zero com foco em margem" → min_lucro_cbm: 600

Responda sempre em português brasileiro. Seja direto e objetivo.`;

    const msgs = [
      ...(history || []),
      { role: 'user', content: message },
    ];

    const answer = await callClaude(system, msgs);

    // Detectar se Claude gerou uma action de rerun
    const jsonMatch = answer.match(/```json\s*([\s\S]*?)```/i);
    let action = null;
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        if (parsed.action === 'rerun_knapsack') action = parsed;
      } catch { /* ignore */ }
    }

    return new Response(JSON.stringify({ answer, action }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
