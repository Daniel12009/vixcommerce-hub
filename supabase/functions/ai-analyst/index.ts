import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function callClaude(system: string, user: string): Promise<string> {
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
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Claude error: ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Aceitar tanto anon key quanto user JWT — não bloquear
  // O Supabase injeta a anon key automaticamente nas chamadas do frontend

  try {
    const { mode, question, context_data } = await req.json();

    const SYSTEM = `Você é um analista especialista em e-commerce brasileiro, com foco em Mercado Livre, Shopee e Amazon.
Você tem acesso aos dados reais do negócio do usuário (vendas, estoque, ADS, financeiro, performance de anúncios).
Seja direto, prático e objetivo. Priorize ações que impactam faturamento ou evitam perda de dinheiro.
Quando listar produtos ou campanhas, use os dados reais fornecidos.
Formate a resposta em markdown simples — use **negrito** para destacar o que é urgente, listas para ações, sem tabelas complexas.`;

    let prompt = '';

    if (mode === 'briefing') {
      prompt = `Com base nos dados abaixo, gere um BRIEFING DO DIA em 3 seções:

## 🚨 Alertas Urgentes (máximo 3, ordenados por impacto financeiro)
## 📊 Destaques do Dia
## ✅ Top 3 Ações para Hoje

Dados:
${JSON.stringify(context_data, null, 2).slice(0, 6000)}`;

    } else if (mode === 'ads') {
      prompt = `Analise as campanhas de ADS abaixo e responda: ${question}\n\nDados:\n${JSON.stringify(context_data?.ads || [], null, 2).slice(0, 5000)}`;
    } else if (mode === 'estoque') {
      prompt = `Analise o estoque abaixo e responda: ${question}\n\nDados:\n${JSON.stringify(context_data?.estoque || [], null, 2).slice(0, 5000)}`;
    } else if (mode === 'performance') {
      prompt = `Analise a performance dos anúncios abaixo e responda: ${question}\n\nDados:\n${JSON.stringify(context_data?.performance || [], null, 2).slice(0, 5000)}`;
    } else if (mode === 'financeiro') {
      prompt = `Analise os dados financeiros abaixo e responda: ${question}\n\nDados:\n${JSON.stringify(context_data?.financeiro || [], null, 2).slice(0, 5000)}`;
    } else {
      prompt = `Pergunta: ${question}\n\nDados:\n${JSON.stringify(context_data, null, 2).slice(0, 5000)}`;
    }

    const answer = await callClaude(SYSTEM, prompt);

    return new Response(JSON.stringify({ answer, mode }), {
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
