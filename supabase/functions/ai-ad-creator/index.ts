import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-6';

async function callClaude(systemPrompt: string, userContent: string): Promise<string> {
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
      max_tokens: 1500,
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
  // Remove markdown fences se presentes
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const {
      sku,
      product_name,
      product_description,
      price_cost,
      price_sell,
      margin,
      vmd,         // vendas média diária
      stock,       // estoque atual
      roas,        // ROAS atual das campanhas
      conversao,   // taxa de conversão atual
      conta,       // nome da conta ML
    } = await req.json();

    if (!sku || !product_name) throw new Error('sku e product_name são obrigatórios');

    const productContext = `
Produto: ${product_name}
SKU: ${sku}
Descrição base: ${product_description || 'não informada'}
Preço de custo: R$ ${price_cost || 'não informado'}
Preço de venda atual: R$ ${price_sell || 'não informado'}
Margem real: ${margin || 'não informada'}%
VMD (vendas médias diárias): ${vmd || 'não informado'} unidades
Estoque atual: ${stock || 'não informado'} unidades
ROAS atual das campanhas: ${roas || 'não informado'}
Taxa de conversão: ${conversao || 'não informada'}%
Conta: ${conta || 'não informada'}
Marketplace: Mercado Livre Brasil (MLB)
    `.trim();

    // ━━━ AGENTE 1: PESQUISA DE MERCADO ━━━
    const researchResult = await callClaude(
      `Você é um especialista em pesquisa de mercado para Mercado Livre Brasil.
Analise o produto e retorne APENAS um JSON válido (sem markdown) com a estrutura:
{
  "top_competitors": [{"title": string, "price": number}], // 3 concorrentes hipotéticos realistas
  "price_range": {"min": number, "max": number, "avg": number},
  "category_trends": [string] // 3 tendências da categoria
}`,
      `Produto para pesquisar:\n${productContext}`
    );

    let market_research: any = {};
    try { market_research = parseJSON(researchResult); } catch { market_research = { top_competitors: [], price_range: { min: 0, max: 0, avg: 0 }, category_trends: [] }; }

    // ━━━ AGENTE 2: ESTRATÉGIA ━━━
    const strategyResult = await callClaude(
      `Você é um estrategista de e-commerce especializado em Mercado Livre Brasil.
Com base nos dados do produto e pesquisa de mercado, retorne APENAS um JSON válido:
{
  "positioning": string, // ex: "melhor preço da categoria" ou "produto premium com melhor custo-benefício"
  "price_suggestion": number, // preço sugerido em reais
  "key_differentials": [string] // 3-5 diferenciais principais para destacar no anúncio
}`,
      `Dados do produto:\n${productContext}\n\nPesquisa de mercado:\n${JSON.stringify(market_research)}`
    );

    let strategy: any = {};
    try { strategy = parseJSON(strategyResult); } catch { strategy = { positioning: '', price_suggestion: price_sell || 0, key_differentials: [] }; }

    // ━━━ AGENTE 3: SEO — keywords ━━━
    const seoResult = await callClaude(
      `Você é especialista em SEO para Mercado Livre Brasil.
Gere palavras-chave de alta conversão para o produto.
Retorne APENAS um JSON válido:
{
  "primary_keywords": [string], // 5 termos principais de alta busca
  "secondary_keywords": [string] // 8 termos long-tail
}
Regras: use termos que compradores reais buscam, inclua variações com e sem acento, sem marcas concorrentes.`,
      `Produto:\n${productContext}\nDiferenciais: ${strategy.key_differentials?.join(', ') || ''}`
    );

    let seo: any = {};
    try { seo = parseJSON(seoResult); } catch { seo = { primary_keywords: [], secondary_keywords: [] }; }

    // ━━━ AGENTE 4: COPYWRITER ━━━
    const copyResult = await callClaude(
      `Você é copywriter especialista em Mercado Livre Brasil, com foco em conversão.
Crie o anúncio completo e retorne APENAS um JSON válido:
{
  "title": string, // MÁXIMO 60 caracteres. Formato: [Keyword principal] + [Diferencial] + [Especificação]. Use maiúsculas estrategicamente.
  "title_seo": string, // versão do título com keywords do SEO integradas naturalmente, também max 60 chars
  "description": string, // descrição completa em português, 300-800 palavras, persuasiva, destaque benefícios, use parágrafos
  "highlights": [string] // exatamente 5 bullet points de benefícios, cada um iniciando com emoji relevante
}
Regras críticas:
- Título NUNCA pode ter mais de 60 caracteres (conta os espaços)
- Proibido: palavras em CAIXA ALTA excessiva, caracteres especiais (!, *, #), preços no título
- Descrição: começar com o benefício principal, não com o nome do produto
- Bullets: cada um deve comunicar um benefício real e específico`,
      `Produto:\n${productContext}
Posicionamento: ${strategy.positioning}
Diferenciais: ${strategy.key_differentials?.join(', ') || ''}
Keywords primárias: ${seo.primary_keywords?.join(', ') || ''}
Keywords secundárias: ${seo.secondary_keywords?.join(', ') || ''}`
    );

    let copy: any = {};
    try { copy = parseJSON(copyResult); } catch { copy = { title: product_name.slice(0, 60), title_seo: product_name.slice(0, 60), description: '', highlights: [] }; }

    // ━━━ AGENTE 5: COMPLIANCE ━━━
    const complianceResult = await callClaude(
      `Você é especialista em políticas do Mercado Livre Brasil.
Valide o anúncio e sugira a categoria correta.
Retorne APENAS um JSON válido:
{
  "approved": boolean,
  "issues": [string], // lista de problemas encontrados (vazia se aprovado)
  "category_suggestion": string, // nome da categoria ML sugerida
  "category_id_hint": string, // ID aproximado da categoria MLB (ex: MLB1648)
  "warranty_suggestion": string, // garantia sugerida ex: "12 meses"
  "compliance_notes": string // observações gerais
}
Validar: título ≤60 chars, sem proibições, descrição sem contato externo, categoria compatível.`,
      `Anúncio gerado:
Título: ${copy.title}
Título SEO: ${copy.title_seo}
Descrição (início): ${(copy.description || '').slice(0, 300)}
Produto: ${productContext}`
    );

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
        category_suggestion: compliance.category_suggestion || '',
        category_id_hint: compliance.category_id_hint || '',
        warranty_suggestion: compliance.warranty_suggestion || '12 meses',
        compliance_notes: compliance.compliance_notes || '',
      },

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
