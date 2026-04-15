import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function supabaseFetch(path: string, supabaseUrl: string, serviceKey: string) {
  const res = await fetch(`${supabaseUrl}/rest/v1${path}`, {
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
  });
  return res.json();
}

async function refreshToken(account: any, supabaseUrl: string, serviceKey: string): Promise<string> {
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
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const data = await res.json();
  await fetch(`${supabaseUrl}/rest/v1/ml_accounts?id=eq.${account.id}`, {
    method: 'PATCH',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    }),
  });
  return data.access_token;
}

async function mlGet(account: any, path: string, supabaseUrl: string, serviceKey: string): Promise<any> {
  let token = account.access_token;
  if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
    token = await refreshToken(account, supabaseUrl, serviceKey);
  }
  const res = await fetch(`https://api.mercadolibre.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    token = await refreshToken(account, supabaseUrl, serviceKey);
    const res2 = await fetch(`https://api.mercadolibre.com${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res2.ok) return null;
    return res2.json();
  }
  if (!res.ok) return null;
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { account_id, mode } = await req.json();

    const supabaseUrl = (Deno.env.get('EXTERNAL_DB_URL') || Deno.env.get('SUPABASE_URL'))!;
    const serviceKey = (Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;

    // Buscar contas ML
    const accountsPath = account_id
      ? `/ml_accounts?id=eq.${account_id}&ativo=eq.true`
      : '/ml_accounts?ativo=eq.true';
    const accounts = await supabaseFetch(accountsPath, supabaseUrl, serviceKey);
    if (!accounts?.length) throw new Error('No ML accounts found');

    const result: any = { accounts_analyzed: accounts.length, timestamp: new Date().toISOString() };

    // ━━━ ESTOQUE EM TEMPO REAL ━━━
    if (!mode || mode === 'all' || mode === 'estoque') {
      const estoqueML: any[] = [];
      for (const account of accounts.slice(0, 3)) {
        try {
          let sellerId = account.seller_id;
          if (!sellerId) {
            const me = await mlGet(account, '/users/me', supabaseUrl, serviceKey);
            sellerId = me?.id;
          }
          if (!sellerId) continue;

          const searchData = await mlGet(account, `/users/${sellerId}/items/search?status=active&limit=50`, supabaseUrl, serviceKey);
          const itemIds: string[] = searchData?.results || [];
          if (itemIds.length === 0) continue;

          for (let i = 0; i < Math.min(itemIds.length, 100); i += 20) {
            const batch = itemIds.slice(i, i + 20).join(',');
            const batchData = await mlGet(account, `/items?ids=${batch}&attributes=id,title,available_quantity,status,seller_custom_field,price`, supabaseUrl, serviceKey);
            if (!Array.isArray(batchData)) continue;
            for (const item of batchData) {
              if (item.code === 200 && item.body) {
                estoqueML.push({
                  item_id: item.body.id,
                  sku: item.body.seller_custom_field || '',
                  titulo: item.body.title?.slice(0, 60) || '',
                  estoque_ml: item.body.available_quantity || 0,
                  preco: item.body.price || 0,
                  status: item.body.status,
                  conta: account.nome,
                });
              }
            }
          }
        } catch (e) {
          console.error(`Estoque error for ${account.nome}:`, e);
        }
      }
      result.estoque_ml = {
        total_items: estoqueML.length,
        criticos: estoqueML.filter(e => e.estoque_ml < 5 && e.estoque_ml >= 0).sort((a, b) => a.estoque_ml - b.estoque_ml),
        zerados: estoqueML.filter(e => e.estoque_ml === 0),
        todos: estoqueML,
      };
    }

    // ━━━ ADS AO VIVO ━━━
    if (!mode || mode === 'all' || mode === 'ads') {
      const adsLive: any[] = [];
      const now = new Date();
      const dateFrom = now.toISOString().split('T')[0];
      const dateTo = dateFrom;

      for (const account of accounts.slice(0, 3)) {
        try {
          let token = account.access_token;
          if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
            token = await refreshToken(account, supabaseUrl, serviceKey);
          }
          const advRes = await fetch('https://api.mercadolibre.com/advertising/advertisers?product_id=PADS', {
            headers: { 'Authorization': `Bearer ${token}`, 'Api-Version': '1' },
          });
          if (!advRes.ok) continue;
          const advData = await advRes.json();
          const mlbAdv = (advData?.advertisers || []).find((a: any) => a.site_id === 'MLB');
          if (!mlbAdv) continue;

          const metricsFields = 'clicks,prints,ctr,cost,cpc,roas,total_amount';
          const adsRes = await fetch(
            `https://api.mercadolibre.com/advertising/MLB/advertisers/${mlbAdv.advertiser_id}/product_ads/ads/search?limit=50&offset=0&date_from=${dateFrom}&date_to=${dateTo}&metrics=${metricsFields}&sort_by=cost&sort=desc`,
            { headers: { 'Authorization': `Bearer ${token}`, 'Api-Version': '2' } }
          );
          if (!adsRes.ok) continue;
          const adsData = await adsRes.json();
          for (const ad of (adsData?.results || [])) {
            adsLive.push({
              item_id: ad.item_id,
              titulo: ad.title?.slice(0, 50) || '',
              investimento_hoje: ad.metrics?.cost || 0,
              receita_hoje: ad.metrics?.total_amount || 0,
              roas_hoje: ad.metrics?.roas || 0,
              cliques: ad.metrics?.clicks || 0,
              conta: account.nome,
            });
          }
        } catch (e) {
          console.error(`ADS error for ${account.nome}:`, e);
        }
      }

      result.ads_live = {
        data_referencia: dateFrom,
        total_campanhas: adsLive.length,
        roas_zero: adsLive.filter(a => a.roas_hoje === 0 && a.investimento_hoje > 0),
        top_performers: adsLive.filter(a => a.roas_hoje > 5).sort((a, b) => b.roas_hoje - a.roas_hoje).slice(0, 10),
        gasto_total_hoje: adsLive.reduce((s, a) => s + a.investimento_hoje, 0),
        receita_total_hoje: adsLive.reduce((s, a) => s + a.receita_hoje, 0),
        todos: adsLive,
      };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('ai-analyst-context error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
