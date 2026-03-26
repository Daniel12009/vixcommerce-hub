import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-6';

async function callClaude(systemPrompt: string, userContent: string, maxTokens = 1000): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in Supabase secrets');

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error [${res.status}]: ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

function parseJSON(text: string): any {
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean);
}

async function predictCategory(productName: string): Promise<{ id: string; name: string; path: string[] }> {
  try {
    const q = encodeURIComponent(productName);
    const res = await fetch(`https://api.mercadolibre.com/sites/MLB/domain_discovery/search?q=${q}`);
    if (!res.ok) return { id: '', name: '', path: [] };
    const data = await res.json();
    if (data.length > 0) {
      const best = data[0];
      return {
        id: best.category_id || '',
        name: best.category_name || best.domain_name || '',
        path: best.attributes?.map((a: any) => a.name) || [],
      };
    }
  } catch { /* ignore */ }
  return { id: '', name: '', path: [] };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const {
      sku, product_name, product_description,
      price_cost, price_sell, margin, vmd, stock, roas, conversao, conta,
      photo_urls, dimensions,
    } = await req.json();

    if (!sku || !product_name) throw new Error('sku e product_name são obrigatórios');

    const dimensionsText = dimensions?.found ? `
Dimensões do produto: ${dimensions.largura_produto || '?'}cm (L) x ${dimensions.altura_produto || '?'}cm (A) x ${dimensions.profundidade_produto || '?'}cm (P)
Peso do produto: ${dimensions.peso_produto || '?'} kg
Dimensões da embalagem: ${dimensions.largura_embalagem || '?'}cm (L) x ${dimensions.altura_embalagem || '?'}cm (A) x ${dimensions.profundidade_embalagem || '?'}cm (P)
Peso da embalagem: ${dimensions.peso_embalagem || '?'} kg` : 'Dimensões: não informadas';

    const productContext = `
Produto: ${product_name}
SKU: ${sku}
Descrição base: ${product_description || 'não informada'}
Preço de custo: R$ ${price_cost || 'não informado'}
Preço de venda atual: R$ ${price_sell || 'não informado'}
Margem real: ${margin || 'não informada'}%
VMD: ${vmd || 'não informado'} unidades/dia
Estoque atual: ${stock || 'não informado'} unidades
ROAS: ${roas || 'não informado'}
Conversão: ${conversao || 'não informada'}%
Conta: ${conta || 'não informada'}
Marketplace: Mercado Livre Brasil (MLB)
${dimensionsText}
    `.trim();

    // ━━━ BATCH 1: Research + SEO + Category prediction em paralelo ━━━
    const [researchResult, seoResult, mlCategory] = await Promise.all([
      callClaude(
        `Você é especialista em pesquisa de mercado para Mercado Livre Brasil. Retorne APENAS JSON válido (sem markdown):
{"top_competitors":[{"title":string,"price":number}],"price_range":{"min":number,"max":number,"avg":number},"category_trends":[string]}
Limite: 3 concorrentes, 3 tendências.`,
        `Produto:\n${productContext}`,
        600
      ),
      callClaude(
        `Você é especialista em SEO para Mercado Livre Brasil. Retorne APENAS JSON válido:
{"primary_keywords":[string],"secondary_keywords":[string]}
Regras: 5 termos principais + 5 long-tail. Use termos de busca real de compradores.`,
        `Produto:\n${productContext}`,
        400
      ),
      predictCategory(product_name),
    ]);

    let market_research: any = {};
    try { market_research = parseJSON(researchResult); } catch { market_research = { top_competitors: [], price_range: { min: 0, max: 0, avg: 0 }, category_trends: [] }; }

    let seo: any = {};
    try { seo = parseJSON(seoResult); } catch { seo = { primary_keywords: [], secondary_keywords: [] }; }

    // ━━━ BATCH 2: Strategy (usa research) ━━━
    const strategyResult = await callClaude(
      `Você é estrategista de e-commerce para Mercado Livre Brasil. Retorne APENAS JSON válido:
{"positioning":string,"price_suggestion":number,"key_differentials":[string]}
Limite: 1 posicionamento, preço em R$, 3-4 diferenciais.`,
      `Produto:\n${productContext}\nPesquisa:\n${JSON.stringify(market_research)}`,
      400
    );

    let strategy: any = {};
    try { strategy = parseJSON(strategyResult); } catch { strategy = { positioning: '', price_suggestion: price_sell || 0, key_differentials: [] }; }

    // ━━━ BATCH 3: Copywriter + Compliance em paralelo ━━━
    const [copyResult, complianceResult] = await Promise.all([
      callClaude(
        `Você é copywriter especialista em Mercado Livre Brasil. Retorne APENAS JSON válido:
{"title":string,"title_seo":string,"description":string,"highlights":[string]}
REGRAS: título max 60 chars, title_seo max 60 chars com keywords, descrição 200-500 palavras, exatamente 5 highlights com emoji.
Proibido: CAIXA ALTA excessiva, caracteres especiais no título, preços no título.
Se dimensões estiverem disponíveis, mencione-as na descrição.`,
        `Produto:\n${productContext}
Posicionamento: ${strategy.positioning}
Diferenciais: ${strategy.key_differentials?.join(', ') || ''}
Keywords: ${seo.primary_keywords?.join(', ') || ''}, ${seo.secondary_keywords?.join(', ') || ''}`,
        1200
      ),
      callClaude(
        `Você valida anúncios do Mercado Livre Brasil. Retorne APENAS JSON válido:
{"approved":boolean,"issues":[string],"category_suggestion":string,"category_id_hint":string,"warranty_suggestion":string}
Validar: título ≤60 chars, sem proibições, sugerir categoria MLB e garantia.
Se dimensões estiverem disponíveis, validar compatibilidade com a categoria.
IMPORTANTE: A categoria real detectada pela API do ML é: ID=${mlCategory.id} Nome=${mlCategory.name}. Use este ID real no campo category_id_hint.`,
        `Produto: ${product_name}\nSKU: ${sku}\nCategoria detectada: ${mlCategory.id} (${mlCategory.name})\nContexto:\n${productContext}`,
        400
      ),
    ]);

    let copy: any = {};
    try { copy = parseJSON(copyResult); } catch { copy = { title: product_name.slice(0, 60), title_seo: product_name.slice(0, 60), description: '', highlights: [] }; }

    let compliance: any = {};
    try { compliance = parseJSON(complianceResult); } catch { compliance = { approved: true, issues: [], category_suggestion: '', category_id_hint: '', warranty_suggestion: '12 meses' }; }

    // ━━━ MONTAR DRAFT FINAL ━━━
    const adDraft = {
      sku,
      marketplace: 'ml',
      market_research: {
        status: 'done',
        top_competitors: market_research.top_competitors || [],
        price_range: market_research.price_range || { min: 0, max: 0, avg: 0 },
        category_trends: market_research.category_trends || [],
      },
      strategy: {
        status: 'done',
        positioning: strategy.positioning || '',
        price_suggestion: strategy.price_suggestion || price_sell || 0,
        key_differentials: strategy.key_differentials || [],
      },
      copy: {
        status: 'done',
        title: { value: copy.title || '', status: 'done', aiGenerated: true },
        title_seo: { value: copy.title_seo || '', status: 'done', aiGenerated: true },
        description: { value: copy.description || '', status: 'done', aiGenerated: true },
        highlights: { value: copy.highlights || [], status: 'done', aiGenerated: true },
      },
      seo: {
        status: 'done',
        primary_keywords: seo.primary_keywords || [],
        secondary_keywords: seo.secondary_keywords || [],
      },
      compliance: {
        status: 'done',
        approved: compliance.approved ?? true,
        issues: compliance.issues || [],
        category_suggestion: compliance.category_suggestion || mlCategory.name || '',
        category_id_hint: mlCategory.id || compliance.category_id_hint || '',
        warranty_suggestion: compliance.warranty_suggestion || '12 meses',
        compliance_notes: compliance.compliance_notes || '',
      },
      dimensions: dimensions || null,
      overall_status: 'done',
      created_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(adDraft), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('AI Ad Creator error:', message);
    return new Response(JSON.stringify({ error: message, overall_status: 'error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
