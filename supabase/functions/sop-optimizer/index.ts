import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CLAUDE_MODEL = 'claude-sonnet-4-6';

// ── Retry-aware Claude caller (only for agent6 report) ──────────────────────
async function callClaude(system: string, user: string, maxTokens = 2000): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const delays = [3000, 8000, 20000, 45000];
  let lastErr = '';

  for (let attempt = 0; attempt <= delays.length; attempt++) {
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

    if (res.ok) {
      const data = await res.json();
      return data.content?.[0]?.text || '';
    }

    const body = await res.text();
    lastErr = `Claude error ${res.status}: ${body}`;

    if (res.status !== 529 || attempt >= delays.length) {
      throw new Error(lastErr);
    }

    console.log(`[SOP] Anthropic overloaded (attempt ${attempt + 1}), retrying in ${delays[attempt]}ms...`);
    await new Promise(r => setTimeout(r, delays[attempt]));
  }

  throw new Error(lastErr);
}

// ── Helper ────────────────────────────────────────────────────────────────────
function num(v: any): number {
  if (!v && v !== 0) return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const s = String(v).replace(/[R$\s%]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AGENTE 1 — FILTROS (100% nativo)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function agent1_filtros(skus: any[]): any[] {
  return skus.map(s => {
    const parar = String(s.parar || s.pararDeTrazer || '').toLowerCase();
    const check = String(s.check || s.checkDemanda || '').toLowerCase();
    const custo = num(s.custo || s.custoProduto);
    const vmd = num(s.vmd || s.mediaVendaDiaria);
    const estoque = num(s.estoque || s.onHand);

    let motivo_exclusao: string | null = null;

    if (parar.includes('não vou mais trazer') || parar.includes('nao vou mais trazer')) {
      motivo_exclusao = 'Parar de trazer';
    } else if (check.includes('não comprar') || check.includes('nao comprar')) {
      motivo_exclusao = 'Check: Não comprar';
    } else if (custo === 0 && vmd === 0 && estoque === 0) {
      motivo_exclusao = 'Sem dados';
    }

    return { sku: s.sku, motivo_exclusao };
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AGENTE 2 — DEMANDA & VMD (100% nativo)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function agent2_demanda(elegiveis: any[], skusMap: Record<string, any>, daysHorizon: number): any[] {
  return elegiveis
    .filter(e => !e.motivo_exclusao)
    .map(e => {
      const s = skusMap[e.sku] || {};
      const vmd = num(s.vmd || s.mediaVendaDiaria);
      const vmd_recente = num(s.vmd_recente || s.vmdRecente);
      const bias = num(s.bias) || 1;
      const total_180d = num(s.total_180d);
      const estoque = num(s.estoque || s.onHand);
      const transito = num(s.transito_bm);
      const dias_seg = num(s.dias_seg) || 15;

      let vmd_ajustada: number;
      let vmd_fonte: string;

      if (total_180d > 0) {
        vmd_ajustada = (total_180d / 180) * bias;
        vmd_fonte = 'vendas_reais';
      } else if (vmd_recente > 0) {
        vmd_ajustada = (vmd * 0.4 + vmd_recente * 0.6) * bias;
        vmd_fonte = 'ponderada';
      } else {
        vmd_ajustada = vmd * bias;
        vmd_fonte = 'planilha';
      }
      if (vmd_ajustada < 0) vmd_ajustada = 0;

      const demanda_periodo = Math.round(vmd_ajustada * daysHorizon);
      const demanda_lead_time = Math.round(vmd_ajustada * 90);
      const estoque_seguranca = Math.round(vmd_ajustada * dias_seg);
      const disponivel = estoque + transito;
      const necessidade_minima = Math.max(0, demanda_periodo + demanda_lead_time + estoque_seguranca - disponivel);
      const dias_cobertura = vmd_ajustada > 0 ? Math.round(disponivel / vmd_ajustada) : 999;
      const status = dias_cobertura < 30 ? 'critico' : dias_cobertura < 90 ? 'risco' : 'ok';

      let tendencia = 'estavel';
      const hm = s.historico_mensal || s.tendenciaMeses;
      if (hm && typeof hm === 'object') {
        const vals = Object.values(hm).map((v: any) => num(v)).filter((v: number) => v > 0);
        if (vals.length >= 6) {
          const half = Math.floor(vals.length / 2);
          const first = vals.slice(0, half).reduce((a: number, b: number) => a + b, 0) / half;
          const last = vals.slice(half).reduce((a: number, b: number) => a + b, 0) / (vals.length - half);
          if (first > 0) {
            const diff = (last - first) / first;
            tendencia = diff >= 0.2 ? 'crescente' : diff <= -0.2 ? 'decrescente' : 'estavel';
          }
        }
      }

      return {
        sku: e.sku,
        vmd_ajustada: Math.round(vmd_ajustada * 100) / 100,
        vmd_fonte,
        demanda_periodo,
        demanda_lead_time,
        estoque_seguranca,
        necessidade_minima: Math.round(necessidade_minima),
        tendencia,
        dias_cobertura,
        status,
      };
    });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AGENTE 3 — CBM POR UNIDADE (100% nativo)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function agent3_cbm(elegiveis: any[], skusMap: Record<string, any>): Record<string, number> {
  const cbmMap: Record<string, number> = {};
  for (const e of elegiveis.filter(e => !e.motivo_exclusao)) {
    const s = skusMap[e.sku] || {};
    if (num(s.cbm_unit) > 0) {
      cbmMap[e.sku] = num(s.cbm_unit);
    } else if (num(s.cbm_tot_user) > 0 && num(s.pedido_user) > 0) {
      cbmMap[e.sku] = num(s.cbm_tot_user) / num(s.pedido_user);
    } else if (num(s.cbmTotal) > 0 && num(s.pedidoSugerido) > 0) {
      cbmMap[e.sku] = num(s.cbmTotal) / num(s.pedidoSugerido);
    } else {
      cbmMap[e.sku] = 0;
    }
  }
  return cbmMap;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AGENTE 4 — MÉTRICAS DE OTIMIZAÇÃO (100% nativo)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function agent4_metricas(demandas: any[], cbmMap: Record<string, number>, skusMap: Record<string, any>): any[] {
  const lucros = demandas.map(d => {
    const s = skusMap[d.sku] || {};
    const custo = num(s.custo || s.custoProduto);
    const margem_raw = num(s.margem || s.margemAtual);
    const margem = margem_raw > 1 ? margem_raw / 100 : margem_raw;
    const taxa_dev = num(s.taxa_dev) / 100 || 0;
    const cbm_unit = cbmMap[d.sku] || 0;

    const preco_venda = margem < 1 && margem > 0 ? custo / (1 - margem) : custo;
    const lucro_unitario = preco_venda * margem * (1 - taxa_dev);
    const lucro_cbm = cbm_unit > 0 ? lucro_unitario / cbm_unit : 0;

    return { sku: d.sku, lucro_unitario, lucro_cbm, status: d.status, cbm_unit, necessidade: d.necessidade_minima };
  });

  const sorted = [...lucros].sort((a, b) => b.lucro_cbm - a.lucro_cbm);
  const top25 = sorted[Math.floor(sorted.length * 0.25)]?.lucro_cbm ?? 0;

  return lucros.map(l => ({
    sku: l.sku,
    lucro_unitario: Math.round(l.lucro_unitario * 100) / 100,
    lucro_cbm: Math.round(l.lucro_cbm * 100) / 100,
    cbm_unit: Math.round(l.cbm_unit * 100000) / 100000,
    classificacao: l.status === 'critico' ? 'critico'
      : l.lucro_cbm >= top25 ? 'alta_eficiencia'
      : l.necessidade > 0 ? 'oportunidade'
      : 'excesso',
  }));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AGENTE 5 — KNAPSACK (100% nativo — greedy por lucro/CBM)
// Fase 1: Críticos → Fase 2: Oportunidade → Fase 3: Top-off ≥95%
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function agent5_knapsack(demandas: any[], metricas: any[], cbmLimit: number): any {
  const items = demandas
    .map(d => {
      const m = metricas.find(x => x.sku === d.sku) || {} as any;
      return {
        sku: d.sku,
        necessidade_minima: d.necessidade_minima || 0,
        status: d.status,
        lucro_cbm: m.lucro_cbm || 0,
        cbm_unit: m.cbm_unit || 0,
      };
    })
    .filter(d => d.cbm_unit > 0);

  const byLucroCbm = [...items].sort((a, b) => b.lucro_cbm - a.lucro_cbm);
  const maxPerSku = cbmLimit * 0.25;
  let cbmUsed = 0;

  const alloc: Record<string, { qty_critico: number; qty_extra: number; cbm: number }> = {};
  for (const s of items) alloc[s.sku] = { qty_critico: 0, qty_extra: 0, cbm: 0 };

  // ── FASE 1: Críticos ──
  for (const s of byLucroCbm.filter(s => s.status === 'critico')) {
    if (s.necessidade_minima <= 0 || s.cbm_unit <= 0) continue;
    const maxQty = Math.floor(maxPerSku / s.cbm_unit);
    const qty = Math.min(s.necessidade_minima, maxQty);
    const cbmNeeded = qty * s.cbm_unit;
    if (cbmUsed + cbmNeeded > cbmLimit) {
      const possible = Math.floor((cbmLimit - cbmUsed) / s.cbm_unit);
      alloc[s.sku].qty_critico = possible;
      alloc[s.sku].cbm += possible * s.cbm_unit;
      cbmUsed += possible * s.cbm_unit;
    } else {
      alloc[s.sku].qty_critico = qty;
      alloc[s.sku].cbm += cbmNeeded;
      cbmUsed += cbmNeeded;
    }
  }

  // ── FASE 2: Oportunidade greedy ──
  for (const s of byLucroCbm) {
    if (cbmUsed >= cbmLimit || s.cbm_unit <= 0) continue;
    const slotLeft = Math.min(cbmLimit - cbmUsed, maxPerSku - alloc[s.sku].cbm);
    if (slotLeft <= 0) continue;
    const qtyExtra = Math.floor(slotLeft / s.cbm_unit);
    if (qtyExtra <= 0) continue;
    alloc[s.sku].qty_extra += qtyExtra;
    alloc[s.sku].cbm += qtyExtra * s.cbm_unit;
    cbmUsed += qtyExtra * s.cbm_unit;
  }

  // ── FASE 3: Top-off to 95% ──
  const target95 = cbmLimit * 0.95;
  for (const s of byLucroCbm) {
    if (cbmUsed >= target95 || s.cbm_unit <= 0) continue;
    const qtyTopOff = Math.floor((cbmLimit - cbmUsed) / s.cbm_unit);
    if (qtyTopOff <= 0) continue;
    alloc[s.sku].qty_extra += qtyTopOff;
    alloc[s.sku].cbm += qtyTopOff * s.cbm_unit;
    cbmUsed += qtyTopOff * s.cbm_unit;
  }

  const alocacao = byLucroCbm
    .filter(s => (alloc[s.sku].qty_critico + alloc[s.sku].qty_extra) > 0)
    .map(s => ({
      sku: s.sku,
      qty_critico: alloc[s.sku].qty_critico,
      qty_extra: alloc[s.sku].qty_extra,
      qty_total: alloc[s.sku].qty_critico + alloc[s.sku].qty_extra,
      cbm_total: Math.round(alloc[s.sku].cbm * 1000) / 1000,
      fase: alloc[s.sku].qty_critico > 0 && alloc[s.sku].qty_extra > 0
        ? 'critico+oportunidade'
        : alloc[s.sku].qty_critico > 0 ? 'critico' : 'oportunidade',
    }));

  return {
    alocacao,
    excluidos_espaco: byLucroCbm.filter(s => (alloc[s.sku].qty_critico + alloc[s.sku].qty_extra) === 0).map(s => s.sku),
    cbm_utilizado: Math.round(cbmUsed * 100) / 100,
    cbm_disponivel: cbmLimit,
    pct_utilizacao: Math.round((cbmUsed / cbmLimit) * 1000) / 10,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AGENTE 6 — COMPARAÇÃO + ESTRATÉGIA (Claude com retry)
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

  const compData = knapsack.alocacao?.map((a: any) => {
    const s = skusMap[a.sku] || {};
    const m = metricas.find((x: any) => x.sku === a.sku) || {};
    return {
      sku: a.sku,
      pedido_user: s.pedido_user || s.pedidoSugerido || 0,
      qtd_ia: a.qty_total,
      cbm: a.cbm_total,
      custo_unit: s.custo || s.custoProduto || 0,
      lucro_cbm: (m as any).lucro_cbm || 0,
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
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { skus, cbm_limit = 69, days_horizon = 30 } = await req.json();
    if (!skus?.length) throw new Error('skus array is required');

    const skusMap: Record<string, any> = {};
    for (const s of skus) skusMap[String(s.sku || '').toUpperCase()] = s;

    const steps: string[] = [];
    const log = (msg: string) => { steps.push(msg); console.log('[SOP]', msg); };

    // ── Agente 1 (nativo) ──
    log('agent1:filtros');
    const filtros = agent1_filtros(skus);
    const elegiveis = filtros.filter(f => !f.motivo_exclusao);
    const excluidos = filtros.filter(f => f.motivo_exclusao);
    log(`agent1:done — ${elegiveis.length} elegíveis, ${excluidos.length} excluídos`);

    // ── Agentes 2 + 3 (nativos) ──
    log('agent2:demanda + agent3:cbm');
    const demandas = agent2_demanda(filtros, skusMap, days_horizon);
    const cbmMap = agent3_cbm(filtros, skusMap);
    log(`agent2:done — ${demandas.length} SKUs`);
    log('agent3:done');

    // ── Agente 4 (nativo) ──
    log('agent4:metricas');
    const metricas = agent4_metricas(demandas, cbmMap, skusMap);
    log(`agent4:done — ${metricas.length} SKUs`);

    // ── Agente 5 (nativo — Knapsack greedy) ──
    log('agent5:knapsack');
    const knapsack = agent5_knapsack(demandas, metricas, cbm_limit);
    log(`agent5:done — ${knapsack.alocacao?.length || 0} SKUs, ${knapsack.cbm_utilizado} CBM (${knapsack.pct_utilizacao}%)`);

    // ── Agente 6 (Claude — relatório estratégico) ──
    log('agent6:relatorio');
    const relatorio = await agent6_estrategia(knapsack, demandas, metricas, skusMap);
    log('agent6:done');

    const purchase_order = (knapsack.alocacao || []).map((a: any) => {
      const s = skusMap[a.sku] || {};
      const cbmUnit = cbmMap[a.sku] || 0;
      return {
        sku: a.sku,
        qty: a.qty_total,
        description: s.cat || s.categoria || '',
        price: s.custo || s.custoProduto || 0,
        cbm: Math.round(a.cbm_total * 100) / 100,
        cbm_unit: Math.round(cbmUnit * 100000) / 100000,
      };
    });

    return new Response(JSON.stringify({
      answer: relatorio,
      knapsack,
      demandas,
      metricas,
      excluidos,
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
