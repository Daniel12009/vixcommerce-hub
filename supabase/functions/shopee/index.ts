import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SHOPEE_API = 'https://partner.shopeemobile.com';

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

// Generate HMAC-SHA256 signature for Shopee API
async function generateSign(partnerKey: string, baseString: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(partnerKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(baseString));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Build signed Shopee API URL
async function buildShopeeUrl(account: any, apiPath: string, extraParams: Record<string, string> = {}): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const partnerId = parseInt(account.partner_id);
  const shopId = parseInt(account.shop_id);
  const accessToken = account.access_token;

  const baseString = `${partnerId}${apiPath}${timestamp}${accessToken}${shopId}`;
  const sign = await generateSign(account.partner_key, baseString);

  const params = new URLSearchParams({
    partner_id: String(partnerId),
    timestamp: String(timestamp),
    sign,
    access_token: accessToken,
    shop_id: String(shopId),
    ...extraParams,
  });

  return `${SHOPEE_API}${apiPath}?${params.toString()}`;
}

// Refresh Shopee access token
async function refreshShopeeToken(account: any): Promise<string> {
  const apiPath = '/api/v2/auth/access_token/get';
  const timestamp = Math.floor(Date.now() / 1000);
  const partnerId = parseInt(account.partner_id);
  const shopId = parseInt(account.shop_id);

  const baseString = `${partnerId}${apiPath}${timestamp}`;
  const sign = await generateSign(account.partner_key, baseString);

  const params = new URLSearchParams({
    partner_id: String(partnerId),
    timestamp: String(timestamp),
    sign,
  });

  const res = await fetch(`${SHOPEE_API}${apiPath}?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: account.refresh_token,
      partner_id: partnerId,
      shop_id: shopId,
    }),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`Shopee token refresh failed: ${data.error} - ${data.message}`);
  }

  // Update tokens in database
  await supabaseFetch(`/shopee_accounts?id=eq.${account.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_expires_at: new Date(Date.now() + (data.expire_in * 1000)).toISOString(),
    }),
  });

  return data.access_token;
}

// Make Shopee API call with auto-refresh
async function shopeeFetch(account: any, apiPath: string, extraParams: Record<string, string> = {}): Promise<any> {
  // Check if token expired
  if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
    account.access_token = await refreshShopeeToken(account);
  }

  let url = await buildShopeeUrl(account, apiPath, extraParams);
  let res = await fetch(url);
  let data = await res.json();

  // If auth error, refresh and retry
  const errStr = (data.error || '').toLowerCase();
  if (data.error && (errStr.includes('token') || errStr.includes('auth') || errStr.includes('permission'))) {
    console.log(`Shopee auth error detected: ${data.error}, attempting refresh...`);
    account.access_token = await refreshShopeeToken(account);
    url = await buildShopeeUrl(account, apiPath, extraParams);
    res = await fetch(url);
    data = await res.json();
  }

  if (data.error) {
    throw new Error(`Shopee API error: ${data.error} - ${data.message || ''}`);
  }

  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action } = await req.json();

    if (action === 'get_today_orders') {
      const accountsRes = await supabaseFetch('/shopee_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();

      if (!accounts || accounts.length === 0) {
        return new Response(JSON.stringify({ orders: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Today in São Paulo (UTC-3)
      const now = new Date();
      const spOffset = -3 * 60;
      const localNow = new Date(now.getTime() + (spOffset + now.getTimezoneOffset()) * 60000);
      const todayStart = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate(), 0, 0, 0);
      const timeFrom = Math.floor((todayStart.getTime() - (spOffset + now.getTimezoneOffset()) * 60000) / 1000);
      const timeTo = Math.floor(now.getTime() / 1000);

      const allOrders: any[] = [];

      for (const account of accounts) {
        try {
          // Step 1: Get order list (with pagination)
          let cursor = '';
          let hasMore = true;

          while (hasMore) {
            const params: Record<string, string> = {
              time_range_field: 'create_time',
              time_from: String(timeFrom),
              time_to: String(timeTo),
              page_size: '50',
              response_optional_fields: 'order_status',
            };
            if (cursor) params.cursor = cursor;

            const listData = await shopeeFetch(account, '/api/v2/order/get_order_list', params);
            const orderSns = (listData.response?.order_list || []).map((o: any) => o.order_sn);

            if (orderSns.length === 0) {
              hasMore = false;
              break;
            }

            // Step 2: Get order details
            const detailData = await shopeeFetch(account, '/api/v2/order/get_order_detail', {
              order_sn_list: orderSns.join(','),
              response_optional_fields: 'buyer_user_id,buyer_username,item_list,order_status,total_amount',
            });

            const orders = (detailData.response?.order_list || []).map((o: any) => ({
              id: o.order_sn,
              status: mapShopeeStatus(o.order_status),
              date_created: new Date(o.create_time * 1000).toISOString(),
              total_amount: o.total_amount || 0,
              buyer: o.buyer_username || 'N/A',
              items: (o.item_list || []).map((item: any) => ({
                title: item.item_name || '',
                sku: item.model_sku || item.item_sku || '',
                quantity: item.model_quantity_purchased || 1,
                unit_price: item.model_discounted_price || item.model_original_price || 0,
              })),
              conta: `Shopee|${account.nome}`,
              plataforma: 'shopee',
              account_id: account.id,
            }));

            allOrders.push(...orders);
            
            hasMore = listData.response?.more || false;
            cursor = listData.response?.next_cursor || '';
          }
        } catch (err) {
          console.error(`Error fetching Shopee orders for ${account.nome}:`, err);
          allOrders.push({ error: `Shopee|${account.nome}: ${err instanceof Error ? err.message : 'Unknown error'}`, conta: `Shopee|${account.nome}` });
        }
      }

      return new Response(JSON.stringify({ orders: allOrders }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_pending_shipments') {
      const accountsRes = await supabaseFetch('/shopee_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();

      if (!accounts || accounts.length === 0) {
        return new Response(JSON.stringify({ shipments: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Last 15 days
      const now = new Date();
      const past = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
      const timeFrom = Math.floor(past.getTime() / 1000);
      const timeTo = Math.floor(now.getTime() / 1000);

      const allShipments: any[] = [];

      for (const account of accounts) {
        try {
          let cursor = '';
          let hasMore = true;

          while (hasMore) {
            const params: Record<string, string> = {
              time_range_field: 'create_time',
              time_from: String(timeFrom),
              time_to: String(timeTo),
              page_size: '50',
              status: 'READY_TO_SHIP', // Only fetch pending orders
            };
            if (cursor) params.cursor = cursor;

            const listData = await shopeeFetch(account, '/api/v2/order/get_order_list', params);
            const orderSns = (listData.response?.order_list || []).map((o: any) => o.order_sn);

            if (orderSns.length === 0) {
              hasMore = false;
              break;
            }

            // Get order details including shipping_carrier
            const detailData = await shopeeFetch(account, '/api/v2/order/get_order_detail', {
              order_sn_list: orderSns.join(','),
              response_optional_fields: 'buyer_user_id,buyer_username,item_list,order_status,total_amount,shipping_carrier',
            });

            const orders = (detailData.response?.order_list || [])
              .filter((o: any) => {
                const s = o.order_status;
                // Only include pending shipments
                return s === 'READY_TO_SHIP' || s === 'PROCESSED' || s === 'RETRY_SHIP';
              })
              .map((o: any) => ({
              orderId: o.order_sn,
              status: mapShopeeStatus(o.order_status),
              shippingStatus: o.order_status,
              logisticType: o.shipping_carrier || 'Standard',
              dateCreated: new Date(o.create_time * 1000).toISOString(),
              totalAmount: o.total_amount || 0,
              buyer: o.buyer_username || 'N/A',
              items: (o.item_list || []).map((item: any) => ({
                title: item.item_name || '',
                sku: item.model_sku || item.item_sku || '',
                quantity: item.model_quantity_purchased || 1,
                unitPrice: item.model_discounted_price || item.model_original_price || 0,
              })),
              conta: account.nome,
              accountId: account.id,
              plataforma: 'shopee'
            }));

            allShipments.push(...orders);
            
            hasMore = listData.response?.more || false;
            cursor = listData.response?.next_cursor || '';
          }
        } catch (err) {
          console.error(`Error fetching Shopee pending shipments for ${account.nome}:`, err);
          allShipments.push({ error: `${account.nome}: ${err instanceof Error ? err.message : 'Unknown error'}`, conta: account.nome });
        }
      }

      return new Response(JSON.stringify({ shipments: allShipments }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error: unknown) {
    console.error('Shopee API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function mapShopeeStatus(status: string): string {
  switch (status) {
    case 'READY_TO_SHIP':
    case 'PROCESSED':
    case 'SHIPPED':
    case 'COMPLETED':
    case 'INVOICE_PENDING':
      return 'paid';
    case 'IN_CANCEL':
    case 'CANCELLED':
      return 'cancelled';
    default:
      return status?.toLowerCase() || 'unknown';
  }
}
