import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ML_API = 'https://api.mercadolibre.com';

async function sb(path: string, options: RequestInit = {}) {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const res = await fetch(`${url}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
      ...(options.headers as Record<string, string> || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${path}: ${await res.text()}`);
  return res.json();
}

async function mlSearch(q: string, categoryId: string | null, limit: number, token: string | null): Promise<any[]> {
  let url = `${ML_API}/sites/MLB/search?sort=sold_quantity_desc&limit=${Math.min(limit, 50)}`;
  if (q) url += `&q=${encodeURIComponent(q)}`;
  if (categoryId) url += `&category=${categoryId}`;

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.warn(`[collector] ML search failed: ${await res.text()}`);
    return [];
  }
  const data = await res.json();
  return data.results || [];
}

async function getMLToken(): Promise<string | null> {
  try {
    const accounts = await sb('/ml_accounts?ativo=eq.true&select=access_token,token_expires_at&limit=1');
    if (!accounts?.length) return null;
    const acc = accounts[0];
    if (acc.token_expires_at && new Date(acc.token_expires_at) > new Date()) {
      return acc.access_token;
    }
    return null;
  } catch { return null; }
}

async function collectSegment(segment: any, token: string | null) {
  console.log(`[collector] Collecting segment: ${segment.nome}`);
  const results = await mlSearch(
    segment.keyword || '',
    segment.category_id || null,
    segment.top_n || 50,
    token
  );

  if (!results.length) {
    console.log(`[collector] No results for: ${segment.nome}`);
    return 0;
  }

  const snapshots = results.slice(0, segment.top_n || 50).map((item: any, idx: number) => ({
    segment_id: segment.id,
    item_id: item.id,
    seller_id: String(item.seller?.id || ''),
    seller_nick: item.seller?.nickname || '',
    titulo: item.title || '',
    posicao: idx + 1,
    preco: item.price || 0,
    vendas_estimadas: item.sold_quantity || item.available_quantity || 0,
    free_shipping: item.shipping?.free_shipping || false,
    listing_type: item.listing_type_id || '',
    coletado_em: new Date().toISOString(),
  }));

  // Upsert in batches of 50
  for (let i = 0; i < snapshots.length; i += 50) {
    await sb('/market_snapshots', {
      method: 'POST',
      body: JSON.stringify(snapshots.slice(i, i + 50)),
      headers: { Prefer: 'resolution=ignore-duplicates' },
    });
  }

  // Delete old snapshots (keep last 30 days) to avoid bloat
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  await fetch(
    `${Deno.env.get('SUPABASE_URL')}/rest/v1/market_snapshots?segment_id=eq.${segment.id}&coletado_em=lt.${cutoff}`,
    {
      method: 'DELETE',
      headers: {
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
      },
    }
  );

  return snapshots.length;
}

async function collectSellers(token: string | null) {
  const sellers: any[] = await sb('/market_sellers?ativo=eq.true');
  if (!sellers?.length) return;

  for (const seller of sellers) {
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${ML_API}/users/${seller.seller_id}`, { headers });
      if (!res.ok) continue;
      const user = await res.json();

      const rep = user.seller_reputation || {};
      const snapshot = {
        seller_id_ref: seller.id,
        reputacao: rep.power_seller_status || rep.level_id || '',
        nivel: rep.level_id || '',
        total_itens: user.listings_count || 0,
        health_score: 0,
        transactions_total: rep.transactions?.total || 0,
        negative_rating: rep.transactions?.ratings?.negative || 0,
        coletado_em: new Date().toISOString(),
      };
      await sb('/seller_snapshots', { method: 'POST', body: JSON.stringify(snapshot) });

      // Update nickname in market_sellers
      if (user.nickname && user.nickname !== seller.nickname) {
        await sb(`/market_sellers?id=eq.${seller.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ nickname: user.nickname }),
        });
      }
    } catch (e) {
      console.warn(`[collector] Seller ${seller.seller_id} failed:`, e);
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  console.log('[collector] Market Collector started');
  const startTime = Date.now();

  try {
    const token = await getMLToken();
    console.log(`[collector] ML token: ${token ? 'available' : 'not available (public mode)'}`);

    const segments: any[] = await sb('/market_segments?ativo=eq.true&order=criado_em.asc');
    console.log(`[collector] ${segments.length} active segments`);

    let totalSnapshots = 0;
    for (const segment of segments) {
      try {
        const count = await collectSegment(segment, token);
        totalSnapshots += count;
        // Small delay between requests to respect rate limits
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.error(`[collector] Failed segment ${segment.nome}:`, e);
      }
    }

    await collectSellers(token);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[collector] Done in ${elapsed}s. Total snapshots: ${totalSnapshots}`);

    return new Response(JSON.stringify({
      ok: true,
      segments_collected: segments.length,
      snapshots_saved: totalSnapshots,
      elapsed_seconds: parseFloat(elapsed),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[collector] Fatal error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
