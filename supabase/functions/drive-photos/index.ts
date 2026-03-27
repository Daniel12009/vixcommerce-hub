import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ROOT_FOLDER_ID = '1Y9vkMEzm4xJmYQ6VDLA5OtrFY3LG9mCP';
const DIMENSIONS_SHEET_ID = '1EKf-WMVTWSQZCsQRP6ZYzLenUU5FEWo-IIAa87nnItM';

async function getGoogleAccessToken(): Promise<string> {
  const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');
  if (!serviceAccountJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not set');
  const sa = JSON.parse(serviceAccountJson);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const now = Math.floor(Date.now() / 1000);
  const payload = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
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

async function getDimensions(token: string, sku: string): Promise<any | null> {
  const prodRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${DIMENSIONS_SHEET_ID}/values/PRODUTO!A:I`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const prodData = await prodRes.json();
  const prodRows: string[][] = prodData.values || [];
  const prodMatch = prodRows.slice(2).find(r => r[0]?.trim().toUpperCase() === sku.toUpperCase());

  const embRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${DIMENSIONS_SHEET_ID}/values/EMBALAGEM!A:F`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const embData = await embRes.json();
  const embRows: string[][] = embData.values || [];
  const embMatch = embRows.slice(1).find(r => r[0]?.trim().toUpperCase() === sku.toUpperCase());

  if (!prodMatch && !embMatch) return null;

  return {
    largura_produto: prodMatch?.[1] ? parseFloat(prodMatch[1]) : null,
    altura_produto: prodMatch?.[2] ? parseFloat(prodMatch[2]) : null,
    profundidade_produto: prodMatch?.[3] ? parseFloat(prodMatch[3]) : null,
    altura_queda_agua: prodMatch?.[4] ? parseFloat(prodMatch[4]) : null,
    peso_produto: prodMatch?.[5] ? parseFloat(prodMatch[5]) : null,
    largura_embalagem: embMatch?.[1] ? parseFloat(embMatch[1]) : null,
    altura_embalagem: embMatch?.[2] ? parseFloat(embMatch[2]) : null,
    profundidade_embalagem: embMatch?.[3] ? parseFloat(embMatch[3]) : null,
    peso_embalagem: embMatch?.[4] ? parseFloat(embMatch[4]) : null,
  };
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

async function listImages(token: string, folderId: string, sku: string): Promise<string[]> {
  const q = encodeURIComponent(
    `'${folderId}' in parents and (mimeType='image/jpeg' or mimeType='image/png' or mimeType='image/webp') and trashed=false`
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,modifiedTime)&orderBy=modifiedTime desc&pageSize=10`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  const files = data.files || [];

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
  const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const BUCKET = 'listing-photos';

  const results: string[] = [];

  for (const f of files.slice(0, 10)) {
    try {
      const ext = f.mimeType === 'image/png' ? 'png' : f.mimeType === 'image/webp' ? 'webp' : 'jpg';
      const filePath = `drive/${sku.toUpperCase()}/${f.id}.${ext}`;
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filePath}`;

      // Check if already uploaded to Supabase Storage
      const checkRes = await fetch(publicUrl, { method: 'HEAD' });
      if (checkRes.ok) {
        console.log(`Already in storage: ${publicUrl}`);
        results.push(publicUrl);
        continue;
      }

      // Download from Drive
      const imgRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!imgRes.ok) {
        console.log(`Drive download failed for ${f.id}: ${imgRes.status}`);
        continue;
      }

      const buf = await imgRes.arrayBuffer();
      const bytes = new Uint8Array(buf);
      console.log(`Downloaded ${f.name}: ${bytes.length} bytes`);

      // Upload to Supabase Storage
      const uploadRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filePath}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': f.mimeType || 'image/jpeg',
            'x-upsert': 'true',
          },
          body: bytes,
        }
      );

      if (uploadRes.ok) {
        console.log(`Uploaded to storage: ${publicUrl}`);
        results.push(publicUrl);
      } else {
        const errText = await uploadRes.text();
        console.error(`Storage upload failed for ${f.name}: ${uploadRes.status} ${errText}`);
        // Fallback: use Drive public export URL instead of base64
        results.push(`https://drive.google.com/thumbnail?id=${f.id}&sz=w800`);
      }
    } catch (err) {
      console.error(`Image processing error for ${f.id}:`, err);
      results.push(`https://drive.google.com/uc?export=view&id=${f.id}`);
    }
  }
  return results;
}

function scoreFolder(folderName: string, sku: string, accountName: string): number {
  const norm = folderName.toLowerCase().trim();
  const normSku = sku.toLowerCase().trim();
  if (!norm.includes(normSku)) return -1;
  let score = 0;
  if (norm === normSku) score += 10;
  else if (norm.startsWith(normSku)) score += 7;
  const accountWords = accountName.toLowerCase().split(/[\s_\-]+/).filter(w => w.length > 1);
  for (const w of accountWords) { if (norm.includes(w)) score += 5; }
  const vNum = norm.match(/\((\d+)\)\s*$/) || norm.match(/\s(\d+)\s*$/);
  if (vNum) score += parseInt(vNum[1]);
  return score;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { sku, account_name, fetch_dimensions } = await req.json();
    if (!sku) throw new Error('sku is required');

    const token = await getGoogleAccessToken();
    const result: any = { sku };

    // Fotos
    const folders = await listFolders(token, ROOT_FOLDER_ID);
    const scored = folders
      .map(f => ({ ...f, score: scoreFolder(f.name, sku, account_name || '') }))
      .filter(f => f.score >= 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      const best = scored[0];
      const urls = await listImages(token, best.id, sku);
      result.photos = { found: true, urls, folder_name: best.name, total: urls.length };
    } else {
      result.photos = { found: false, urls: [], folder_name: null, message: `Pasta não encontrada para SKU "${sku}"` };
    }

    // Dimensões (opcional)
    if (fetch_dimensions !== false) {
      const dims = await getDimensions(token, sku);
      result.dimensions = dims
        ? { found: true, ...dims }
        : { found: false, message: `SKU "${sku}" não encontrado na planilha de dimensões` };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('drive-photos error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
