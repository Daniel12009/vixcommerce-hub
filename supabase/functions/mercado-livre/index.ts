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
async function invokeSheets(spreadsheetId: string, range: string, values: any[][], action: 'append' | 'write' | 'dedup_write' = 'append', dateColumn?: number, contaColumn?: number) {
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

  const payload: any = { action, spreadsheetId, range: normalizedRange, values };
  if (action === 'dedup_write' && dateColumn !== undefined) {
    payload.dateColumn = dateColumn;
  }
  if (action === 'dedup_write' && contaColumn !== undefined) {
    payload.contaColumn = contaColumn;
  }

  const res = await fetch(gsUrl, {
    method: 'POST', headers: gsHeaders,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets ${action} failed: ${err}`);
  }
  return res.json();
}

const PLANILHA_MESTRA = '1lMq5aeInwwv7st8-Rf-S8NYQJaQKkSbSD7PjtFhtPms';

// ═══════════════════════════════════════════════════════════════════
// UTILITÁRIOS — equivalentes exatos às funções Python
// ═══════════════════════════════════════════════════════════════════

const MAPA_ESTADOS: Record<string, string> = {
  'AC':'Acre','AL':'Alagoas','AP':'Amapá','AM':'Amazonas','BA':'Bahia',
  'CE':'Ceará','DF':'Distrito Federal','ES':'Espírito Santo','GO':'Goiás',
  'MA':'Maranhão','MT':'Mato Grosso','MS':'Mato Grosso do Sul','MG':'Minas Gerais',
  'PA':'Pará','PB':'Paraíba','PR':'Paraná','PE':'Pernambuco','PI':'Piauí',
  'RJ':'Rio de Janeiro','RN':'Rio Grande do Norte','RS':'Rio Grande do Sul',
  'RO':'Rondônia','RR':'Roraima','SC':'Santa Catarina','SP':'São Paulo',
  'SE':'Sergipe','TO':'Tocantins',
};

function traduzirEstado(entrada: string): string {
  if (!entrada) return 'Não Identificado';
  const s = String(entrada).trim().toUpperCase();
  if (s.length === 2) return MAPA_ESTADOS[s] || entrada;
  return entrada.trim();
}

function formatarDataBR(isoDate: string): string {
  if (!isoDate) return '';
  try {
    const dt = new Date(isoDate.replace('Z', '+00:00'));
    return dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return isoDate.slice(0, 10);
  }
}

function formatarPreco(valor: number): string {
  const parts = valor.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${parts[0]},${parts[1]}`;
}

function toStringDecimal(v: number): string {
  return v.toFixed(2).replace('.', ',');
}

function fmtDataRef(d: string): string {
  const [y, m, dia] = d.split('-');
  return `${dia}/${m}/${y}`;
}

async function consultarFrete(
  shipId: string | number | null,
  token: string,
  account: any
): Promise<{ custosPorItem: Record<string, number>; estado: string; tipo_log: string; cidade_dest: string }> {
  if (!shipId) return { custosPorItem: {}, estado: '', tipo_log: 'Mercado Envios', cidade_dest: '' };
  try {
    let res = await fetch(`${ML_API}/shipments/${shipId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.status === 401) {
      token = await refreshToken(account);
      res = await fetch(`${ML_API}/shipments/${shipId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
    }
    if (!res.ok) return { custosPorItem: {}, estado: '', tipo_log: 'Mercado Envios', cidade_dest: '' };

    const d = await res.json();

    // CÁLCULO REAL: Custo total da etiqueta - Valor pago pelo comprador
    const etiqueta_total = parseFloat(String(d.shipping_option?.list_cost ?? 0)) || 0;
    const pago_pelo_comprador = parseFloat(String(d.shipping_option?.cost ?? 0)) || 0;
    let custo_vendedor = etiqueta_total - pago_pelo_comprador;
    if (custo_vendedor < 0.01) custo_vendedor = 0;

    // Dividir por item (dict)
    const custosPorItem: Record<string, number> = {};
    const items_shipping = d.shipping_items || [];
    if (items_shipping.length > 0 && custo_vendedor > 0) {
      const valor_por_item = custo_vendedor / items_shipping.length;
      for (const it of items_shipping) {
        custosPorItem[String(it.id)] = valor_por_item;
      }
    }

    const rec = d.receiver_address || {};
    const est_sigla = rec.state?.name || rec.city?.state_name || '';
    const estado = traduzirEstado(est_sigla);
    const cidade_dest = rec.city?.name || '';

    const ltype = d.logistic_type || '';
    const tags: string[] = d.tags || [];
    const mode = d.mode || '';

    let tipo_log = 'Mercado Envios';
    if (ltype === 'fulfillment') {
      tipo_log = 'Mercado Envios Full';
    } else if (['self_service', 'flex'].includes(ltype) || tags.includes('self_service_in') || mode === 'me1') {
      tipo_log = 'Mercado Envios Flex';
    } else if (ltype === 'cross_docking') {
      tipo_log = 'Mercado Envios Coleta';
    } else if (['drop_off', 'xd_drop_off'].includes(ltype)) {
      tipo_log = 'Mercado Envios Agência';
    }

    return { custosPorItem, estado, tipo_log, cidade_dest };
  } catch {
    return { custosPorItem: {}, estado: '', tipo_log: 'Mercado Envios', cidade_dest: '' };
  }
}

async function processarVendaMLSingle(
  venda: any,
  token: string,
  account: any,
  dtIni: Date,
  dtFim: Date,
  contagemPacks: Record<string, number>,
  sellerId: string | number,
  listingTypeMap: Record<string, string> = {}
): Promise<any[][]> {
  try {
    if (venda.status === 'cancelled') return [];

    const dtVendaStr = venda.date_created;
    if (dtVendaStr) {
      const dtVenda = new Date(dtVendaStr.replace('Z', '+00:00'));
      if (dtVenda < dtIni || dtVenda > dtFim) return [];
    }

    const vid = venda.id;
    const pid = venda.pack_id;
    let sid = venda.shipping?.id;

    const id_referencia_pedido = pid ? String(pid) : String(vid);

    if (!sid && pid) {
      try {
        const rp = await fetch(`${ML_API}/packs/${pid}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (rp.ok) {
          sid = (await rp.json()).shipment?.id;
        }
      } catch { /* ignorar */ }
    }


    const { custosPorItem, estado: estadoFrete, tipo_log: tipoLogInicial, cidade_dest } =
      await consultarFrete(sid, token, account);

    let tipo_log = tipoLogInicial;
    let estado = estadoFrete;

    const linhas: any[][] = [];
    const orderItems: any[] = venda.order_items || [];

    for (const item of orderItems) {
      const item_obj = item.item || {};
      const ml_id = item_obj.id || '';
      const sku = item_obj.seller_custom_field || item_obj.seller_sku || ml_id;
      const preco = parseFloat(String(item.unit_price ?? 0)) || 0;
      const qtd = parseInt(String(item.quantity ?? 1)) || 1;
      const valor_total_item = preco * qtd;

      if (tipo_log !== 'Mercado Envios Flex') {
        const node = item.stock?.node_id;
        if (node && String(node).startsWith('BR')) {
          tipo_log = 'Mercado Envios Full';
        }
      }

      let custo_calc = 0;
      if (tipo_log === 'Mercado Envios Flex') {
        const cidade_limpa = String(cidade_dest).trim().toLowerCase();
        if (cidade_limpa.includes('curitiba')) {
          custo_calc = valor_total_item <= 79.00 ? 0 : 8.01;
        } else {
          custo_calc = valor_total_item <= 79.00 ? 5.00 : 12.81;
        }
      } else {
        // Python doc 27: direto do dict, sem threshold de R$79
        custo_calc = custosPorItem[String(ml_id)] ?? 0;
      }

      if (custo_calc > 0) custo_calc = custo_calc * -1;
      custo_calc = Math.round(custo_calc * 100) / 100;

      if (!estado) estado = 'Não Identificado';

      const fee = parseFloat(String(item.sale_fee ?? 0)) || 0;
      const fee_total_neg = -1 * (fee * qtd);

      // Bug fix: prefixar datas com apóstrofo para forçar texto no Sheets
      const data_criacao = `'${formatarDataBR(venda.date_created || '')}`;
      const data_fechamento = `'${formatarDataBR(venda.date_closed || '')}`;
      const id_venda_str = `="${id_referencia_pedido}"`;

      // Prioridade: batch lookup > order_item > item.item
      const listing_type_id = listingTypeMap[ml_id] || item.listing_type_id || item.item?.listing_type_id || item.item?.listing_type?.id || '';
      console.log('[listing_type_id]', ml_id, 'map:', listingTypeMap[ml_id], 'item:', item.listing_type_id, 'final:', listing_type_id);

      linhas.push([
        sku,
        sku,
        data_criacao,
        data_fechamento,
        id_venda_str,
        'Mercado Livre',
        ml_id,
        String(listing_type_id).toLowerCase().includes('gold_special') ? 'Clássico' : 'Premium',
        '',
        tipo_log,
        preco,
        qtd,
        valor_total_item,
        custo_calc,
        0,
        Math.round(fee_total_neg * 100) / 100,
        '',
        venda.seller?.nickname || account.nome || '',
        estado,
      ]);
    }

    return linhas;
  } catch (err) {
    console.error('[processarVendaMLSingle] erro:', err);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, account_id, sku, item_id, fields, description_text, new_item, query, category_id, promotion_id, status: reqStatus, offset: reqOffset, limit: reqLimit, date_from: reqDateFrom, date_to: reqDateTo, campaign_id: reqCampaignId, budget: reqBudget, roas_target: reqRoasTarget, spreadsheet_id: reqSpreadsheetId, sheet_name: reqSheetName, sheet_name_prefix: reqSheetPrefix, ad_type: reqAdType, question_id, text, seller_id } = await req.json();

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
                account_id: account.id,
                conta: account.nome || account.nickname || 'Conta ML',
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

    if (action === 'answer_question') {
      if (!question_id || !text) throw new Error('question_id and text are required');

      const accountsRes = account_id 
        ? await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`)
        : await supabaseFetch(`/ml_accounts?seller_id=eq.${seller_id}&ativo=eq.true`);
      const accounts = await accountsRes.json();
      if (!accounts?.length) throw new Error('Conta ML não encontrada');
      const account = accounts[0];

      let token = account.access_token;
      if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
        token = await refreshToken(account);
      }
      
      const mlRes = await fetch(`${ML_API}/answers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ question_id, text })
      });
      
      if (!mlRes.ok) throw new Error(`Erro ao responder no ML: ${await mlRes.text()}`);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

      let token = account.access_token;
      if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
        token = await refreshToken(account);
      }

      let sellerId = account.seller_id;
      if (!sellerId) {
        const me = await fetch(`${ML_API}/users/me`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!me.ok) throw new Error(`Erro ao buscar seller_id: ${await me.text()}`);
        sellerId = (await me.json()).id;
        await supabaseFetch(`/ml_accounts?id=eq.${account.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ seller_id: String(sellerId) }),
        });
      }

      const dateFrom = reqDateFrom || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const dateTo   = reqDateTo   || dateFrom;
      const sheetId  = reqSpreadsheetId || account.spreadsheet_id || PLANILHA_MESTRA;
      const sheetTab = reqSheetName     || account.sheet_name     || 'VendasML';

      const isoFrom = `${dateFrom}T00:00:00.000-03:00`;
      const isoTo   = `${dateTo}T23:59:59.999-03:00`;

      const dtIni = new Date(`${dateFrom}T00:00:00-03:00`);
      const dtFim = new Date(`${dateTo}T23:59:59-03:00`);

      const todasVendas: any[] = [];
      let offset = 0;
      const limit = 50;

      while (true) {
        const url = `${ML_API}/orders/search?seller=${sellerId}&order.date_created.from=${encodeURIComponent(isoFrom)}&order.date_created.to=${encodeURIComponent(isoTo)}&sort=date_desc&limit=${limit}&offset=${offset}`;

        let res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.status === 401) {
          token = await refreshToken(account);
          res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        }
        if (!res.ok) throw new Error(`Erro orders/search: ${await res.text()}`);

        const data = await res.json();
        const results: any[] = data.results || [];
        if (results.length === 0) break;

        todasVendas.push(...results);
        if (results.length < limit) break;
        offset += limit;

        await new Promise(r => setTimeout(r, 300));
      }

      if (todasVendas.length === 0) {
        return new Response(JSON.stringify({ mensagem: 'Nenhuma venda encontrada no período.', linhas_escritas: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const contagemPacks: Record<string, number> = {};
      for (const v of todasVendas) {
        if (v.pack_id) {
          contagemPacks[String(v.pack_id)] = (contagemPacks[String(v.pack_id)] || 0) + 1;
        }
      }

      // Batch lookup listing_type_id via /items API
      const mlIdsUnicos = new Set<string>();
      for (const v of todasVendas) {
        for (const oi of (v.order_items || [])) {
          if (oi.item?.id) mlIdsUnicos.add(oi.item.id);
        }
      }
      const listingTypeMap: Record<string, string> = {};
      const mlIdsList = Array.from(mlIdsUnicos);
      for (let i = 0; i < mlIdsList.length; i += 20) {
        const chunk = mlIdsList.slice(i, i + 20).join(',');
        try {
          const res = await fetch(
            `${ML_API}/items?ids=${chunk}&attributes=id,listing_type_id`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          if (res.ok) {
            const data = await res.json();
            for (const it of data) {
              if (it.code === 200 && it.body) {
                listingTypeMap[it.body.id] = it.body.listing_type_id || '';
              }
            }
          }
        } catch { /* ignora */ }
      }
      console.log(`[SYNC] listingTypeMap: ${Object.keys(listingTypeMap).length} itens mapeados`);

      const loteLinhas: any[][] = [];
      const BATCH = 10;

      for (let i = 0; i < todasVendas.length; i += BATCH) {
        const batch = todasVendas.slice(i, i + BATCH);
        const batchResults = await Promise.all(
          batch.map(venda => processarVendaMLSingle(venda, token, account, dtIni, dtFim, contagemPacks, sellerId, listingTypeMap))
        );
        for (const linhas of batchResults) {
          if (linhas.length > 0) loteLinhas.push(...linhas);
        }
      }

      if (loteLinhas.length > 0) {
        // Dedup: VendasML has date created at column 2 (index 2: "Data de Criação")
        // But date could also be used at column 11 if there is a 'Data Ref' instead?
        // Let's use date created (index 2). Wait, earlier we saw VendasML has Data Ref at col 11 (Actually col 2 is Data Criação, VendasML is what?).
        // For vendas, the data processed is 'dateFrom', which might be passed as a ref.
        // Actually earlier it was appending. Let's use column 2 (Data de Criação) for VendasML which has `'DD/MM/YYYY`.
        await invokeSheets(sheetId, `${sheetTab}!A:S`, loteLinhas, 'dedup_write', 2);
      }

      const msg = `ML Vendas ${account.nome}: ${loteLinhas.length} linhas em ${sheetTab} (${dateFrom})`;
      console.log(`[SYNC] ${msg}`);
      return new Response(JSON.stringify({ mensagem: msg, linhas_escritas: loteLinhas.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══ PERFORMANCE CATÁLOGO ML → GOOGLE SHEETS ════════════════════════════
    if (action === 'get_performance_catalog') {
      if (!account_id) throw new Error('account_id is required');

      const accountsRes = await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`);
      const accounts = await accountsRes.json();
      if (!accounts?.length) throw new Error('Conta ML não encontrada');
      const account = accounts[0];

      let token = account.access_token;
      if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
        token = await refreshToken(account);
      }

      let sellerId = account.seller_id;
      if (!sellerId) {
        const me = await fetch(`${ML_API}/users/me`, { headers: { 'Authorization': `Bearer ${token}` } });
        sellerId = (await me.json()).id;
        await supabaseFetch(`/ml_accounts?id=eq.${account.id}`, {
          method: 'PATCH', body: JSON.stringify({ seller_id: String(sellerId) }),
        });
      }

      const ontem = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      ontem.setDate(ontem.getDate() - 1);
      const defaultDate = ontem.toISOString().slice(0, 10);

      const dateFrom = reqDateFrom || defaultDate;
      const dateTo   = reqDateTo   || dateFrom;
      const sheetId  = reqSpreadsheetId || account.spreadsheet_id || PLANILHA_MESTRA;

      const contaUpper = (account.nome || '').trim().toUpperCase();
      const nomeAba = `PERF-${contaUpper}`;

      // PASSO 1: buscar TODOS os itens ativos da conta (sem restringir a full ou catálogo)
      const itemIds: string[] = [];
      let searchOffset = 0;
      while (true) {
        let res = await fetch(
          `${ML_API}/users/${sellerId}/items/search?status=active&limit=50&offset=${searchOffset}`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (res.status === 401) { token = await refreshToken(account); res = await fetch(`${ML_API}/users/${sellerId}/items/search?status=active&limit=50&offset=${searchOffset}`, { headers: { 'Authorization': `Bearer ${token}` } }); }
        if (!res.ok) break;
        const data = await res.json();
        const results: string[] = data.results || [];
        if (results.length === 0) break;
        itemIds.push(...results);
        if (results.length < 50) break;
        searchOffset += 50;
      }

      console.log(`[PERF] ${account.nome}: ${itemIds.length} itens Full catálogo`);
      if (itemIds.length === 0) {
        return new Response(JSON.stringify({ mensagem: `Nenhum item Full encontrado para ${account.nome}`, itens_processados: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // PASSO 2: detalhes (chunks de 20)
      const detalhes: Record<string, { sku: string; titulo: string; link: string; preco: number }> = {};
      for (let i = 0; i < itemIds.length; i += 20) {
        const chunk = itemIds.slice(i, i + 20).join(',');
        try {
          let res = await fetch(`${ML_API}/items?ids=${chunk}&attributes=id,title,permalink,seller_custom_field,attributes`, { headers: { 'Authorization': `Bearer ${token}` } });
          if (res.status === 401) { token = await refreshToken(account); res = await fetch(`${ML_API}/items?ids=${chunk}&attributes=id,title,permalink,seller_custom_field,attributes`, { headers: { 'Authorization': `Bearer ${token}` } }); }
          if (!res.ok) continue;
          const batchData = await res.json();
          for (const item of batchData) {
            if (item.code !== 200 || !item.body) continue;
            const b = item.body;
            let sku: string = b.seller_custom_field || '';
            if (!sku) {
              const attrSku = (b.attributes || []).find((a: any) => a.id === 'SELLER_SKU');
              sku = attrSku?.value_name || '';
            }
            if (!sku) sku = 'SEM_SKU';
            detalhes[b.id] = { sku, titulo: b.title || '', link: b.permalink || '', preco: 0 };
          }
        } catch { /* continua */ }
      }

      // Preços
      await Promise.all(itemIds.map(async (mlb) => {
        try {
          const res = await fetch(`${ML_API}/items/${mlb}/sale_price?context=channel_marketplace`, { headers: { 'Authorization': `Bearer ${token}` } });
          if (res.ok) {
            const p = (await res.json()).amount || 0;
            if (detalhes[mlb] && p > 0) detalhes[mlb].preco = p;
          }
        } catch { /* ignora */ }
      }));

      // PASSO 3: visitas
      const date_from_str = dateFrom.slice(0, 10);
      const date_to_str = dateTo.slice(0, 10);
      const visitas: Record<string, number> = {};
      for (let i = 0; i < itemIds.length; i += 20) {
        const batch = itemIds.slice(i, i + 20);
        await Promise.all(batch.map(async (mlb) => {
          try {
            const url = `${ML_API}/items/visits?ids=${mlb}&date_from=${date_from_str}&date_to=${date_to_str}`;
            let res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.status === 401) { token = await refreshToken(account); res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } }); }
            if (!res.ok) { visitas[mlb] = 0; return; }
            const dados = await res.json();
            if (Array.isArray(dados)) {
              visitas[mlb] = parseInt(String(dados[0]?.total_visits ?? 0)) || 0;
            } else if (dados && typeof dados === 'object') {
              visitas[mlb] = parseInt(String(dados.total_visits ?? dados[mlb]?.total_visits ?? 0)) || 0;
            } else {
              visitas[mlb] = 0;
            }
          } catch { visitas[mlb] = 0; }
        }));
      }

      // PASSO 4: vendas
      const vendas: Record<string, { total: number; canceladas: number }> = {};
      for (const mlb of itemIds) vendas[mlb] = { total: 0, canceladas: 0 };
      const setItems = new Set(itemIds);
      const isoFrom = `${dateFrom}T00:00:00.000-03:00`;
      const isoTo = `${dateTo}T23:59:59.999-03:00`;
      let offset = 0;
      while (true) {
        let res = await fetch(`${ML_API}/orders/search?seller=${sellerId}&order.date_created.from=${encodeURIComponent(isoFrom)}&order.date_created.to=${encodeURIComponent(isoTo)}&limit=50&offset=${offset}`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.status === 401) { token = await refreshToken(account); continue; }
        if (!res.ok) break;
        const oData = await res.json();
        const results = oData.results || [];
        if (results.length === 0) break;
        for (const o of results) {
          const st: string = o.status;
          if (!['paid', 'confirmed', 'payment_required', 'cancelled'].includes(st)) continue;
          for (const oi of (o.order_items || [])) {
            const mid: string = oi.item?.id;
            if (!mid || !setItems.has(mid)) continue;
            vendas[mid].total += 1;
            if (st === 'cancelled') vendas[mid].canceladas += 1;
          }
        }
        if (results.length < 50) break;
        offset += 50;
      }

      // PASSO 4.5: HEALTH via Purchase Experience Integrators (correct API)
      const healthData: Record<string, { health: number; actions: any[]; rep_text: string; rep_color: string }> = {};
      const BATCH_SIZE = 5; // small batch to respect rate limits
      for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
        const batch = itemIds.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (mlb) => {
          try {
            let res = await fetch(`${ML_API}/reputation/items/${mlb}/purchase_experience/integrators?locale=pt_BR`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.status === 401) { 
              token = await refreshToken(account); 
              res = await fetch(`${ML_API}/reputation/items/${mlb}/purchase_experience/integrators?locale=pt_BR`, { headers: { 'Authorization': `Bearer ${token}` } }); 
            }
            if (res.status === 302) {
              const loc = res.headers.get('location');
              if (loc) res = await fetch(loc, { headers: { 'Authorization': `Bearer ${token}` } });
            }
            if (res.ok) {
              const data = await res.json();
              const repValue: number = data.reputation?.value ?? -1;
              const actions = (data.metrics_details?.problems || []).map((p: any) => p.level_two?.title?.text || p.level_two?.title || p.key || '');
              healthData[mlb] = {
                health: repValue >= 0 ? repValue / 100 : 0,
                actions,
                rep_text: data.reputation?.text || '',
                rep_color: data.reputation?.color || '',
              };
            }
          } catch { /* ignora */ }
        }));
        await new Promise(r => setTimeout(r, 300)); // avoid rate limits
      }

      const healthInserts = itemIds.map(mlb => ({
         conta: account.nome,
         mlb_id: mlb,
         health: parseFloat((healthData[mlb]?.health ?? 0).toFixed(4)),
         health_actions: healthData[mlb]?.actions ?? [],
         titulo: detalhes[mlb]?.titulo || '',
         sku: detalhes[mlb]?.sku || '',
         reputation_text: healthData[mlb]?.rep_text ?? '',
         reputation_color: healthData[mlb]?.rep_color ?? '',
         snapshot_date: dateTo.slice(0, 10)
      }));
      
      console.log(`[HEALTH] ${account.nome}: ${healthInserts.length} rows to insert`);
      if (healthInserts.length > 0) {
        // Delete existing rows for this account + date to avoid duplicates
        const delRes = await supabaseFetch(
          `/catalog_health_history?conta=eq.${encodeURIComponent(account.nome)}&snapshot_date=eq.${dateTo.slice(0, 10)}`,
          { method: 'DELETE', headers: { 'Prefer': 'return=minimal' } }
        );
        if (!delRes.ok) {
          const txt = await delRes.text();
          console.warn(`[HEALTH_DELETE] ${delRes.status}: ${txt}`);
        }
        // Insert in chunks of 50
        for (let i = 0; i < healthInserts.length; i += 50) {
           const chunk = healthInserts.slice(i, i + 50);
           const insertRes = await supabaseFetch(`/catalog_health_history`, {
             method: 'POST',
             headers: { 'Prefer': 'return=minimal' },
             body: JSON.stringify(chunk)
           });
           if (!insertRes.ok) {
             const errText = await insertRes.text();
             console.error(`[HEALTH_INSERT] Error ${insertRes.status}: ${errText}`);
           } else {
             console.log(`[HEALTH_INSERT] OK chunk ${i}–${i + chunk.length} for ${account.nome}`);
           }
        }
      }

      // PASSO 5: montar linhas
      const dataRef = `${fmtDataRef(dateFrom)} a ${fmtDataRef(dateTo)}`;
      const rows: any[][] = [];
      for (const mlb of itemIds) {
        const d = detalhes[mlb] || { sku: 'SEM_SKU', titulo: '', link: '', preco: 0 };
        const v = visitas[mlb] || 0;
        const s = vendas[mlb] || { total: 0, canceladas: 0 };
        const conv = v > 0 ? s.total / v : 0;
        const precoFmt = formatarPreco(d.preco || 0);
        const convFmt = `${(conv * 100).toFixed(2).replace('.', ',')}%`;
        rows.push(['Mercado Livre', mlb, d.sku, d.titulo, precoFmt, v, s.total, s.canceladas, convFmt, d.link, account.nome, dataRef]);
      }

      // PASSO 6: escrever
      if (rows.length > 0) {
        const header = ['Plataforma', 'ID Anúncio', 'SKU', 'Título', 'Preço', 'Visitas', 'Vendas', 'Canceladas', 'Conversão %', 'Link', 'Conta', 'Data Ref'];
        let abaTemHeader = false;
        try {
          const gsUrl = Deno.env.get('SUPABASE_URL')! + '/functions/v1/google-sheets';
          const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
          const checkRes = await fetch(gsUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({ action: 'read', spreadsheetId: sheetId, range: `'${nomeAba}'!A1:A1` }),
          });
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            abaTemHeader = !!(checkData.values && checkData.values.length > 0 && checkData.values[0]?.[0]);
          }
        } catch { /* assume vazia */ }

        const finalValues = abaTemHeader ? rows : [header, ...rows];
        // For PERF, 'Data Ref' is at column 11 (zero-indexed)
        await invokeSheets(sheetId, `${nomeAba}!A:L`, finalValues, 'dedup_write', 11);
      }

      const msg = `Performance ${account.nome}: ${rows.length} itens em ${nomeAba}`;
      console.log(`[PERF] ${msg}`);
      return new Response(JSON.stringify({ mensagem: msg, itens_processados: rows.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══ VENDAS FULL 7D → GOOGLE SHEETS ═════════════════════════════════════
    if (action === 'get_vendas_full_7d') {
      if (!account_id) throw new Error('account_id is required');

      const accountsRes = await supabaseFetch(`/ml_accounts?id=eq.${account_id}&ativo=eq.true`);
      const accounts = await accountsRes.json();
      if (!accounts?.length) throw new Error('Conta ML não encontrada');
      const account = accounts[0];

      let token = account.access_token;
      if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
        token = await refreshToken(account);
      }

      let sellerId = account.seller_id;
      if (!sellerId) {
        const me = await fetch(`${ML_API}/users/me`, { headers: { 'Authorization': `Bearer ${token}` } });
        sellerId = (await me.json()).id;
        await supabaseFetch(`/ml_accounts?id=eq.${account.id}`, {
          method: 'PATCH', body: JSON.stringify({ seller_id: String(sellerId) }),
        });
      }

      const sheetId = reqSpreadsheetId || PLANILHA_MESTRA;
      const contaUpper = (account.nome || '').trim().toUpperCase();
      const nomeAba = `V7-${contaUpper}`;

      const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const dataInicio = new Date(agora);
      dataInicio.setDate(dataInicio.getDate() - 7);

      const isoFrom = `${dataInicio.toISOString().slice(0, 10)}T00:00:00.000-03:00`;
      const isoTo = `${agora.toISOString().slice(0, 10)}T23:59:59.999-03:00`;

      const vendasSku: Record<string, number> = {};
      let offset = 0;
      while (true) {
        let res = await fetch(
          `${ML_API}/orders/search?seller=${sellerId}&order.date_created.from=${encodeURIComponent(isoFrom)}&order.date_created.to=${encodeURIComponent(isoTo)}&limit=50&offset=${offset}`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (res.status === 401) { token = await refreshToken(account); continue; }
        if (!res.ok) break;
        const oData = await res.json();
        const results = oData.results || [];
        if (results.length === 0) break;

        for (const o of results) {
          if (!['paid', 'confirmed', 'payment_required'].includes(o.status)) continue;
          let is_fulfilled = o.fulfilled === true;
          if (!is_fulfilled) {
            for (const item of (o.order_items || [])) {
              if (item.stock?.node_id) { is_fulfilled = true; break; }
            }
          }
          if (!is_fulfilled) continue;
          for (const oi of (o.order_items || [])) {
            const qtd = parseInt(String(oi.quantity ?? 0)) || 0;
            const chave: string = oi.item?.seller_sku || oi.item?.id || '';
            if (chave) vendasSku[chave] = (vendasSku[chave] || 0) + qtd;
          }
        }
        if (results.length < 50 || offset > 5000) break;
        offset += 50;
      }

      if (Object.keys(vendasSku).length === 0) {
        return new Response(JSON.stringify({ mensagem: 'Nenhuma venda Full encontrada.', skus_processados: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Resolver MLB -> SKU
      const mlbs = Object.keys(vendasSku).filter(k => k.startsWith('MLB'));
      const mapa: Record<string, string> = {};
      if (mlbs.length > 0) {
        for (let i = 0; i < mlbs.length; i += 20) {
          const chunk = mlbs.slice(i, i + 20).join(',');
          try {
            let res = await fetch(`${ML_API}/items?ids=${chunk}&attributes=id,seller_custom_field,attributes`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.status === 401) { token = await refreshToken(account); res = await fetch(`${ML_API}/items?ids=${chunk}&attributes=id,seller_custom_field,attributes`, { headers: { 'Authorization': `Bearer ${token}` } }); }
            if (!res.ok) continue;
            const batchData = await res.json();
            for (const item of batchData) {
              if (item.code !== 200 || !item.body) continue;
              const b = item.body;
              let msku: string = b.seller_custom_field || '';
              if (!msku) {
                const attrSku = (b.attributes || []).find((a: any) => a.id === 'SELLER_SKU');
                msku = attrSku?.value_name || '';
              }
              mapa[b.id] = msku || b.id;
            }
          } catch { /* continua */ }
        }
      }

      const dataHoje = agora.toLocaleDateString('pt-BR');
      const header = ['Conta', 'SKU', 'Unidades Vendidas (7d)', 'Data Ref'];
      const rows: any[][] = [];
      for (const [chave, qtd] of Object.entries(vendasSku)) {
        const real_sku = chave.startsWith('MLB') ? (mapa[chave] || chave) : chave;
        rows.push([contaUpper, real_sku || 'SEM_SKU', qtd, dataHoje]);
      }

      if (rows.length > 0) {
        try {
          const gsUrl = Deno.env.get('SUPABASE_URL')! + '/functions/v1/google-sheets';
          const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
          await fetch(gsUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({ action: 'clear', spreadsheetId: sheetId, range: `'${nomeAba}'` }),
          });
        } catch { /* ignora se aba não existir */ }
        await invokeSheets(sheetId, `${nomeAba}!A1`, [header, ...rows], 'write');
      }

      const msg = `V7 ${account.nome}: ${rows.length} SKUs em ${nomeAba}`;
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

      let token = account.access_token;
      if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
        token = await refreshToken(account);
      }

      const dateFrom = reqDateFrom || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const dateTo   = reqDateTo   || dateFrom;
      const adType   = reqAdType   || 'product_ads';
      const sheetId  = reqSpreadsheetId || PLANILHA_MESTRA;

      let ml_product_id: string;
      let nome_aba: string;
      let endpoint_type: string;
      let metrics_list: string;

      if (adType === 'product_ads') {
        ml_product_id = 'PADS'; nome_aba = 'ADS'; endpoint_type = 'ads';
        metrics_list = 'clicks,prints,cost,direct_amount,direct_items_quantity,total_amount';
      } else if (adType === 'brand_ads') {
        ml_product_id = 'BADS'; nome_aba = 'BRAND'; endpoint_type = 'campaigns';
        metrics_list = 'clicks,prints,consumed_budget,attribution_order_amount,attribution_order_conversions';
      } else if (adType === 'display_ads') {
        ml_product_id = 'DISPLAY'; nome_aba = 'DISPLAY'; endpoint_type = 'campaigns';
        metrics_list = 'clicks,prints,consumed_budget,attribution_order_amount,attribution_order_conversions';
      } else {
        return new Response(JSON.stringify({ mensagem: `Tipo '${adType}' desconhecido`, linhas_ads: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const nome_aba_total = 'ADS-TOTAL-ML';

      let advRes = await fetch(`${ML_API}/advertising/advertisers?product_id=${ml_product_id}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Api-Version': '1' },
      });
      if (advRes.status === 401) {
        token = await refreshToken(account);
        advRes = await fetch(`${ML_API}/advertising/advertisers?product_id=${ml_product_id}`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Api-Version': '1' },
        });
      }
      if (!advRes.ok) {
        return new Response(JSON.stringify({ mensagem: `Erro ao acessar Advertiser: ${await advRes.text()}`, linhas_ads: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const advData = await advRes.json();
      const advertisers = advData.advertisers || [];
      if (advertisers.length === 0) {
        return new Response(JSON.stringify({ mensagem: `Nenhum anunciante ativo para ${adType}`, linhas_ads: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const adv_id: string = String(advertisers[0].advertiser_id);
      const site_id: string = advertisers[0].site_id;

      const mapa_campanhas: Record<string, string> = {};
      if (endpoint_type === 'ads') {
        try {
          const campRes = await fetch(
            `${ML_API}/advertising/${site_id}/advertisers/${adv_id}/product_ads/campaigns/search?limit=100&status=active`,
            { headers: { 'Authorization': `Bearer ${token}`, 'Api-Version': '2' } }
          );
          if (campRes.ok) {
            const campData = await campRes.json();
            for (const c of (campData.results || [])) {
              mapa_campanhas[String(c.id)] = c.name;
            }
          }
        } catch { /* ignora */ }
      }

      const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const nome_conta_upper = (account.nome || '').trim().toUpperCase();
      const nome_conta_formatado = `Mercado Livre|${account.nome}`;

      const linhas_totais: any[][] = [];
      const linhas_resumo: any[][] = [];

      const dtStart = new Date(`${dateFrom}T12:00:00`);
      const dtEnd   = new Date(`${dateTo}T12:00:00`);

      for (let d = new Date(dtStart); d <= dtEnd; d.setDate(d.getDate() + 1)) {
        const dia_atual = d.toISOString().slice(0, 10);
        const data_ref_br = fmtDataRef(dia_atual);
        let total_investido_dia = 0;
        let offset = 0;
        const limit = 50;

        while (true) {
          let url: string;
          let api_ver: string;
          if (endpoint_type === 'ads') {
            url = `${ML_API}/advertising/${site_id}/advertisers/${adv_id}/${adType}/ads/search`;
            api_ver = '2';
          } else {
            url = `${ML_API}/advertising/advertisers/${adv_id}/${adType}/campaigns`;
            api_ver = '1';
          }

          const params = new URLSearchParams({
            limit: String(limit), offset: String(offset),
            date_from: dia_atual, date_to: dia_atual,
            metrics: metrics_list, status: 'active',
          });

          let resp = await fetch(`${url}?${params}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Api-Version': api_ver, 'Content-Type': 'application/json' },
          });
          if (resp.status === 401) {
            token = await refreshToken(account);
            resp = await fetch(`${url}?${params}`, {
              headers: { 'Authorization': `Bearer ${token}`, 'Api-Version': api_ver, 'Content-Type': 'application/json' },
            });
          }
          if (!resp.ok) { console.log(`[ADS] Erro dia ${dia_atual}: ${resp.status}`); break; }

          const payload = await resp.json();
          const items: any[] = payload.results || payload.campaigns || [];
          if (items.length === 0) break;

          for (const item of items) {
            const metrics = item.metrics || {};
            const camp_id = String(item.campaign_id || item.id || '-');
            let id_anuncio: string;
            let titulo: string;
            let nome_campanha: string;
            let custo: number;
            let receita: number;
            let vendas_qtd: number;

            if (endpoint_type === 'ads') {
              id_anuncio = item.item_id || '-';
              titulo = item.title || '-';
              nome_campanha = mapa_campanhas[camp_id] || `Campanha ${camp_id}`;
              custo = parseFloat(String(metrics.cost ?? 0)) || 0;
              receita = parseFloat(String(metrics.direct_amount ?? 0)) || 0;
              vendas_qtd = metrics.direct_items_quantity || 0;
            } else {
              id_anuncio = '-';
              titulo = '-';
              nome_campanha = item.name || `Campanha ${camp_id}`;
              custo = parseFloat(String(metrics.consumed_budget ?? 0)) || 0;
              receita = parseFloat(String(metrics.attribution_order_amount ?? 0)) || 0;
              vendas_qtd = metrics.attribution_order_conversions || 0;
            }

            total_investido_dia += custo;

            if (custo > 0 || (metrics.clicks || 0) > 0) {
              const acos = receita > 0 ? (custo / receita * 100) : 0;
              const roas = custo > 0 ? (receita / custo) : 0;
              linhas_totais.push([
                adType, data_ref_br, nome_conta_formatado, nome_campanha, camp_id,
                id_anuncio, titulo, toStringDecimal(custo), toStringDecimal(receita),
                vendas_qtd, toStringDecimal(acos), toStringDecimal(roas),
                metrics.clicks || 0, metrics.prints || 0, timestamp,
              ]);
            }
          }

          const total = payload.paging?.total || 0;
          if (items.length < limit || (offset + limit) >= total) break;
          offset += limit;
          await new Promise(r => setTimeout(r, 100));
        }

        if (total_investido_dia > 0) {
          linhas_resumo.push([data_ref_br, nome_conta_upper, `R$ ${toStringDecimal(total_investido_dia)}`]);
        }
        await new Promise(r => setTimeout(r, 1000));
      }

      if (linhas_totais.length > 0) {
        // For ADS per-ad, dedup by date (col 1) + conta (col 2)
        await invokeSheets(sheetId, `${nome_aba}!A:O`, linhas_totais, 'dedup_write', 1, 2);
      }
      if (linhas_resumo.length > 0) {
        // For ADS resumo: [data, conta, valor] — dedup by date (col 0) + conta (col 1)
        await invokeSheets(sheetId, `${nome_aba_total}!A:C`, linhas_resumo, 'dedup_write', 0, 1);
      }

      const msg = `ADS ${account.nome}: ${linhas_totais.length} linhas em ${nome_aba}, ${linhas_resumo.length} resumos em ${nome_aba_total}`;
      console.log(`[ADS-SYNC] ${msg}`);
      return new Response(JSON.stringify({ mensagem: msg, linhas_ads: linhas_totais.length, linhas_resumo: linhas_resumo.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_item_status') {
      const { item_id, account_id } = body;
      if (!item_id) throw new Error('item_id is required');
      if (!account_id) throw new Error('account_id is required');

      // Look up account by UUID first (since we now pass UUID from frontend to avoid 400 bad request on seller_id)
      let accountRes = await supabaseFetch(`/ml_accounts?id=eq.${account_id}&limit=1`);
      let accounts = await accountRes.json();
      if (!Array.isArray(accounts) || accounts.length === 0) {
        // Fallback to seller_id if needed
        accountRes = await supabaseFetch(`/ml_accounts?seller_id=eq.${account_id}&limit=1`);
        accounts = await accountRes.json();
      }
      if (!Array.isArray(accounts) || accounts.length === 0) throw new Error(`Account not found: ${account_id}`);
      const account = accounts[0];

      // Fetch purchase experience using the correct endpoint
      let peData: any = null;
      try {
        const res = await fetch(
          `${ML_API}/reputation/items/${item_id}/purchase_experience/integrators?locale=pt_BR`,
          { headers: { 'Authorization': `Bearer ${account.access_token}` } }
        );
        if (res.status === 401) {
          const newToken = await refreshToken(account);
          const res2 = await fetch(
            `${ML_API}/reputation/items/${item_id}/purchase_experience/integrators?locale=pt_BR`,
            { headers: { 'Authorization': `Bearer ${newToken}` } }
          );
          if (res2.ok) peData = await res2.json();
        } else if (res.status === 302) {
          // Item migrated to User Products — follow redirect
          const location = res.headers.get('location');
          if (location) {
            const res3 = await fetch(location, { headers: { 'Authorization': `Bearer ${account.access_token}` } });
            if (res3.ok) peData = await res3.json();
          }
        } else if (res.ok) {
          peData = await res.json();
        } else {
          const err = await res.text();
          console.warn(`[PE] ${item_id} ${res.status}: ${err}`);
        }
      } catch (e) {
        console.error(`[PE] Error for ${item_id}:`, e);
      }

      // Also fetch basic item info
      let itemInfo: any = {};
      try {
        const info = await mlFetch(account, `/items/${item_id}?attributes=id,title,status,listing_type_id,shipping`);
        itemInfo = {
          shipping: info.shipping?.logistic_type || '',
          listing_type: info.listing_type_id || '',
          catalog_listing: info.catalog_listing || false,
          status: info.status || '',
        };
      } catch { /* OK */ }

      return new Response(JSON.stringify({
        purchase_experience: peData,
        ...itemInfo,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    if (action === 'create_catalog_suggestion') {
      const { suggestion, account_id } = body;
      if (!suggestion) throw new Error('suggestion payload is required');
      if (!account_id) throw new Error('account_id is required');

      let accountRes = await supabaseFetch(`/ml_accounts?id=eq.${account_id}&limit=1`);
      let accts = await accountRes.json();
      if (!Array.isArray(accts) || accts.length === 0) throw new Error(`Account not found: ${account_id}`);
      const account = accts[0];

      // POST to Brand Central
      let res = await fetch(`${ML_API}/catalog_suggestions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${account.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(suggestion),
      });

      // Auto-refresh token if 401
      if (res.status === 401) {
        const newToken = await refreshToken(account);
        res = await fetch(`${ML_API}/catalog_suggestions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${newToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(suggestion),
        });
      }

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.message || result.error || `ML catalog_suggestions failed: ${res.status}`);
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── get_listing_types: batch-fetch catalog_listing for performance items ───
    if (action === 'get_listing_types') {
      const { item_ids, account_id } = body;
      if (!Array.isArray(item_ids) || item_ids.length === 0) {
        return new Response(JSON.stringify({ types: {} }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Find any active ML account to use for API calls
      let tokenToUse = '';
      if (account_id) {
        const accountRes = await supabaseFetch(`/ml_accounts?id=eq.${account_id}&limit=1`);
        const accts = await accountRes.json();
        if (Array.isArray(accts) && accts.length > 0) tokenToUse = accts[0].access_token;
      }
      if (!tokenToUse) {
        const accountRes = await supabaseFetch(`/ml_accounts?ativo=eq.true&limit=1`);
        const accts = await accountRes.json();
        if (Array.isArray(accts) && accts.length > 0) tokenToUse = accts[0].access_token;
      }
      if (!tokenToUse) throw new Error('No active ML account found');

      // Load existing cache from app_data
      const cacheRes = await supabaseFetch(`/app_data?data_key=eq.ml_listing_types_cache&limit=1`);
      const cacheRows = await cacheRes.json();
      const cachedTypes: Record<string, { catalog: boolean; listingType: string }> = 
        (cacheRows?.[0]?.data_value as any) || {};

      // Determine which IDs are missing from cache
      const missing = item_ids.filter(id => !(id in cachedTypes));

      // Batch fetch in groups of 20
      const BATCH = 20;
      for (let i = 0; i < missing.length; i += BATCH) {
        const batch = missing.slice(i, i + BATCH);
        try {
          const res = await fetch(
            `${ML_API}/items?ids=${batch.join(',')}&attributes=id,catalog_listing,listing_type_id`,
            { headers: { Authorization: `Bearer ${tokenToUse}` } }
          );
          if (res.ok) {
            const items = await res.json();
            for (const item of (Array.isArray(items) ? items : [])) {
              const b = item.body || item;
              if (b?.id) {
                cachedTypes[b.id] = {
                  catalog: b.catalog_listing === true,
                  listingType: b.catalog_listing === true ? 'Catálogo' : 'Tradicional',
                };
              }
            }
          }
        } catch (e) {
          console.error('[listing_types] batch error', e);
        }
      }

      // Save updated cache back to app_data
      await supabaseFetch('/app_data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          data_key: 'ml_listing_types_cache',
          data_value: cachedTypes,
          updated_at: new Date().toISOString(),
        }),
      });

      return new Response(JSON.stringify({ types: cachedTypes, updated: missing.length }), {
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
