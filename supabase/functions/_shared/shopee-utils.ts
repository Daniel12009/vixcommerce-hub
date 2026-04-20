const SHOPEE_API = 'https://partner.shopeemobile.com';

async function getSupabaseClient() {
  const url = (Deno.env.get('EXTERNAL_DB_URL') || Deno.env.get('SUPABASE_URL'))!;
  const key = (Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
  return { url, key };
}

export async function supabaseFetch(path: string, options: any = {}) {
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

export async function generateSign(partnerKey: string, baseString: string): Promise<string> {
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

export async function buildShopeeUrl(account: any, apiPath: string, extraParams: Record<string, string> = {}): Promise<string> {
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

export async function refreshShopeeToken(account: any): Promise<string> {
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

export async function shopeeFetch(account: any, apiPath: string, extraParams: Record<string, string> = {}, options: RequestInit = {}): Promise<any> {
  // Check if token expired
  if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
    account.access_token = await refreshShopeeToken(account);
  }

  let url = await buildShopeeUrl(account, apiPath, extraParams);
  let res = await fetch(url, options);
  let data = await res.json();

  // If auth error, refresh and retry
  const errStr = (data.error || '').toLowerCase();
  if (data.error && (errStr.includes('token') || errStr.includes('auth') || errStr.includes('permission'))) {
    console.log(`Shopee auth error detected: ${data.error}, attempting refresh...`);
    account.access_token = await refreshShopeeToken(account);
    url = await buildShopeeUrl(account, apiPath, extraParams);
    res = await fetch(url, options);
    data = await res.json();
  }

  if (data.error) {
    throw new Error(`Shopee API error: ${data.error} - ${data.message || ''}`);
  }

  return data;
}
