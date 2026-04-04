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

async function invokeGsFunction(action: string, payload: any) {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const gsUrl = `${url}/functions/v1/google-sheets`;
  
  // Normalize range logic for clear/read
  let normalizedRange = payload.range;
  if (normalizedRange) {
    const bangIdx = normalizedRange.indexOf('!');
    const rawTab = bangIdx > 0 ? normalizedRange.slice(0, bangIdx).replace(/^'+|'+$/g, '') : normalizedRange.replace(/^'+|'+$/g, '');
    if (rawTab && bangIdx > 0) {
      const cellRef = normalizedRange.slice(bangIdx + 1);
      normalizedRange = `'${rawTab}'!${cellRef}`;
    } else if (rawTab) {
      normalizedRange = `'${rawTab}'`;
    }
  }

  const res = await fetch(gsUrl, {
    method: 'POST', 
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ action, ...payload, range: normalizedRange }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets ${action} failed: ${err}`);
  }
  return res.json();
}

// Helper: chamar google-sheets edge function
async function invokeSheets(spreadsheetId: string, range: string, values: any[][], action: 'append' | 'write' = 'append') {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const gsUrl = `${url}/functions/v1/google-sheets`;
  const gsHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` };

  // Normalize range: wrap tab name in single quotes (required for hyphens/spaces)
  let normalizedRange = range;
  const bangIdx = range.indexOf('!');
  const rawTab = bangIdx > 0 ? range.slice(0, bangIdx).replace(/^'+|'+$/g, '') : '';
  if (rawTab && bangIdx > 0) {
    const cellRef = range.slice(bangIdx + 1);
    normalizedRange = `'${rawTab}'!${cellRef}`;
  }

  // Auto-create sheet tab if it doesn't exist
  if (rawTab) {
    try {
      await fetch(gsUrl, {
        method: 'POST', headers: gsHeaders,
        body: JSON.stringify({ action: 'create_sheet', spreadsheetId, sheetTitle: rawTab }),
      });
    } catch { /* tab may already exist — OK */ }
  }

  const res = await fetch(gsUrl, {
    method: 'POST', headers: gsHeaders,
    body: JSON.stringify({ action, spreadsheetId, range: normalizedRange, values }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets ${action} failed: ${err}`);
  }
  return res.json();
}

const PLANILHA_MESTRA = '1lMq5aeInwwv7st8-Rf-S8NYQJaQKkSbSD7PjtFhtPms';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, account_id, sku, item_id, fields, description_text, new_item, query, category_id, promotion_id, status: reqStatus, offset: reqOffset, limit: reqLimit, date_from: reqDateFrom, date_to: reqDateTo, campaign_id: reqCampaignId, budget: reqBudget, roas_target: reqRoasTarget, spreadsheet_id: reqSpreadsheetId, sheet_name: reqSheetName, sheet_name_prefix: reqSheetPrefix, ad_type: reqAdType } = await req.json();

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

          // Fetch recent paid orders (last 15 days)
          const now = new Date();
          const past = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

          let offset = 0;
          const limit = 50;
          let hasMore = true;

          while (hasMore) {
            const url = `/orders/search?seller=${sellerId}&order.status=paid&order.date_created.from=${past.toISOString()}&order.date_created.to=${now.toISOString()}&sort=date_desc&limit=${limit}&offset=${offset}`;
            
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
              if (shippingStatus && shippingStatus !== 'shipped' && shippingStatus !== 'delivered' && shippingStatus !== 'not_delivered' && shippingStatus !== 'cancelled') {
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
        const batchData = await mlFetch(account, `/items?ids=${ids}&attributes=id,title,price,thumbnail,available_quantity,status,sub_status,seller_custom_field,variations,catalog_listing,listing_type_id,shipping,tags,date_created,category_id,permalink,domain_id`);
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
              account_id: account.id,
              category_id: b.category_id || '',
              domain_id: b.domain_id || '',
              permalink: b.permalink || '',
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

      // ML requires family_name at body root level, NOT inside attributes
      // Extract it from attributes array and move to top-level
      if (new_item.attributes && Array.isArray(new_item.attributes)) {
        const fnAttr = new_item.attributes.find((a: any) => a.id === 'family_name');
        if (fnAttr && fnAttr.value_name && !new_item.family_name) {
          new_item.family_name = fnAttr.value_name;
        }
        // Remove family_name from attributes array to avoid conflict
        new_item.attributes = new_item.attributes.filter((a: any) => a.id !== 'family_name');
      }

      // Convert shipping dimensions object → ML string format "HxWxL,Weight"
      // ML expects: height x width x length in cm, weight in grams as string
      if (new_item.shipping?.dimensions && typeof new_item.shipping.dimensions === 'object') {
        const d = new_item.shipping.dimensions;
        if (d.height && d.width && d.length && d.weight) {
          // Frontend sends mm and grams, ML wants cm and grams in string format
          const hCm = Math.round(d.height / 10) || d.height;
          const wCm = Math.round(d.width / 10) || d.width;
          const lCm = Math.round(d.length / 10) || d.length;
          const weightG = d.weight;
          new_item.shipping.dimensions = `${hCm}x${wCm}x${lCm},${weightG}`;
          console.log('[CREATE] Shipping dimensions converted:', new_item.shipping.dimensions);
        } else {
          // Incomplete dimensions — remove to avoid errors
          delete new_item.shipping.dimensions;
        }
      }

      console.log('[CREATE] family_name:', new_item.family_name);
      console.log('[CREATE] attributes:', JSON.stringify(new_item.attributes));
      console.log('[CREATE] payload:', JSON.stringify(new_item).slice(0, 800));

      // Smart retry loop — handles ML validation errors automatically
      let result: any;
      let attempts = 0;
      const maxAttempts = 4;

      while (attempts < maxAttempts) {
        attempts++;
        try {
          result = await mlFetchWrite(account, '/items', 'POST', new_item);
          break; // success
        } catch (err: any) {
          const errMsg = err.message || '';
          console.log(`[CREATE] Attempt ${attempts} failed: ${errMsg.slice(0, 300)}`);

          // Handle body.invalid_fields — User Products categories don't accept title/condition
          if (errMsg.includes('body.invalid_fields')) {
            const invalidFields: string[] = [];
            if (errMsg.includes('title')) invalidFields.push('title');
            if (errMsg.includes('condition')) invalidFields.push('condition');
            if (invalidFields.length > 0) {
              console.log(`[CREATE] Stripping invalid fields: ${invalidFields.join(', ')}`);
              for (const f of invalidFields) delete new_item[f];
              continue; // retry
            }
          }

          // Handle missing_conditional_required — required attributes like GTIN
          if (errMsg.includes('missing_conditional_required') || errMsg.includes('attributes') && errMsg.includes('required')) {
            // Extract attribute IDs from error: "The attributes [GTIN] are required..."
            const attrMatch = errMsg.match(/attributes\s*\[([^\]]+)\]/);
            if (attrMatch) {
              const missingAttrs = attrMatch[1].split(',').map((a: string) => a.trim());
              if (!new_item.attributes) new_item.attributes = [];
              for (const attrId of missingAttrs) {
                // Only add if not already present
                if (!new_item.attributes.find((a: any) => a.id === attrId)) {
                  console.log(`[CREATE] Auto-adding required attribute: ${attrId} = "Não se aplica"`);
                  new_item.attributes.push({ id: attrId, value_name: 'Não se aplica' });
                }
              }
              continue; // retry
            }
          }

          // Handle shipping dimension errors — strip dimensions and retry
          if (errMsg.includes('shipping') && (errMsg.includes('dimensions') || errMsg.includes('Shipping configuration'))) {
            console.log('[CREATE] Stripping shipping dimensions due to format error');
            if (new_item.shipping) {
              delete new_item.shipping.dimensions;
              // If shipping is now empty, remove it entirely
              if (Object.keys(new_item.shipping).length === 0) delete new_item.shipping;
            }
            continue; // retry
          }

          // Unknown error — don't retry
          throw err;
        }
      }

      console.log('[CREATE_ITEM] ML response:', JSON.stringify(result).slice(0, 1000));
      // Return full result including ML error details
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

    if (action === 'delete_picture') {
      if (!item_id) throw new Error('item_id is required');
      const pic_id = (fields as any)?.picture_id;
      if (!pic_id) throw new Error('picture_id is required');
      const accountsRes = account_id
        ? await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`)
        : await supabaseFetch('/ml_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();
      if (!accounts?.length) throw new Error('No ML account found');

      const account = accounts[0];
      const item = await mlFetch(account, `/items/${item_id}?attributes=pictures`);
      const existingPics = (item.pictures || []).filter((p: any) => p.id !== pic_id).map((p: any) => ({ id: p.id }));
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
                  buy_box_winner: ad.buy_box_winner || false,
                  catalog_listing: ad.catalog_listing || false,
                  logistic_type: ad.logistic_type || '',
                  listing_type_id: ad.listing_type_id || '',
                  condition: ad.condition || '',
                  domain_id: ad.domain_id || '',
                  metrics: ad.metrics || {},
                  conta: account.nome,
                  account_id: account.id,
                });
              }
              console.log(`[ADS] ${account.nome}: ${adsData.results.length} ad items (total: ${adsData.paging?.total || '?'})`);
            }
          }
        } catch (err) {
          console.error(`[ADS] Error for ${account.nome}:`, err);
        }
      }

      // Fetch seller reputation per account
      const sellerReputations: Record<string, any> = {};
      for (const account of accounts) {
        try {
          const token = account.access_token;
          const userRes = await fetch(`${ML_API}/users/${account.seller_id}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          });
          if (userRes.ok) {
            const userData = await userRes.json();
            sellerReputations[account.nome] = {
              seller_reputation: userData.seller_reputation || null,
              nickname: userData.nickname || '',
              power_seller_status: userData.seller_reputation?.power_seller_status || null,
              level_id: userData.seller_reputation?.level_id || null,
              experience: userData.seller_reputation?.metrics || null,
              transactions: userData.seller_reputation?.transactions || null,
            };
            console.log(`[ADS] ${account.nome} reputation: level=${userData.seller_reputation?.level_id}, power=${userData.seller_reputation?.power_seller_status}`);
          }
        } catch { /* optional */ }
      }

      return new Response(JSON.stringify({ campaigns: allCampaigns, items: allAdItems, seller_reputations: sellerReputations }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'get_item_status') {
      if (!item_id || !account_id) throw new Error('item_id and account_id required');
      const accountsRes = await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`);
      const accounts = await accountsRes.json();
      if (!accounts?.length) throw new Error('Account not found');
      const account = accounts[0];
      const token = await refreshToken(account);
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

      // Get purchase experience per item (official endpoint)
      let purchaseExp = null;
      try {
        const peRes = await fetch(`${ML_API}/reputation/items/${item_id}/purchase_experience/integrators?locale=pt_BR`, { headers });
        console.log(`[ADS] purchase_experience ${item_id}: status=${peRes.status}`);
        if (peRes.ok) {
          purchaseExp = await peRes.json();
        } else {
          const errText = await peRes.text();
          console.log(`[ADS] purchase_experience ${item_id}: error=${errText.substring(0,200)}`);
        }
      } catch (e) { console.error(`[ADS] purchase_experience error:`, e); }

      // Get basic item info
      const itemRes = await fetch(`${ML_API}/items/${item_id}`, { headers });
      const itemData = itemRes.ok ? await itemRes.json() : null;

      console.log(`[ADS] item_status ${item_id}: exp_score=${purchaseExp?.reputation?.value ?? 'null'}, exp_color=${purchaseExp?.reputation?.color ?? 'null'}`);
      return new Response(JSON.stringify({
        item_id,
        title: itemData?.title || '',
        purchase_experience: purchaseExp,
        shipping: itemData?.shipping?.logistic_type || '',
        listing_type: itemData?.listing_type_id || '',
        condition: itemData?.condition || '',
        catalog_product_id: itemData?.catalog_product_id || null,
        catalog_listing: !!itemData?.catalog_product_id,
        buy_box_winner: itemData?.buy_box_winner || false,
        status: itemData?.status || '',
        price: itemData?.price || 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'get_catalog_winner') {
      if (!item_id || !account_id) throw new Error('item_id and account_id required');
      const accountsRes = await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`);
      const accounts = await accountsRes.json();
      if (!accounts?.length) throw new Error('Account not found');
      const account = accounts[0];
      const token = await refreshToken(account);
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

      // Get item details (includes catalog_product_id, health, shipping)
      const itemRes = await fetch(`${ML_API}/items/${item_id}`, { headers });
      const itemData = itemRes.ok ? await itemRes.json() : null;
      console.log(`[ADS] item ${item_id}: catalog_product_id=${itemData?.catalog_product_id}, health=${JSON.stringify(itemData?.health)?.substring(0,100)}`);

      const catalogProductId = itemData?.catalog_product_id;
      if (!catalogProductId) {
        return new Response(JSON.stringify({ catalog: false, message: 'Item não é de catálogo' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Get catalog product info
      const catRes = await fetch(`${ML_API}/products/${catalogProductId}`, { headers });
      const catalogData = catRes.ok ? await catRes.json() : {};

      // Get item health
      let healthData = null;
      try {
        const hRes = await fetch(`${ML_API}/items/${item_id}/health`, { headers });
        if (hRes.ok) healthData = await hRes.json();
        console.log(`[ADS] health ${item_id}: status=${hRes.status}`);
      } catch { /* optional */ }

      // Get catalog listings to find real competitors (who sells same product)
      let competitors: any[] = [];
      let winnerInfo: any = null;
      try {
        // Catalog listing page: shows all sellers of this product
        const catalogPageRes = await fetch(`${ML_API}/products/${catalogProductId}/items?status=active&limit=20`, { headers });
        console.log(`[ADS] catalog items ${catalogProductId}: status=${catalogPageRes.status}`);
        if (catalogPageRes.ok) {
          const cpData = await catalogPageRes.json();
          const items = Array.isArray(cpData) ? cpData : (cpData?.results || cpData?.items || []);
          for (const ci of items) {
            const isMe = ci.id === item_id || ci.item_id === item_id;
            const entry = {
              item_id: ci.id || ci.item_id || '',
              seller_id: ci.seller_id || ci.seller?.id || '',
              price: ci.price || 0,
              condition: ci.condition || '',
              is_me: isMe,
              buy_box_winner: ci.buy_box_winner || false,
            };
            if (!isMe) competitors.push(entry);
            if (ci.buy_box_winner && !isMe) winnerInfo = entry;
          }
        }
      } catch (e) { console.error(`[ADS] catalog items error:`, e); }

      // Fallback: direct buy_box_winner endpoint
      if (!winnerInfo) {
        try {
          const bbRes = await fetch(`${ML_API}/items/${item_id}/catalog_listing`, { headers });
          console.log(`[ADS] catalog_listing ${item_id}: status=${bbRes.status}`);
          if (bbRes.ok) {
            const bbData = await bbRes.json();
            if (bbData?.buy_box_winner && bbData.buy_box_winner.item_id !== item_id) {
              winnerInfo = {
                item_id: bbData.buy_box_winner.item_id || '',
                seller_id: bbData.buy_box_winner.seller_id || '',
                price: bbData.buy_box_winner.price || 0,
              };
            }
          }
        } catch { /* optional */ }
      }

      console.log(`[ADS] catalog_winner ${item_id}: catalog=${catalogProductId}, competitors=${competitors.length}, winner=${winnerInfo?.item_id || 'none'}`);
      return new Response(JSON.stringify({
        catalog: true,
        catalog_product_id: catalogProductId,
        product_name: catalogData?.name || '',
        buy_box_winner: winnerInfo,
        competitors,
        item_status: {
          health: healthData || itemData?.health || null,
          shipping: itemData?.shipping?.logistic_type || '',
          listing_type: itemData?.listing_type_id || '',
          condition: itemData?.condition || '',
          seller_reputation: itemData?.seller_address ? 'available' : null,
          sale_terms: itemData?.sale_terms || [],
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

      const doPut = (t: string) => fetch(`https://api.mercadolibre.com/advertising/${mlbAdv.site_id}/product_ads/campaigns/${reqCampaignId}`, {
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

    // ═══ QUESTIONS (Atendimento) ═══
    if (action === 'get_questions') {
      const accountsRes = await supabaseFetch('/ml_accounts?ativo=eq.true&select=*');
      const allAccounts = await accountsRes.json();
      if (!allAccounts?.length) throw new Error('No active accounts');

      const filterStatus = reqStatus || 'UNANSWERED'; // UNANSWERED, ANSWERED, ALL
      const limit = reqLimit || 50;
      const allQuestions: any[] = [];

      for (const account of allAccounts) {
        try {
          const token = await refreshToken(account);
          const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
          
          let url = `${ML_API}/my/received_questions/search?sort_fields=date_created&sort_types=DESC&limit=${limit}&api_version=4`;
          if (filterStatus !== 'ALL') url += `&status=${filterStatus}`;
          
          const qRes = await fetch(url, { headers });
          console.log(`[QA] questions for ${account.nickname}: status=${qRes.status}`);
          if (qRes.ok) {
            const qData = await qRes.json();
            const questions = qData.questions || [];
            
            // Enrich with item title (batch)
            const itemIds = [...new Set(questions.map((q: any) => q.item_id).filter(Boolean))];
            const itemTitles: Record<string, string> = {};
            const itemThumbs: Record<string, string> = {};
            for (const iid of itemIds.slice(0, 20)) {
              try {
                const iRes = await fetch(`${ML_API}/items/${iid}?attributes=title,thumbnail`, { headers });
                if (iRes.ok) {
                  const iData = await iRes.json();
                  itemTitles[iid as string] = iData.title || '';
                  itemThumbs[iid as string] = iData.thumbnail || '';
                }
              } catch {}
            }
            
            for (const q of questions) {
              allQuestions.push({
                id: q.id,
                item_id: q.item_id,
                item_title: itemTitles[q.item_id] || '',
                item_thumbnail: itemThumbs[q.item_id] || '',
                text: q.text || '',
                status: q.status,
                date_created: q.date_created,
                answer: q.answer ? { text: q.answer.text, date_created: q.answer.date_created } : null,
                from: { id: q.from?.id, nickname: '' },
                seller_id: account.seller_id,
                conta: account.nickname,
              });
            }
          }
        } catch (e) {
          console.error(`[QA] error for ${account.nickname}:`, e);
        }
      }

      console.log(`[QA] total questions: ${allQuestions.length}`);
      return new Response(JSON.stringify({ questions: allQuestions }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_category_attributes') {
      const catId = category_id || (fields as any)?.category_id;
      if (!catId) throw new Error('category_id is required');

      // Busca autenticada — retorna marcas registradas na conta do seller
      const accountsRes = account_id
        ? await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`)
        : await supabaseFetch('/ml_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();
      if (!accounts?.length) throw new Error('No ML account found');
      const account = accounts[0];

      const allAttrs = await mlFetch(account, `/categories/${catId}/attributes`);
      const list = Array.isArray(allAttrs) ? allAttrs : [];
      
      const requiredList = list.filter((a: any) => a.tags?.required || a.tags?.catalog_required);
      const optionalList = list.filter((a: any) => !(a.tags?.required || a.tags?.catalog_required) && !a.tags?.hidden).slice(0, 12);

      const combined = [...requiredList, ...optionalList].map((a: any) => ({
          id: a.id,
          name: a.name,
          type: a.value_type,
          required: !!(a.tags?.required || a.tags?.catalog_required),
          values: (a.values || []).slice(0, 80).map((v: any) => ({ id: v.id, name: v.name })),
          hint: a.hint || '',
      }));

      return new Response(JSON.stringify({ attributes: combined }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'list_seller_promotions') {
      const accountsRes = account_id
        ? await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`)
        : await supabaseFetch('/ml_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();
      if (!accounts?.length) throw new Error('No ML account found');
      const account = accounts[0];

      let sellerId = account.seller_id;
      if (!sellerId) {
        const me = await mlFetch(account, '/users/me');
        sellerId = me.id;
      }

      const promos = await mlFetch(account, `/seller-promotions/promotions?seller_id=${sellerId}&status=active&limit=50`).catch(() => []);
      const list = Array.isArray(promos) ? promos : (promos?.results || []);

      const result = list.map((p: any) => ({
        id: p.id,
        name: p.name || p.type || 'Promoção',
        type: p.type,
        status: p.status,
        start_date: p.start_date,
        end_date: p.end_date,
        discount_type: p.discount_type,
        discount_value: p.discount_value,
        items_count: p.items_count || 0,
        conta: account.nome,
        account_id: account.id,
        seller_id: sellerId,
      }));

      return new Response(JSON.stringify({ promotions: result, conta: account.nome }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_promotion_items') {
      if (!promotion_id) throw new Error('promotion_id is required');
      const accountsRes = account_id
        ? await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`)
        : await supabaseFetch('/ml_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();
      if (!accounts?.length) throw new Error('No ML account found');
      const account = accounts[0];

      const data = await mlFetch(account, `/seller-promotions/promotions/${promotion_id}/items?limit=100`);
      const items = Array.isArray(data) ? data : (data?.results || []);

      return new Response(JSON.stringify({
        promotion_id,
        items: items.map((i: any) => ({
          item_id: i.id || i.item_id,
          title: i.title || '',
          original_price: i.original_price || i.price || 0,
          deal_price: i.deal_price || 0,
          status: i.status,
          seller_custom_field: i.seller_custom_field || '',
        })),
        conta: account.nome,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'add_item_to_promotion') {
      if (!promotion_id || !item_id) throw new Error('promotion_id and item_id are required');
      const accountsRes = account_id
        ? await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`)
        : await supabaseFetch('/ml_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();
      if (!accounts?.length) throw new Error('No ML account found');
      const account = accounts[0];

      const dealPrice = (fields as any)?.deal_price;
      const body: any = { id: item_id };
      if (dealPrice) body.deal_price = Number(dealPrice);

      const result = await mlFetchWrite(account, `/seller-promotions/promotions/${promotion_id}/items`, 'POST', body);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'remove_item_from_promotion') {
      if (!promotion_id || !item_id) throw new Error('promotion_id and item_id are required');
      const accountsRes = account_id
        ? await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`)
        : await supabaseFetch('/ml_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();
      if (!accounts?.length) throw new Error('No ML account found');
      const account = accounts[0];

      let token = account.access_token;
      if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
        token = await refreshToken(account);
      }
      const res = await fetch(`${ML_API}/seller-promotions/promotions/${promotion_id}/items/${item_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const text = await res.text();
      return new Response(text || '{"ok":true}', { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ═══ SYNC VENDAS ML → GOOGLE SHEETS ═══════════════════════════════════════
    if (action === 'sync_vendas') {
      if (!account_id) throw new Error('account_id is required');
      const accountsRes = await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`);
      const accounts = await accountsRes.json();
      if (!accounts?.length) throw new Error('Conta ML não encontrada');
      const account = accounts[0];

      let sellerId = account.seller_id;
      if (!sellerId) {
        const me = await mlFetch(account, '/users/me');
        sellerId = me.id;
        await supabaseFetch(`/ml_accounts?id=eq.${account.id}`, {
          method: 'PATCH', body: JSON.stringify({ seller_id: String(sellerId) }),
        });
      }

      const dateFrom = reqDateFrom || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const dateTo = reqDateTo || dateFrom;
      const sheetId = reqSpreadsheetId || PLANILHA_MESTRA;
      const sheetTab = reqSheetName || 'VendasML';

      // Convert dates to ISO for ML API
      const isoFrom = `${dateFrom}T00:00:00.000-03:00`;
      const isoTo = `${dateTo}T23:59:59.999-03:00`;

      const allRows: any[][] = [];
      let offset = 0;
      const limit = 50;
      let hasMore = true;

      // Cache de shipments para evitar chamadas duplicadas
      const shipmentCache: Record<string, any> = {};

      while (hasMore) {
        const ordersData = await mlFetch(
          account,
          `/orders/search?seller=${sellerId}&order.date_created.from=${encodeURIComponent(isoFrom)}&order.date_created.to=${encodeURIComponent(isoTo)}&sort=date_asc&limit=${limit}&offset=${offset}`
        );
        const results = ordersData.results || [];
        const total = ordersData.paging?.total || 0;

        for (const order of results) {
          // Ignorar cancelados
          if (order.status === 'cancelled') continue;

          const orderItems = order.order_items || [];
          if (orderItems.length === 0) continue;

          // Data da venda em formato BR (DD/MM/YYYY)
          const dateCreated = new Date(order.date_created);
          const spDate = new Date(dateCreated.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
          
          // Verificar fuso BR
          const dateStrFormat = `${spDate.getFullYear()}-${String(spDate.getMonth() + 1).padStart(2, '0')}-${String(spDate.getDate()).padStart(2, '0')}`;
          if (dateStrFormat < dateFrom || dateStrFormat > dateTo) {
            continue;
          }
          
          const dataVenda = `${String(spDate.getDate()).padStart(2, '0')}/${String(spDate.getMonth() + 1).padStart(2, '0')}/${spDate.getFullYear()}`;
          const dateClosed = new Date(order.date_closed || order.date_created);
          const spDateClosed = new Date(dateClosed.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
          const dataEmissao = `${String(spDateClosed.getDate()).padStart(2, '0')}/${String(spDateClosed.getMonth() + 1).padStart(2, '0')}/${spDateClosed.getFullYear()}`;

          // Pack ID logic
          const vid = order.id;
          const pid = order.pack_id;
          let idReferencia = String(vid);

          if (pid) {
            // Conta items com esse pack_id no lote local (mesma order logic fallback) - ou API total
            const qtdNoPack = results.filter((o: any) => o.pack_id === pid).length;
            if (qtdNoPack === 1) {
              idReferencia = String(pid); // pack único -> usa pack_id
            }            
          }
          
          const col4 = `'${idReferencia}`;

          // Buscar shipment para dados de frete
          let shipmentId = order.shipping?.id;
          if (!shipmentId && pid) {
            try {
              const pData = await mlFetch(account, `/packs/${pid}`);
              shipmentId = pData.shipment?.id;
            } catch { /* ignore */ }
          }
          if (!shipmentId && !pid) {
            try {
              const osData = await mlFetch(account, `/orders/${vid}/shipments`);
              shipmentId = osData.shipments?.[0]?.id;
            } catch { /* ignore */ }
          }
          
          let shipmentData: any = null;
          if (shipmentId) {
            if (shipmentCache[shipmentId]) {
              shipmentData = shipmentCache[shipmentId];
            } else {
              try {
                shipmentData = await mlFetch(account, `/shipments/${shipmentId}`);
                shipmentCache[shipmentId] = shipmentData;
              } catch { /* fallback */ }
            }
          }

          // Frete params
          const free_shipping = shipmentData?.free_shipping || false;
          const cost_opt = shipmentData?.shipping_option?.cost || 0;
          const list_cost = shipmentData?.shipping_option?.list_cost || 0;
          const base_cost = shipmentData?.base_cost || 0;

          let custo_api = 0;
          if (free_shipping) {
            custo_api = cost_opt;
          } else {
            const ref = list_cost > 0 ? list_cost : base_cost;
            if (ref > 0) custo_api = Math.max(0, ref - cost_opt);
          }

          const logisticType = shipmentData?.logistic_type || order.shipping?.logistic_type || '';
          const tags = shipmentData?.tags || [];
          const mode = shipmentData?.mode || '';
          const city = shipmentData?.receiver_address?.city?.name || order.shipping?.receiver_address?.city?.name || '';
          const buyerState = shipmentData?.receiver_address?.state?.name || shipmentData?.receiver_address?.city?.state_name || order.shipping?.receiver_address?.state?.name || '';
          
          let tipo_log = 'Mercado Envios';
          if (logisticType === 'fulfillment') tipo_log = 'Mercado Envios Full';
          else if (['self_service', 'flex'].includes(logisticType) || tags.includes('self_service_in') || mode === 'me1') tipo_log = 'Mercado Envios Flex';
          else if (logisticType === 'cross_docking') tipo_log = 'Mercado Envios Coleta';
          else if (['drop_off', 'xd_drop_off'].includes(logisticType)) tipo_log = 'Mercado Envios Agência';

          for (const oi of orderItems) {
            const itemData = oi.item || {};
            const qty = oi.quantity || 1;
            const unitPrice = oi.unit_price || 0;
            const valorItem = unitPrice * qty;
            const saleFee = oi.sale_fee || 0;
            const sku = itemData.seller_custom_field || itemData.seller_sku || itemData.id || '';
            
            // Tipo de anúncio
            const listingType = oi.item?.listing_type_id || itemData.listing_type_id || '';
            const tipoAnuncio = listingType.includes('gold_special') ? 'Clássico' : 'Premium';

            // Verificar se é Full pelo node_id do item se não for flex
            if (tipo_log !== 'Mercado Envios Flex') {
              const node = oi.item?.stock?.node_id || itemData.stock?.node_id;
              if (node && String(node).startsWith('BR')) tipo_log = 'Mercado Envios Full';
            }
            
            // Frete do item
            let custo_calc = 0;
            const isCuritiba = city.toLowerCase().includes('curitiba');

            if (tipo_log === 'Mercado Envios Flex') {
              if (isCuritiba) {
                custo_calc = valorItem <= 79.00 ? 0 : 8.01;
              } else {
                custo_calc = valorItem <= 79.00 ? 5.00 : 12.81;
              }
            } else if (tipo_log === 'Mercado Envios Full') {
              custo_calc = valorItem < 79.00 ? 0 : custo_api;
            } else {
              custo_calc = valorItem < 79.00 ? 0 : custo_api;
            }

            if (tipo_log !== 'Mercado Envios Flex' && custo_api === 0) custo_calc = 0;
            if (custo_calc > 0) custo_calc = custo_calc * -1;
            custo_calc = Math.round(custo_calc * 100) / 100;

            // Comissão ML (col 15): sale_fee × quantidade
            const comissao = saleFee > 0 ? -(saleFee * qty) : (saleFee * qty);

            allRows.push([
              sku,                                      // 0  SKU PRINCIPAL
              sku,                                      // 1  SKU
              dataVenda,                                // 2  Data da venda
              dataEmissao,                              // 3  EMISSAO
              col4,                                     // 4  N.º de venda
              'Mercado Livre',                          // 5  origem
              itemData.id || '',                        // 6  # de anúncio
              tipoAnuncio,                              // 7  tipo de anuncio
              '',                                       // 8  Venda por publicidade
              tipo_log,                                 // 9  Forma de entrega
              unitPrice,                                // 10 Preço unitário
              qty,                                      // 11 Unidades
              valorItem,                                // 12 Receita
              custo_calc,                               // 13 Envio Seller
              0,                                        // 14 TARIFA
              comissao,                                 // 15 Tarifa de venda e impostos
              '',                                       // 16 ADS
              account.nome,                             // 17 conta
              buyerState,                               // 18 Estado
            ]);
          }
        }

        offset += limit;
        hasMore = offset < total;
      }

      // Escrever no Google Sheets
      if (allRows.length > 0) {
        await invokeSheets(sheetId, `${sheetTab}!A:S`, allRows, 'append');
      }

      const msg = `ML Vendas ${account.nome}: ${allRows.length} linhas escritas em ${sheetTab} (${dateFrom})`;
      console.log(`[SYNC] ${msg}`);
      return new Response(JSON.stringify({ mensagem: msg, linhas_escritas: allRows.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══ PERFORMANCE CATÁLOGO ML → GOOGLE SHEETS ═══════════════════════════
    if (action === 'get_performance_catalog') {
      if (!account_id) throw new Error('account_id is required');
      const accountsRes = await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`);
      const accounts = await accountsRes.json();
      if (!accounts?.length) throw new Error('Conta ML não encontrada');
      const account = accounts[0];

      let sellerId = account.seller_id;
      if (!sellerId) {
        const me = await mlFetch(account, '/users/me');
        sellerId = me.id;
        await supabaseFetch(`/ml_accounts?id=eq.${account.id}`, {
          method: 'PATCH', body: JSON.stringify({ seller_id: String(sellerId) }),
        });
      }

      const dateFrom = reqDateFrom || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const dateTo = reqDateTo || dateFrom;
      const sheetId = reqSpreadsheetId || PLANILHA_MESTRA;
      const contaLabel = (account.nome || '').trim().toUpperCase();
      const sheetTab = reqSheetName || `PERF-${contaLabel}`;

      // 1. Buscar itens Full catálogo
      let itemIds: string[] = [];
      let searchOffset = 0;
      let searchHasMore = true;
      while (searchHasMore) {
        const searchData = await mlFetch(account,
          `/users/${sellerId}/items/search?status=active&logistic_type=fulfillment&catalog_listing=true&limit=50&offset=${searchOffset}`
        );
        itemIds = itemIds.concat(searchData.results || []);
        searchOffset += 50;
        searchHasMore = searchOffset < (searchData.paging?.total || 0);
      }

      console.log(`[PERF] ${account.nome}: ${itemIds.length} itens catálogo Full`);

      // 2. Buscar detalhes em batches de 20
      const itemDetails: Record<string, any> = {};
      for (let i = 0; i < itemIds.length; i += 20) {
        const batch = itemIds.slice(i, i + 20).join(',');
        if (!batch) continue;
        const batchData = await mlFetch(account, `/items?ids=${batch}&attributes=id,title,permalink,seller_custom_field,variations,price,attributes`);
        for (const d of batchData) {
          if (d.code === 200 && d.body) {
            const b = d.body;

            // Fix 2: SKU extraction — seller_custom_field > attributes SELLER_SKU > variations SELLER_SKU
            let sku = b.seller_custom_field || '';
            if (!sku) {
              const attrSku = (b.attributes || []).find((a: any) => a.id === 'SELLER_SKU');
              sku = attrSku?.value_name || '';
            }
            if (!sku) {
              const skuVar = (b.variations || []).map((v: any) => {
                const sa = (v.attribute_combinations || []).find((a: any) => a.id === 'SELLER_SKU');
                return sa?.value_name || '';
              }).filter(Boolean);
              sku = skuVar[0] || '';
            }
            if (!sku) sku = 'SEM_SKU';

            itemDetails[b.id] = {
              title: b.title || '',
              sku,
              price: b.price || 0,
              permalink: b.permalink || '',
            };
          }
        }
      }

      // 3. Buscar visitas (1 MLB por vez, endpoint não aceita lote)
      const visitCounts: Record<string, number> = {};
      const date_from_str = dateFrom.slice(0, 10);
      const date_to_str   = dateTo.slice(0, 10);

      const batchSize = 20;
      for (let i = 0; i < itemIds.length; i += batchSize) {
        const batch = itemIds.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (mlb) => {
            try {
              const url = `/items/visits?ids=${mlb}&date_from=${date_from_str}&date_to=${date_to_str}`;
              const vData = await mlFetch(account, url);
              if (Array.isArray(vData)) {
                visitCounts[mlb] = vData[0]?.total_visits || 0;
              } else if (typeof vData === 'object') {
                visitCounts[mlb] = vData.total_visits || 0;
              } else {
                visitCounts[mlb] = 0;
              }
            } catch {
              visitCounts[mlb] = 0;
            }
          })
        );
      }

      // 4. Buscar vendas do período
      const salesCount: Record<string, { vendas: number; canceladas: number }> = {};
      const isoFrom = `${dateFrom}T00:00:00.000-03:00`;
      const isoTo = `${dateTo}T23:59:59.999-03:00`;
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const oData = await mlFetch(account,
          `/orders/search?seller=${sellerId}&order.date_created.from=${encodeURIComponent(isoFrom)}&order.date_created.to=${encodeURIComponent(isoTo)}&limit=50&offset=${offset}`
        );
        for (const o of (oData.results || [])) {
          for (const oi of (o.order_items || [])) {
            const mlb = oi.item?.id;
            if (!mlb) continue;
            if (!salesCount[mlb]) salesCount[mlb] = { vendas: 0, canceladas: 0 };
            if (o.status === 'cancelled') {
              salesCount[mlb].canceladas += oi.quantity || 1;
            } else {
              salesCount[mlb].vendas += oi.quantity || 1;
            }
          }
        }
        offset += 50;
        hasMore = offset < (oData.paging?.total || 0);
      }

      // Fix 3: Data Ref em formato BR
      function formatDateBR(ds: string): string {
        const [y, m, d] = ds.split('-');
        return `${d}/${m}/${y}`;
      }
      const dataRef = `${formatDateBR(dateFrom)} a ${formatDateBR(dateTo)}`;

      // 5. Montar linhas
      const rows: any[][] = [];
      for (const itemId of itemIds) {
        const det = itemDetails[itemId] || {};
        const vis = visitCounts[itemId] || 0;
        const sales = salesCount[itemId] || { vendas: 0, canceladas: 0 };
        // Fix 4: Conversão com vírgula
        const convNum = vis > 0 ? ((sales.vendas / vis) * 100) : 0;
        const convStr = convNum.toFixed(2).replace('.', ',') + '%';
        // Fix 4: Preço formatado R$
        const precoStr = `R$ ${(det.price || 0).toFixed(2).replace('.', ',')}`;
        rows.push([
          'Mercado Livre',    // Plataforma
          itemId,             // ID Anúncio
          det.sku || 'SEM_SKU', // SKU
          det.title || '',    // Título
          precoStr,           // Preço (R$ 1.234,56)
          vis,                // Visitas
          sales.vendas,       // Vendas
          sales.canceladas,   // Canceladas
          convStr,            // Conversão % (7,08%)
          det.permalink || '',// Link
          account.nome,       // Conta (nome completo)
          dataRef,            // Data Ref (DD/MM/YYYY a DD/MM/YYYY)
        ]);
      }

      // 6. Condicional APPEND (escrever header apenas se aba estiver vazia)
      if (rows.length > 0) {
        let isAbaEmpty = true;
        try {
          const res = await invokeGsFunction('read', {
            spreadsheetId: sheetId,
            range: `${sheetTab}!A1:A1`
          });
          if (res.values && res.values.length > 0 && res.values[0] && res.values[0][0]) {
            isAbaEmpty = false;
          }
        } catch { /* assume empty if error (sheet might not exist yet) */ }

        const header = ['Plataforma', 'ID Anúncio', 'SKU', 'Título', 'Preço', 'Visitas', 'Vendas', 'Canceladas', 'Conversão %', 'Link', 'Conta', 'Data Ref'];
        const finalValues = isAbaEmpty ? [header, ...rows] : rows;
        
        await invokeSheets(sheetId, `${sheetTab}!A:L`, finalValues, 'append');
      }

      const msg = `Performance ${account.nome}: ${rows.length} itens em ${sheetTab}`;
      console.log(`[PERF] ${msg}`);
      return new Response(JSON.stringify({ mensagem: msg, itens_processados: rows.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══ VENDAS FULL 7 DIAS (V7) → GOOGLE SHEETS ══════════════════════════
    if (action === 'get_vendas_full_7d') {
      if (!account_id) throw new Error('account_id is required');
      const accountsRes = await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`);
      const accounts = await accountsRes.json();
      if (!accounts?.length) throw new Error('Conta ML não encontrada');
      const account = accounts[0];

      let sellerId = account.seller_id;
      if (!sellerId) {
        const me = await mlFetch(account, '/users/me');
        sellerId = me.id;
        await supabaseFetch(`/ml_accounts?id=eq.${account.id}`, {
          method: 'PATCH', body: JSON.stringify({ seller_id: String(sellerId) }),
        });
      }

      const sheetId = reqSpreadsheetId || PLANILHA_MESTRA;
      const contaLabel = (account.nome || '').trim().toUpperCase();
      const sheetTab = reqSheetName || `V7-${contaLabel}`;

      // Últimos 7 dias (fuso BR)
      const agoraBR = new Date(new Date().toLocaleString('en-US', {timeZone: 'America/Sao_Paulo'}));
      const dateFromDT = new Date(agoraBR);
      dateFromDT.setDate(dateFromDT.getDate() - 7);

      const isoFrom = `${dateFromDT.toISOString().slice(0,10)}T00:00:00.000-03:00`;
      const isoTo = `${agoraBR.toISOString().slice(0,10)}T23:59:59.999-03:00`;

      // Buscar pedidos paginados
      const skuSales: Record<string, number> = {};
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const oData = await mlFetch(account,
          `/orders/search?seller=${sellerId}&order.date_created.from=${encodeURIComponent(isoFrom)}&order.date_created.to=${encodeURIComponent(isoTo)}&limit=50&offset=${offset}`
        );

        for (const o of (oData.results || [])) {
          if (o.status === 'cancelled') continue;

          // Verificar se é fulfilled (Full)
          const logType = o.shipping?.logistic_type || '';
          const isFull = logType.toLowerCase().includes('fulfillment') || logType.toLowerCase().includes('full');
          if (!isFull) continue;

          for (const oi of (o.order_items || [])) {
            const sku = oi.item?.seller_sku || oi.item?.id || '';
            const qty = oi.quantity || 1;
            if (sku && !sku.startsWith('MLB')) {
              skuSales[sku] = (skuSales[sku] || 0) + qty;
            } else {
              // Para itens sem SKU ou se a chave inicial for MLB
              const mlbId = sku.startsWith('MLB') ? sku : (oi.item?.id || 'SEM_SKU');
              skuSales[mlbId] = (skuSales[mlbId] || 0) + qty;
            }
          }
        }

        offset += 50;
        hasMore = offset < (oData.paging?.total || 0);
      }

      // Resolver SKUs que vieram como MLB IDs
      const unresolvedIds = Object.keys(skuSales).filter(k => k.startsWith('MLB'));
      if (unresolvedIds.length > 0) {
        for (let i = 0; i < unresolvedIds.length; i += 20) {
          const batch = unresolvedIds.slice(i, i + 20).join(',');
          try {
            const batchData = await mlFetch(account, `/items?ids=${batch}&attributes=id,seller_custom_field,variations`);
            for (const d of batchData) {
              if (d.code === 200 && d.body) {
                const skuVar = (d.body.variations || []).map((v: any) => {
                  const sa = (v.attribute_combinations || []).find((a: any) => a.id === 'SELLER_SKU');
                  return sa?.value_name || '';
                }).filter(Boolean);
                const resolvedSku = d.body.seller_custom_field || skuVar[0] || d.body.id;
                if (resolvedSku !== d.body.id) {
                  const qty = skuSales[d.body.id] || 0;
                  delete skuSales[d.body.id];
                  skuSales[resolvedSku] = (skuSales[resolvedSku] || 0) + qty;
                }
              }
            }
          } catch { /* skip */ }
        }
      }

      // Montar linhas — SOBRESCREVE
      const agora = new Date(new Date().toLocaleString('en-US', {timeZone: 'America/Sao_Paulo'}));
      const dataRef = `${String(agora.getDate()).padStart(2, '0')}/${String(agora.getMonth() + 1).padStart(2, '0')}/${agora.getFullYear()}`;
      
      const header = ['Conta', 'SKU', 'Unidades Vendidas (7d)', 'Data Ref'];
      const rows: any[][] = Object.entries(skuSales)
        .sort((a, b) => b[1] - a[1])
        .map(([sku, qty]) => [account.nome, sku, qty, dataRef]);

      if (rows.length > 0) {
        try {
          await invokeGsFunction('clear', {
            spreadsheetId: sheetId,
            range: sheetTab
          });
        } catch { /* ignora erro de clear se aba não existir */ }

        await invokeSheets(sheetId, `${sheetTab}!A1`, [header, ...rows], 'write');
      }

      const msg = `V7 ${account.nome}: ${rows.length} SKUs em ${sheetTab}`;
      console.log(`[V7] ${msg}`);
      return new Response(JSON.stringify({ mensagem: msg, skus_processados: rows.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══ ADS FULL REPORT → GOOGLE SHEETS ════════════════════════════════════
    if (action === 'get_ads_full_report') {
      if (!account_id) throw new Error('account_id is required');
      const accountsRes = await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`);
      const accounts = await accountsRes.json();
      if (!accounts?.length) throw new Error('Conta ML não encontrada');
      const account = accounts[0];

      const dateFrom = reqDateFrom || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const dateTo = reqDateTo || dateFrom;
      const adType = reqAdType || 'product_ads';
      const sheetId = reqSpreadsheetId || PLANILHA_MESTRA;
      const sheetAds = reqSheetName || 'ADS';
      const sheetTotal = reqSheetPrefix || 'ADS-TOTAL-ML';

      // Discover advertiser_id
      let token = account.access_token;
      if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
        token = await refreshToken(account);
      }

      const productId = adType === 'product_ads' ? 'PADS' :
                        adType === 'brand_ads' ? 'BADS' : 'DISPLAY';
      const apiVersion = adType === 'product_ads' ? '2' : '1';

      const advRes = await fetch(`${ML_API}/advertising/advertisers?product_id=${productId}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Api-Version': '1' },
      });
      const advData = await advRes.json();
      const mlbAdv = (advData?.advertisers || []).find((a: any) => a.site_id === 'MLB');

      if (!mlbAdv) {
        return new Response(JSON.stringify({ mensagem: `${adType} não habilitado para ${account.nome}`, linhas_ads: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const advId = mlbAdv.advertiser_id;
      const siteId = mlbAdv.site_id;

      const detailedRows: any[][] = [];
      const summaryRows: any[][] = [];
      const metricsFields = 'clicks,prints,cost,direct_amount,direct_items_quantity,total_amount';

      // Loop dia a dia (obrigatório para ADS ML API)
      const startDate = new Date(`${dateFrom}T12:00:00`);
      const endDate = new Date(`${dateTo}T12:00:00`);

      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dayStr = d.toISOString().slice(0, 10);
        let dailyCost = 0;

        try {
          // Fetch ads for this specific day
          const adsUrl = `${ML_API}/advertising/${siteId}/advertisers/${advId}/product_ads/ads/search?limit=50&offset=0&date_from=${dayStr}&date_to=${dayStr}&metrics=${metricsFields}&sort_by=cost&sort=desc`;
          const adsRes = await fetch(adsUrl, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Api-Version': apiVersion },
          });

          if (adsRes.status === 401) {
            token = await refreshToken(account);
            const retryRes = await fetch(adsUrl, {
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Api-Version': apiVersion },
            });
            if (!retryRes.ok) continue;
            var adsData = await retryRes.json();
          } else if (!adsRes.ok) {
            continue;
          } else {
            var adsData = await adsRes.json();
          }

          for (const ad of (adsData?.results || [])) {
            const m = ad.metrics || {};
            const investimento = m.cost || 0;
            const receita = m.total_amount || m.direct_amount || 0;
            const vendas = m.direct_items_quantity || 0;
            const cliques = m.clicks || 0;
            const impressoes = m.prints || 0;
            const acos = receita > 0 ? ((investimento / receita) * 100).toFixed(2) : '0';
            const roas = investimento > 0 ? (receita / investimento).toFixed(2) : '0';

            dailyCost += investimento;

            detailedRows.push([
              adType === 'product_ads' ? 'PADS' : adType === 'brand_ads' ? 'BADS' : 'DISPLAY',
              dayStr,                               // Data Ref
              account.nome,                         // Conta
              '',                                   // Campanha (optional)
              ad.campaign_id || '',                  // ID Campanha
              ad.item_id || '',                      // ID Anúncio
              ad.title || '',                        // Título
              investimento,                         // Investimento
              receita,                              // Receita
              vendas,                               // Vendas (Qtd)
              `${acos}%`,                           // ACOS
              roas,                                 // ROAS
              cliques,                              // Cliques
              impressoes,                           // Impressões
              new Date().toISOString().slice(0, 19), // Ult. Atualização
            ]);
          }
        } catch (err) {
          console.error(`[ADS] Erro dia ${dayStr} ${account.nome}:`, err);
        }

        // Resumo diário
        if (dailyCost > 0) {
          summaryRows.push([dayStr, account.nome, dailyCost]);
        }
      }

      // Escrever nas sheets
      if (detailedRows.length > 0) {
        await invokeSheets(sheetId, `${sheetAds}!A:O`, detailedRows, 'append');
      }
      if (summaryRows.length > 0) {
        await invokeSheets(sheetId, `${sheetTotal}!A:C`, summaryRows, 'append');
      }

      const msg = `ADS ${account.nome}: ${detailedRows.length} linhas detalhadas, ${summaryRows.length} resumos`;
      console.log(`[ADS-SYNC] ${msg}`);
      return new Response(JSON.stringify({
        mensagem: msg,
        linhas_ads: detailedRows.length,
        linhas_resumo: summaryRows.length,
      }), {
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
