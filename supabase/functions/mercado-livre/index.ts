import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ML_API = 'https://api.mercadolibre.com';

// Supabase client to read ml_accounts table
async function getSupabaseClient() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return { url, key };
}

async function supabaseFetch(path: string, options: any = {}) {
  const { url, key } = await getSupabaseClient();
  const res = await fetch(`${url}/rest/v1${path}`, {
    ...options,
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers,
    },
  });
  return res;
}

// Refresh ML access token
async function refreshToken(account: any): Promise<string> {
  const res = await fetch(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: account.client_id,
      client_secret: account.client_secret,
      refresh_token: account.refresh_token,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed for ${account.nome}: ${err}`);
  }

  const data = await res.json();
  
  // Update tokens in database
  await supabaseFetch(`/ml_accounts?id=eq.${account.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_expires_at: new Date(Date.now() + (data.expires_in * 1000)).toISOString(),
    }),
  });

  return data.access_token;
}

// Make authenticated ML API call (auto-refresh if 401)
async function mlFetch(account: any, path: string): Promise<any> {
  let token = account.access_token;

  // Check if token is expired
  if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
    token = await refreshToken(account);
  }

  let res = await fetch(`${ML_API}${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  // If 401, try refreshing token
  if (res.status === 401) {
    token = await refreshToken(account);
    res = await fetch(`${ML_API}${path}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ML API error [${res.status}]: ${err}`);
  }

  return res.json();
}

// Make authenticated ML API write call (PUT/POST with body)
async function mlFetchWrite(account: any, path: string, method: 'PUT' | 'POST', body: any): Promise<any> {
  let token = account.access_token;
  if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
    token = await refreshToken(account);
  }

  const doFetch = (t: string) => fetch(`${ML_API}${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let res = await doFetch(token);
  if (res.status === 401) {
    token = await refreshToken(account);
    res = await doFetch(token);
  }

  const text = await res.text();
  if (!res.ok) throw new Error(`ML API error [${res.status}]: ${text}`);
  try { return JSON.parse(text); } catch { return {}; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, account_id, sku, item_id, fields, description_text, new_item, query, status: reqStatus, offset: reqOffset, limit: reqLimit, date_from: reqDateFrom, date_to: reqDateTo, campaign_id: reqCampaignId, budget: reqBudget, roas_target: reqRoasTarget } = await req.json();

    if (action === 'list_accounts') {
      const res = await supabaseFetch('/ml_accounts?ativo=eq.true&select=id,nome,seller_id');
      const accounts = await res.json();
      return new Response(JSON.stringify(accounts), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_today_orders') {
      // Get all active accounts or specific one
      let accountsRes;
      if (account_id) {
        accountsRes = await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`);
      } else {
        accountsRes = await supabaseFetch('/ml_accounts?ativo=eq.true');
      }
      const accounts = await accountsRes.json();

      if (!accounts || accounts.length === 0) {
        return new Response(JSON.stringify({ orders: [], error: 'No ML accounts configured' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get today's date range in São Paulo time (UTC-3)
      const now = new Date();
      const spOffset = -3 * 60; // São Paulo UTC-3
      const localNow = new Date(now.getTime() + (spOffset + now.getTimezoneOffset()) * 60000);
      const todayStart = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate(), 0, 0, 0);
      // Convert back to UTC for API
      const dateFrom = new Date(todayStart.getTime() - (spOffset + now.getTimezoneOffset()) * 60000).toISOString();
      const dateTo = now.toISOString();

      const allOrders: any[] = [];

      for (const account of accounts) {
        try {
          // Get seller_id if not set
          let sellerId = account.seller_id;
          if (!sellerId) {
            const me = await mlFetch(account, '/users/me');
            sellerId = me.id;
            await supabaseFetch(`/ml_accounts?id=eq.${account.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ seller_id: String(sellerId) }),
            });
          }

          // Fetch ALL orders with pagination
          let offset = 0;
          const limit = 50;
          let hasMore = true;

          while (hasMore) {
            const ordersData = await mlFetch(
              account,
              `/orders/search?seller=${sellerId}&order.date_created.from=${dateFrom}&order.date_created.to=${dateTo}&sort=date_desc&limit=${limit}&offset=${offset}`
            );

            const results = ordersData.results || [];
            const total = ordersData.paging?.total || 0;

            const orders = results.map((o: any) => ({
              id: o.id,
              status: o.status,
              date_created: o.date_created,
              total_amount: o.total_amount,
              currency_id: o.currency_id,
              buyer: o.buyer?.nickname || o.buyer?.first_name || 'N/A',
              items: (o.order_items || []).map((item: any) => ({
                title: item.item?.title || '',
                sku: item.item?.seller_sku || '',
                quantity: item.quantity,
                unit_price: item.unit_price,
              })),
              conta: account.nome,
              account_id: account.id,
            }));

            allOrders.push(...orders);
            offset += limit;
            hasMore = offset < total;
          }
        } catch (err) {
          console.error(`Error fetching orders for ${account.nome}:`, err);
          allOrders.push({ error: `${account.nome}: ${err instanceof Error ? err.message : 'Unknown error'}`, conta: account.nome });
        }
      }

      return new Response(JSON.stringify({ orders: allOrders }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_pending_shipments') {
      // Step 1: Get accounts
      const accountsRes = account_id
        ? await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`)
        : await supabaseFetch('/ml_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();

      if (!accounts || accounts.length === 0) {
        return new Response(JSON.stringify({ shipments: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const allShipments: any[] = [];

      for (const account of accounts) {
        try {
          let sellerId = account.seller_id;
          if (!sellerId) {
            const me = await mlFetch(account, '/users/me');
            sellerId = me.id;
            await supabaseFetch(`/ml_accounts?id=eq.${account.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ seller_id: String(sellerId) }),
            });
          }

          // Fetch recent paid orders (last 7 days)
          const now = new Date();
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

          let offset = 0;
          const limit = 50;
          let hasMore = true;

          while (hasMore) {
            const url = `/orders/search?seller=${sellerId}&order.status=paid&order.date_created.from=${weekAgo.toISOString()}&order.date_created.to=${now.toISOString()}&sort=date_desc&limit=${limit}&offset=${offset}`;
            
            let ordersData;
            try {
              ordersData = await mlFetch(account, url);
            } catch (fetchErr) {
              console.error(`ML fetch error for ${account.nome}:`, fetchErr);
              allShipments.push({ error: `${account.nome}: ${fetchErr instanceof Error ? fetchErr.message : 'API error'}`, conta: account.nome });
              break;
            }

            const results = ordersData.results || [];
            const total = ordersData.paging?.total || 0;

            for (const o of results) {
              const shippingStatus = o.shipping?.status || '';
              if (shippingStatus && shippingStatus !== 'delivered' && shippingStatus !== 'cancelled') {
                allShipments.push({
                  orderId: o.id,
                  status: o.status,
                  shippingStatus,
                  dateCreated: o.date_created,
                  totalAmount: o.total_amount,
                  buyer: o.buyer?.nickname || o.buyer?.first_name || 'N/A',
                  items: (o.order_items || []).map((item: any) => ({
                    title: item.item?.title || '',
                    sku: item.item?.seller_sku || '',
                    quantity: item.quantity,
                    unitPrice: item.unit_price,
                  })),
                  conta: account.nome,
                  accountId: account.id,
                  logisticType: o.shipping?.logistic_type || '',
                });
              }
            }

            offset += limit;
            hasMore = offset < total;
          }
        } catch (err) {
          console.error(`Error for ${account.nome}:`, err);
          allShipments.push({ error: `${account.nome}: ${err instanceof Error ? err.message : 'Unknown'}`, conta: account.nome });
        }
      }

      return new Response(JSON.stringify({ shipments: allShipments }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ━━━ FICHA TÉCNICA: Listing management actions ━━━

    if (action === 'list_seller_items') {
      const accountsRes = account_id
        ? await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`)
        : await supabaseFetch('/ml_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();
      if (!accounts?.length) return new Response(JSON.stringify({ items: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const account = accounts[0];
      let sellerId = account.seller_id;
      if (!sellerId) {
        const me = await mlFetch(account, '/users/me');
        sellerId = me.id;
        await supabaseFetch(`/ml_accounts?id=eq.${account.id}`, { method: 'PATCH', body: JSON.stringify({ seller_id: String(sellerId) }) });
      }

      const off = reqOffset || 0;
      const lim = Math.min(reqLimit || 50, 100);
      let searchUrl = `/users/${sellerId}/items/search?offset=${off}&limit=${lim}`;
      if (reqStatus && reqStatus !== 'all') searchUrl += `&status=${reqStatus}`;
      const searchData = await mlFetch(account, searchUrl);
      const itemIds = searchData.results || [];
      const total = searchData.paging?.total || 0;

      // Fetch basic info for all items in parallel (batches of 20)
      const items: any[] = [];
      for (let i = 0; i < itemIds.length; i += 20) {
        const batch = itemIds.slice(i, i + 20);
        const ids = batch.join(',');
        if (!ids) continue;
        const batchData = await mlFetch(account, `/items?ids=${ids}&attributes=id,title,price,thumbnail,available_quantity,status,sub_status,seller_custom_field,variations,catalog_listing,listing_type_id,shipping,tags,date_created`);
        for (const item of batchData) {
          if (item.code === 200 && item.body) {
            const b = item.body;
            const skus = (b.variations || []).map((v: any) => {
              const skuAttr = (v.attribute_combinations || []).find((a: any) => a.id === 'SELLER_SKU');
              return skuAttr?.value_name || '';
            }).filter(Boolean);
            items.push({
              id: b.id,
              title: b.title,
              price: b.price,
              thumbnail: b.thumbnail,
              available_quantity: b.available_quantity,
              status: b.status,
              sub_status: b.sub_status || [],
              seller_sku: b.seller_custom_field || skus[0] || '',
              skus,
              conta: account.nome,
              catalog_listing: b.catalog_listing || false,
              listing_type_id: b.listing_type_id || '',
              logistic_type: b.shipping?.logistic_type || '',
              tags: b.tags || [],
              date_created: b.date_created || '',
            });
          }
        }
      }

      // Post-filter: ML search index can be stale — remove items that don't match requested status
      const filteredItems = (reqStatus && reqStatus !== 'all')
        ? items.filter((it: any) => it.status === reqStatus)
        : items;

      return new Response(JSON.stringify({ items: filteredItems, total, offset: off, limit: lim }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'search_items_by_sku') {
      if (!sku) throw new Error('SKU is required');
      const accountsRes = account_id
        ? await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`)
        : await supabaseFetch('/ml_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();
      if (!accounts?.length) return new Response(JSON.stringify({ items: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const allItems: any[] = [];
      for (const account of accounts) {
        try {
          let sellerId = account.seller_id;
          if (!sellerId) {
            const me = await mlFetch(account, '/users/me');
            sellerId = me.id;
            await supabaseFetch(`/ml_accounts?id=eq.${account.id}`, { method: 'PATCH', body: JSON.stringify({ seller_id: String(sellerId) }) });
          }

          // Search by seller_sku
          const searchData = await mlFetch(account, `/users/${sellerId}/items/search?seller_sku=${encodeURIComponent(sku)}&limit=20`);
          const itemIds = searchData.results || [];

          for (const itemId of itemIds) {
            try {
              const item = await mlFetch(account, `/items/${itemId}?attributes=id,title,price,thumbnail,available_quantity,status,seller_custom_field,variations`);
              const skus = (item.variations || []).map((v: any) => {
                const skuAttr = (v.attribute_combinations || []).find((a: any) => a.id === 'SELLER_SKU');
                return skuAttr?.value_name || '';
              }).filter(Boolean);
              allItems.push({
                id: item.id,
                title: item.title,
                price: item.price,
                thumbnail: item.thumbnail,
                available_quantity: item.available_quantity,
                status: item.status,
                seller_sku: item.seller_custom_field || skus[0] || '',
                skus,
                conta: account.nome,
                account_id: account.id,
              });
            } catch {}
          }
        } catch (err) {
          console.error(`SKU search error for ${account.nome}:`, err);
        }
      }

      return new Response(JSON.stringify({ items: allItems }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'get_item_detail') {
      if (!item_id) throw new Error('item_id is required');
      const accountsRes = account_id
        ? await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`)
        : await supabaseFetch('/ml_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();
      if (!accounts?.length) throw new Error('No ML account found');

      const account = accounts[0];
      const [item, descData, promotions] = await Promise.all([
        mlFetch(account, `/items/${item_id}`),
        mlFetch(account, `/items/${item_id}/description`).catch(() => ({ plain_text: '' })),
        mlFetch(account, `/items/${item_id}/promotions`).catch(() => []),
      ]);

      // Extract health/quality info from tags
      const tags = item.tags || [];
      const health = {
        good_quality_thumbnail: tags.includes('good_quality_thumbnail'),
        good_quality_picture: tags.includes('good_quality_picture'),
        dragged_bids_and_visits: tags.includes('dragged_bids_and_visits'),
        catalog_listing: item.catalog_listing || false,
      };

      return new Response(JSON.stringify({
        ...item,
        description_text: descData.plain_text || descData.text || '',
        promotions: Array.isArray(promotions) ? promotions : [],
        health,
        conta: account.nome,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'update_item') {
      if (!item_id || !fields) throw new Error('item_id and fields are required');
      const accountsRes = account_id
        ? await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`)
        : await supabaseFetch('/ml_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();
      if (!accounts?.length) throw new Error('No ML account found');

      const account = accounts[0];
      const result = await mlFetchWrite(account, `/items/${item_id}`, 'PUT', fields);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'update_description') {
      if (!item_id || !description_text) throw new Error('item_id and description_text required');
      const accountsRes = account_id
        ? await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`)
        : await supabaseFetch('/ml_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();
      if (!accounts?.length) throw new Error('No ML account found');

      const account = accounts[0];
      const result = await mlFetchWrite(account, `/items/${item_id}/description`, 'PUT', { plain_text: description_text });
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (action === 'create_item') {
      if (!new_item) throw new Error('new_item data is required');
      const accountsRes = account_id
        ? await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`)
        : await supabaseFetch('/ml_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();
      if (!accounts?.length) throw new Error('No ML account found');

      const account = accounts[0];
      const result = await mlFetchWrite(account, '/items', 'POST', new_item);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'upload_picture') {
      if (!item_id) throw new Error('item_id is required');
      const { picture_url } = await Promise.resolve({ picture_url: (fields as any)?.picture_url });
      if (!picture_url) throw new Error('picture_url is required in fields');
      const accountsRes = account_id
        ? await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`)
        : await supabaseFetch('/ml_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();
      if (!accounts?.length) throw new Error('No ML account found');

      const account = accounts[0];
      // First get current pictures
      const item = await mlFetch(account, `/items/${item_id}?attributes=pictures`);
      const existingPics = (item.pictures || []).map((p: any) => ({ id: p.id }));
      // Add new picture by URL
      existingPics.push({ source: picture_url });
      const result = await mlFetchWrite(account, `/items/${item_id}`, 'PUT', { pictures: existingPics });
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'search_categories') {
      if (!query) throw new Error('query is required');
      const res = await fetch(`${ML_API}/sites/MLB/categories/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'predict_category') {
      if (!query) throw new Error('query (title) is required');
      const res = await fetch(`${ML_API}/sites/MLB/domain_discovery/search?q=${encodeURIComponent(query)}&limit=5`);
      const data = await res.json();
      // Return simplified results
      const categories = Array.isArray(data) ? data.map((d: any) => ({
        domain_id: d.domain_id,
        domain_name: d.domain_name,
        category_id: d.category_id,
        category_name: d.category_name,
        attributes: (d.attributes || []).slice(0, 5),
      })) : [];
      return new Response(JSON.stringify(categories), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'get_ads_data') {
      // ML Product Ads API — Official 2026 docs
      // Step 1: Discover advertiser_id via /advertising/advertisers?product_id=PADS
      // Step 2: Fetch campaigns via /advertising/{site}/advertisers/{adv_id}/product_ads/campaigns/search
      // Step 3: Fetch ads via /advertising/{site}/advertisers/{adv_id}/product_ads/ads/search

      const accountsRes = account_id
        ? await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`)
        : await supabaseFetch('/ml_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();
      if (!accounts?.length) return new Response(JSON.stringify({ campaigns: [], items: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const allCampaigns: any[] = [];
      const allAdItems: any[] = [];

      const now = new Date();
      const dateFrom = reqDateFrom || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const dateTo = reqDateTo || now.toISOString().split('T')[0];

      // Fetch all product types: PADS, BADS, DISPLAY
      const productTypes = ['PADS', 'BADS', 'DISPLAY'];

      for (const account of accounts) {
        try {
          // Generic authenticated fetch for ads endpoints
          const adsFetchRaw = async (url: string, apiVersion: string) => {
            let token = account.access_token;
            const doFetch = (t: string) => fetch(url, {
              headers: { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json', 'Api-Version': apiVersion },
            });
            let res = await doFetch(token);
            if (res.status === 401) {
              token = await refreshToken(account);
              res = await doFetch(token);
            }
            const text = await res.text();
            console.log(`[ADS] ${account.nome} ${url.split('?')[0].replace('https://api.mercadolibre.com','')} -> status=${res.status}`);
            try { return { data: JSON.parse(text), status: res.status }; } catch { return { data: null, status: res.status }; }
          };

          // ━━━ Step 1: Discover advertiser_id for ALL product types ━━━
          const allAdvertisers: { advertiser_id: number; site_id: string; product: string }[] = [];
          for (const product of productTypes) {
            try {
              const { data: advData, status: advStatus } = await adsFetchRaw(
                `https://api.mercadolibre.com/advertising/advertisers?product_id=${product}`, '1'
              );
              if (advStatus === 404 || !advData?.advertisers?.length) {
                console.log(`[ADS] ${account.nome}: ${product} not enabled`);
                continue;
              }
              for (const a of advData.advertisers) {
                if (a.site_id === 'MLB') allAdvertisers.push({ ...a, product });
              }
            } catch { console.log(`[ADS] ${account.nome}: ${product} check failed`); }
          }

          if (allAdvertisers.length === 0) {
            console.log(`[ADS] ${account.nome}: no MLB advertisers found for any product`);
            continue;
          }

          for (const adv of allAdvertisers) {
            const advertiserId = adv.advertiser_id;
            const siteId = adv.site_id;
            const productType = adv.product;

            // ━━━ Step 2: Fetch campaigns with metrics ━━━
            const metricsFields = 'clicks,prints,ctr,cost,cpc,roas,total_amount,direct_amount,indirect_amount,units_quantity,direct_units_quantity,indirect_units_quantity';
            const { data: campData, status: campStatus } = await adsFetchRaw(
              `https://api.mercadolibre.com/advertising/${siteId}/advertisers/${advertiserId}/product_ads/campaigns/search?limit=50&offset=0&date_from=${dateFrom}&date_to=${dateTo}&metrics=${metricsFields}&metrics_summary=true`, '2'
            );

            if (campStatus < 400 && campData?.results) {
              for (const c of campData.results) {
                allCampaigns.push({
                  id: c.id,
                  name: c.name || 'Campanha',
                  status: c.status || 'unknown',
                  budget: c.budget || 0,
                  strategy: c.strategy || '',
                  roas_target: c.roas_target || 0,
                  product_type: productType,
                  metrics: c.metrics || {},
                  conta: account.nome,
                  account_id: account.id,
                  advertiser_id: advertiserId,
                });
              }
              console.log(`[ADS] ${account.nome}: ${campData.results.length} campaigns (total: ${campData.paging?.total || '?'})`);
            }

            // ━━━ Step 3: Fetch ad items with metrics ━━━
            const { data: adsData, status: adsStatus } = await adsFetchRaw(
              `https://api.mercadolibre.com/advertising/${siteId}/advertisers/${advertiserId}/product_ads/ads/search?limit=50&offset=0&date_from=${dateFrom}&date_to=${dateTo}&metrics=${metricsFields}&sort_by=cost&sort=desc`, '2'
            );

            if (adsStatus < 400 && adsData?.results) {
              for (const ad of adsData.results) {
                allAdItems.push({
                  item_id: ad.item_id,
                  campaign_id: ad.campaign_id,
                  title: ad.title || '',
                  price: ad.price || 0,
                  status: ad.status || 'unknown',
                  thumbnail: ad.thumbnail || '',
                  permalink: ad.permalink || '',
                  metrics: ad.metrics || {},
                  conta: account.nome,
                });
              }
              console.log(`[ADS] ${account.nome}: ${adsData.results.length} ad items (total: ${adsData.paging?.total || '?'})`);
            }
          }
        } catch (err) {
          console.error(`[ADS] Error for ${account.nome}:`, err);
        }
      }

      return new Response(JSON.stringify({ campaigns: allCampaigns, items: allAdItems }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'update_campaign') {
      if (!reqCampaignId || !account_id) throw new Error('campaign_id and account_id required');
      const accountsRes = await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`);
      const accounts = await accountsRes.json();
      if (!accounts?.length) throw new Error('Account not found');
      const account = accounts[0];

      // Always get fresh token first
      let token = await refreshToken(account);

      // Discover advertiser_id
      const advRes = await fetch('https://api.mercadolibre.com/advertising/advertisers?product_id=PADS', {
        headers: { 'Authorization': `Bearer ${token}`, 'Api-Version': '1' },
      });
      const advData = await advRes.json();
      const mlbAdv = (advData?.advertisers || []).find((a: any) => a.site_id === 'MLB');
      if (!mlbAdv) throw new Error('No MLB advertiser found');

      // Build update body
      const updateBody: any = {};
      if (reqBudget !== undefined) updateBody.budget = Number(reqBudget);
      if (reqRoasTarget !== undefined) updateBody.roas_target = Number(reqRoasTarget);

      const doPut = (t: string) => fetch(`https://api.mercadolibre.com/advertising/${mlbAdv.site_id}/advertisers/${mlbAdv.advertiser_id}/product_ads/campaigns/${reqCampaignId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json', 'Api-Version': '2' },
        body: JSON.stringify(updateBody),
      });

      let putRes = await doPut(token);
      if (putRes.status === 401) {
        token = await refreshToken(account);
        putRes = await doPut(token);
      }
      const result = await putRes.text();
      console.log(`[ADS] update_campaign ${reqCampaignId}: status=${putRes.status} body=${result.slice(0, 200)}`);
      return new Response(result, {
        status: putRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error: unknown) {
    console.error('ML API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
