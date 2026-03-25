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
    const { action, account_id, sku, item_id, fields, description_text, new_item, query, status: reqStatus, offset: reqOffset, limit: reqLimit } = await req.json();

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

      return new Response(JSON.stringify({ items, total, offset: off, limit: lim }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
