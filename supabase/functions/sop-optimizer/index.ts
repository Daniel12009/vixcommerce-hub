import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CLAUDE_MODEL = 'claude-sonnet-4-6';

async function callClaude(system: string, user: string, maxTokens = 2000): Promise<string> {
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
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Claude error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

function parseJSON(text: string): any {
  const clean = text.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
  try { return JSON.parse(clean); } catch {
    const m = clean.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (m) return JSON.parse(m[1]);
    throw new Error('JSON parse failed: ' + clean.slice(0, 200));
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AGENTE 1 — FILTROS & EXCLUSÕES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function agent1_filtros(skus: any[]): Promise<any[]> {
  const system = `Você é responsável por filtrar SKUs elegíveis para compra.
Retorne APENAS JSON válido (array). Sem markdown, sem explicações.
Formato: [{"sku":"FC-138","motivo_exclusao":null}, {"sku":"FC-13","motivo_exclusao":"Não vou mais trazer"}]
Inclua TODOS os SKUs — os excluídos com motivo_exclusao preenchido, os elegíveis com null.`;

  const user = `Aplique as regras de exclusão nos SKUs abaixo:
REGRAS:
1. Se campo "parar" contém "Não vou mais trazer" → excluir
2. Se campo "check" contém "Não comprar" → excluir  
3. Se custo = 0 E vmd = 0 E estoque = 0 E sem histórico → excluir (sem dados)
4. ABC=L significa LANÇAMENTO — NÃO excluir automaticamente

SKUs:
${JSON.stringify(skus.map(s => ({ sku: s.sku, parar: s.parar, check: s.check, custo: s.custo, vmd: s.vmd, estoque: s.estoque, abc: s.abc })))}`;

  const result = await callClaude(system, user, 3000);
  return parseJSON(result);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AGENTE 2 — DEMANDA & VMD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function agent2_demanda(elegíveis: any[], skusMap: Record<string, any>, daysHorizon: number): Promise<any[]> {
  const system = `Você é especialista em previsão de demanda. Retorne APENAS JSON válido (array). Sem markdown.
Para cada SKU, calcule:
- Se "historico_mensal" tiver dados reais: use-os para calcular VMD e detectar tendência/sazonalidade
- vmd_ajustada = (vmd * 0.4 + vmd_recente * 0.6) * bias. Se vmd_recente=0, usar só vmd. Se bias=0 usar 1.
- Se "total_180d" > 0: vmd_real = total_180d / 180 — use como referência principal
- demanda_periodo = vmd_ajustada * ${daysHorizon}
- demanda_lead_time = vmd_ajustada * 90
- estoque_seguranca = vmd_ajustada * 15 (ou dias_seg se informado)
- necessidade_minima = max(0, demanda_periodo + demanda_lead_time + estoque_seguranca - estoque - transito_bm)
- tendencia: compare últimos 3 meses vs 3 meses anteriores no historico_mensal.
  "crescente" se +20%, "decrescente" se -20%, senão "estavel"
- dias_cobertura = (estoque + transito_bm) / vmd_ajustada
- status: "critico" se dias_cobertura < 30, "risco" se < 90, "ok" se >= 90

Formato:
[{"sku":"FC-138","vmd_ajustada":91.28,"vmd_fonte":"vendas_reais","demanda_periodo":2738,"necessidade_minima":10957,"tendencia":"estavel","dias_cobertura":30,"status":"critico"}]`;

  const skusData = elegíveis
    .filter(e => !e.motivo_exclusao)
    .map(e => {
      const s = skusMap[e.sku] || {};
      return {
        sku: e.sku,
        vmd: s.vmd || 0,
        vmd_recente: s.vmd_recente || 0,
        vmd_planilha: s.vmd_planilha || 0,
        total_180d: s.total_180d || 0,
        historico_mensal: s.historico_mensal || {},
        bias: s.bias || 1,
        estoque: s.estoque || 0,
        transito_bm: s.transito_bm || 0,
        dias_seg: s.dias_seg || 15,
      };
    });

  const user = `Calcule demanda para estes SKUs:\n${JSON.stringify(skusData)}`;
  const result = await callClaude(system, user, 4000);
  return parseJSON(result);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AGENTE 3 — CBM POR UNIDADE (paralelo com agente 2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function agent3_cbm(elegíveis: any[], skusMap: Record<string, any>): Promise<Record<string, number>> {
  // Cálculo direto — não precisa de IA
  const cbmMap: Record<string, number> = {};
  for (const e of elegíveis.filter(e => !e.motivo_exclusao)) {
    const s = skusMap[e.sku] || {};
    // cbm_unit vem mapeado diretamente, ou calcula de cbm_tot_user / pedido_user
    if (s.cbm_unit && s.cbm_unit > 0) {
      cbmMap[e.sku] = s.cbm_unit;
    } else if (s.cbm_tot_user > 0 && s.pedido_user > 0) {
      cbmMap[e.sku] = s.cbm_tot_user / s.pedido_user;
    } else {
      cbmMap[e.sku] = 0;
    }
  }
  return cbmMap;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AGENTE 4 — MÉTRICAS DE OTIMIZAÇÃO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function agent4_metricas(demandas: any[], cbmMap: Record<string, number>, skusMap: Record<string, any>): Promise<any[]> {
  const system = `Você calcula métricas de otimização para compras. Retorne APENAS JSON válido (array). Sem markdown.
Fórmulas:
- preco_venda = custo / (1 - margem) se margem < 1
- lucro_unitario = preco_venda * margem * (1 - taxa_dev)
- lucro_cbm = lucro_unitario / cbm_unit (0 se cbm_unit=0)
- classificacao: "critico" se status=critico, "alta_eficiencia" se lucro_cbm no top 25%, "oportunidade" se necessidade>0, "excesso" se necessidade=0

Formato:
[{"sku":"FC-138","lucro_unitario":5.20,"lucro_cbm":1834.5,"classificacao":"critico","cbm_unit":0.00283}]`;

  const dados = demandas.map(d => {
    const s = skusMap[d.sku] || {};
    return {
      sku: d.sku,
      status: d.status,
      custo: s.custo || 0,
      margem: s.margem || 0,
      taxa_dev: s.taxa_dev || 0,
      cbm_unit: cbmMap[d.sku] || 0,
    };
  });

  const user = `Calcule métricas para:\n${JSON.stringify(dados)}`;
  const result = await callClaude(system, user, 4000);
  return parseJSON(result);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AGENTE 5 — KNAPSACK (core)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function agent5_knapsack(demandas: any[], metricas: any[], cbmLimit: number): Promise<any> {
  const system = `Você é o otimizador Knapsack para compras de container. Retorne APENAS JSON válido. Sem markdown.
ALGORITMO OBRIGATÓRIO:
1. Fase Críticos: Para SKUs com status="critico", aloque necessidade_minima. Ordene por lucro_cbm desc.
2. Fase Oportunidade: Com CBM restante, aloque MAIS unidades dos SKUs com maior lucro_cbm.
   - Para cada SKU ordenado por lucro_cbm desc: qty_extra = floor(cbm_restante_proporcional / cbm_unit)
   - Máximo 25% do CBM total por SKU único
3. REGRA INVIOLÁVEL: CBM_TOTAL final deve estar entre ${(cbmLimit * 0.95).toFixed(1)} e ${cbmLimit} CBMs.
   - Se sobrar espaço, adicione mais unidades dos top SKUs ATÉ atingir 95%
   - NUNCA ultrapassar ${cbmLimit} CBMs

Formato de saída:
{
  "alocacao": [
    {"sku":"FC-138","qty_critico":1659,"qty_extra":800,"qty_total":2459,"cbm_total":6.97,"fase":"critico+oportunidade"},
    {"sku":"FC-02","qty_critico":5367,"qty_extra":200,"qty_total":5567,"cbm_total":7.29,"fase":"critico+oportunidade"}
  ],
  "excluidos_espaco": ["FC-99"],
  "cbm_utilizado": 67.8,
  "cbm_disponivel": ${cbmLimit},
  "pct_utilizacao": 98.3
}`;

  // Merge demanda + metricas
  const merged = demandas.map(d => {
    const m = metricas.find(x => x.sku === d.sku) || {};
    return {
      sku: d.sku,
      necessidade_minima: d.necessidade_minima,
      status: d.status,
      lucro_cbm: m.lucro_cbm || 0,
      cbm_unit: m.cbm_unit || 0,
      classificacao: m.classificacao || 'oportunidade',
    };
  }).filter(d => d.cbm_unit > 0);

  const user = `CBM disponível: ${cbmLimit}\nSKUs para otimizar:\n${JSON.stringify(merged)}`;
  const result = await callClaude(system, user, 4000);
  return parseJSON(result);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AGENTE 6 — COMPARAÇÃO + ESTRATÉGIA
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function agent6_estrategia(knapsack: any, demandas: any[], metricas: any[], skusMap: Record<string, any>): Promise<string> {
  const system = `Você é analista estratégico de compras e S&OP. Gere um relatório em markdown com seções EXATAMENTE neste formato:

## OUTPUT 1 — Plano de Compra Otimizado
(tabela: SKU | Qtd Sugerida | CBM | Custo R$ | Lucro/CBM | Fase | Status)

## OUTPUT 2 — Visão da Demanda
(tabela: SKU | VMD Ajustada | Tendência | Necessidade Mínima | Cobertura Atual | Status)

## OUTPUT 3 — Comparação com Pedido do Usuário
(tabela: SKU | Pedido Usuário | Sugestão IA | Diferença | Impacto R$)

## OUTPUT 4 — Resumo do Container
(métricas consolidadas: CBM, custo total, lucro esperado, SKUs incluídos/excluídos)

## OUTPUT 5 — Análise Estratégica
(trade-offs, riscos, oportunidades, recomendações)

Use dados reais fornecidos. Seja objetivo e direto.`;

  // Build comparison data
  const compData = knapsack.alocacao?.map((a: any) => {
    const s = skusMap[a.sku] || {};
    const m = metricas.find((x: any) => x.sku === a.sku) || {};
    return {
      sku: a.sku,
      pedido_user: s.pedido_user || 0,
      qtd_ia: a.qty_total,
      cbm: a.cbm_total,
      custo_unit: s.custo || 0,
      lucro_cbm: m.lucro_cbm || 0,
      fase: a.fase,
    };
  }) || [];

  const user = `RESULTADO KNAPSACK:
CBM utilizado: ${knapsack.cbm_utilizado} / ${knapsack.cbm_disponivel} (${knapsack.pct_utilizacao}%)
SKUs excluídos por espaço: ${(knapsack.excluidos_espaco || []).join(', ') || 'nenhum'}

DADOS POR SKU:
${JSON.stringify(compData)}

DEMANDAS:
${JSON.stringify(demandas.slice(0, 30))}`;

  return await callClaude(system, user, 5000);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HANDLER PRINCIPAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { skus, cbm_limit = 69, days_horizon = 30 } = await req.json();
    if (!skus?.length) throw new Error('skus array is required');

    // Build lookup map
    const skusMap: Record<string, any> = {};
    for (const s of skus) skusMap[s.sku?.toUpperCase()] = s;

    const steps: string[] = [];
    const log = (msg: string) => { steps.push(msg); console.log('[SOP]', msg); };

    // ── AGENTE 1: Filtros ──
    log('agent1:filtros');
    const filtros = await agent1_filtros(skus);
    const elegíveis = filtros.filter(f => !f.motivo_exclusao);
    const excluídos = filtros.filter(f => f.motivo_exclusao);
    log(`agent1:done — ${elegíveis.length} elegíveis, ${excluídos.length} excluídos`);

    // ── AGENTES 2 + 3 em paralelo ──
    log('agent2:demanda + agent3:cbm');
    const [demandas, cbmMap] = await Promise.all([
      agent2_demanda(filtros, skusMap, days_horizon),
      agent3_cbm(filtros, skusMap),
    ]);
    log(`agent2:done — ${demandas.length} SKUs com demanda calculada`);
    log('agent3:done — CBM por unidade calculado');

    // ── AGENTE 4: Métricas ──
    log('agent4:metricas');
    const metricas = await agent4_metricas(demandas, cbmMap, skusMap);
    log(`agent4:done — ${metricas.length} SKUs com lucro/CBM`);

    // ── AGENTE 5: Knapsack ──
    log('agent5:knapsack');
    const knapsack = await agent5_knapsack(demandas, metricas, cbm_limit);
    log(`agent5:done — ${knapsack.alocacao?.length || 0} SKUs alocados, ${knapsack.cbm_utilizado?.toFixed(1)} CBM`);

    // ── AGENTE 6: Relatório ──
    log('agent6:relatorio');
    const relatorio = await agent6_estrategia(knapsack, demandas, metricas, skusMap);
    log('agent6:done');

    // Build purchase order JSON
    const purchase_order = (knapsack.alocacao || []).map((a: any) => {
      const s = skusMap[a.sku] || {};
      const cbmUnit = cbmMap[a.sku] || 0;
      return {
        sku: a.sku,
        qty: a.qty_total,
        description: s.cat || '',
        price: s.custo || 0,
        cbm: Math.round(a.cbm_total * 100) / 100,
        cbm_unit: Math.round(cbmUnit * 6) / 6,
      };
    });

    return new Response(JSON.stringify({
      answer: relatorio,
      knapsack,
      demandas,
      metricas,
      excluídos,
      purchase_order,
      cbm_utilizado: knapsack.cbm_utilizado,
      pct_utilizacao: knapsack.pct_utilizacao,
      steps,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[SOP] Error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
