import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { shopeeFetch } from '../_shared/shopee-utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://mbxpkqhjapmhehdngfaj.supabase.co';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ieHBrcWhqYXBtaGVoZG5nZmFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzkzMjg5NiwiZXhwIjoyMDg5NTA4ODk2fQ.Z5urVHTv5oLodyYnnXM_RBALEl8Ji_5ld-HNtLjxLjQ';

async function generateSummary(reviewsText: string, rating: number): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return "API da Anthropic não configurada.";

  const prompt = `Você é um analista de qualidade de e-commerce. Leia as seguintes avaliações de clientes que deram ${rating} estrelas para um produto.
Faça um resumo executivo muito breve (2-3 frases) dos principais pontos relatados (sejam reclamações ou elogios).
Em seguida, liste 3-5 palavras-chave principais que resumem o sentimento.
Se não houver avaliações úteis, apenas diga que não há informações suficientes.

Avaliações:
${reviewsText.slice(0, 15000)} /* Limite de segurança */`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return data.content?.[0]?.text ?? "Sem resumo.";
    } else {
      const errText = await res.text();
      console.error("Erro IA:", errText);
      return `Erro detalhado da IA: ${res.status} - ${errText}`;
    }
  } catch (e: any) {
    console.error("Exceção IA:", e);
    return `Erro de conexão ao gerar resumo: ${e.message}`;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { item_id, plataforma, conta, rating } = await req.json();
    if (!item_id || !plataforma || !conta || !rating) {
      return new Response(JSON.stringify({ error: 'Faltam parâmetros' }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    let rawReviews: any[] = [];
    let textsForAi: string[] = [];

    // Buscar avaliações
    if (plataforma === 'ml') {
      const { data: account } = await supabase.from('ml_accounts').select('access_token').eq('nome', conta).maybeSingle();
      if (!account?.access_token) return new Response(JSON.stringify({ error: 'Conta ML não encontrada/sem token' }), { status: 404, headers: corsHeaders });

      const revRes = await fetch(`https://api.mercadolibre.com/reviews/item/${item_id}?rating=${rating}`, {
        headers: { Authorization: `Bearer ${account.access_token}` }
      });
      if (revRes.ok) {
        const revData = await revRes.json();
        rawReviews = (revData.reviews || []).map((r: any) => ({
          date: r.date_created,
          rate: r.rate,
          title: r.title,
          content: r.content,
        }));
        textsForAi = rawReviews.map(r => `[${r.title}] ${r.content}`);
      }
    } else if (plataforma === 'shopee') {
      const { data: account } = await supabase.from('shopee_accounts').select('*').eq('nome', conta).maybeSingle();
      if (!account) return new Response(JSON.stringify({ error: 'Conta Shopee não encontrada' }), { status: 404, headers: corsHeaders });

      // Shopee expects filter_type (1=1star, 2=2star, etc)
      const comments = await shopeeFetch(account, '/api/v2/product/get_comment', {
        item_id: item_id,
        filter_type: String(rating),
        offset: '0',
        page_size: '50',
      });
      if (comments?.response?.item_comment_list) {
        rawReviews = comments.response.item_comment_list.map((c: any) => ({
          date: new Date(c.create_time * 1000).toISOString(),
          rate: c.rating_star,
          title: '',
          content: c.comment,
          buyer: c.buyer_username
        }));
        textsForAi = rawReviews.filter(r => r.content.trim().length > 0).map(r => r.content);
      }
    }

    let summary = "Nenhuma avaliação em texto com esta nota para gerar resumo.";
    if (textsForAi.length > 0) {
      summary = await generateSummary(textsForAi.join('\n\n---\n\n'), rating);
    }

    return new Response(JSON.stringify({ summary, reviews: rawReviews }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
