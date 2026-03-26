import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ROOT_FOLDER_ID = '1Y9vkMEzm4xJmYQ6VDLA5OtrFY3LG9mCP';

async function getGoogleAccessToken(): Promise<string> {
  const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');
  if (!serviceAccountJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not set');
  const sa = JSON.parse(serviceAccountJson);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g, '');
  const now = Math.floor(Date.now() / 1000);
  const payload = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).replace(/=/g, '');
  const pemKey = sa.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '');
  const binaryKey = Uint8Array.from(atob(pemKey), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const jwt = `${signingInput}.${sig}`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error(`Token error: ${JSON.stringify(tokenData)}`);
  return tokenData.access_token;
}

async function listFolders(token: string, parentId: string): Promise<{ id: string; name: string }[]> {
  const q = encodeURIComponent(`'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=500`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  return data.files || [];
}

async function listImages(token: string, folderId: string): Promise<{ url: string; name: string }[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and (mimeType='image/jpeg' or mimeType='image/png' or mimeType='image/webp') and trashed=false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=20`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  return (data.files || []).map((f: any) => ({
    url: `https://drive.google.com/uc?export=view&id=${f.id}`,
    name: f.name,
  }));
}

function scoreFolder(folderName: string, sku: string, accountName: string): number {
  const norm = folderName.toLowerCase().trim();
  const normSku = sku.toLowerCase().trim();
  if (!norm.includes(normSku)) return -1;
  let score = 0;
  if (norm === normSku) score += 10;
  else if (norm.startsWith(normSku)) score += 7;
  // Account keywords match
  const accountWords = accountName.toLowerCase().split(/[\s_\-]+/).filter(w => w.length > 1);
  for (const w of accountWords) {
    if (norm.includes(w)) score += 5;
  }
  // Version suffix: higher number = more recent = better score
  const vNum = norm.match(/\((\d+)\)\s*$/) || norm.match(/\s(\d+)\s*$/);
  if (vNum) score += parseInt(vNum[1]);
  return score;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { sku, account_name } = await req.json();
    if (!sku) throw new Error('sku is required');
    const token = await getGoogleAccessToken();
    const folders = await listFolders(token, ROOT_FOLDER_ID);
    const scored = folders
      .map(f => ({ ...f, score: scoreFolder(f.name, sku, account_name || '') }))
      .filter(f => f.score >= 0)
      .sort((a, b) => b.score - a.score);
    if (scored.length === 0) {
      return new Response(JSON.stringify({
        found: false, urls: [], folder_name: null,
        message: `Nenhuma pasta encontrada para o SKU "${sku}"`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const best = scored[0];
    const images = await listImages(token, best.id);
    return new Response(JSON.stringify({
      found: true,
      urls: images.map(i => i.url),
      folder_name: best.name,
      total_images: images.length,
      message: `${images.length} foto(s) encontrada(s) na pasta "${best.name}"`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('drive-photos error:', message);
    return new Response(JSON.stringify({ error: message, found: false, urls: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
