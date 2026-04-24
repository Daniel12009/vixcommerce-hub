import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// Build JWT from service account key
async function getAccessToken(serviceAccountKey: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccountKey.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encode = (obj: any) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsignedToken = `${encode(header)}.${encode(payload)}`;

  // Import RSA private key
  const pemContent = serviceAccountKey.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  
  const binaryKey = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${unsignedToken}.${signatureB64}`;

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const keyJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');
    if (!keyJson) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');
    }

    const serviceAccountKey = JSON.parse(keyJson);
    const accessToken = await getAccessToken(serviceAccountKey);

    const { action, spreadsheetId, range, values, sheetTitle, dateColumn, contaColumn } = await req.json();

    const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    let result;

    if (action === 'read') {
      const res = await fetch(`${baseUrl}/values/${encodeURIComponent(range)}`, { headers });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Sheets API read failed [${res.status}]: ${err}`);
      }
      result = await res.json();
    } else if (action === 'write') {
      const res = await fetch(
        `${baseUrl}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({ values }),
        }
      );
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Sheets API write failed [${res.status}]: ${err}`);
      }
      result = await res.json();
    } else if (action === 'info') {
      const res = await fetch(baseUrl, { headers });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Sheets API info failed [${res.status}]: ${err}`);
      }
      result = await res.json();
    } else if (action === 'append') {
      const res = await fetch(
        `${baseUrl}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED\u0026insertDataOption=INSERT_ROWS`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ values }),
        }
      );
      if (!res.ok) { const err = await res.text(); throw new Error(`Sheets API append failed [${res.status}]: ${err}`); }
      result = await res.json();
    } else if (action === 'dedup_write') {
      // values: new rows to write
      // dateColumn: zero-based index of the column that holds the date string
      // contaColumn: optional zero-based index of the conta column — when set, dedup by date+conta together
      //              so multiple accounts can coexist for the same date without wiping each other
      const newRows = values || [];
      // Read TWICE: FORMATTED_VALUE for dedup matching by date string,
      // and UNFORMATTED_VALUE to recover full numeric precision for big IDs (avoids 2,00E+15)
      const [readResFmt, readResRaw] = await Promise.all([
        fetch(`${baseUrl}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`, { headers }),
        fetch(`${baseUrl}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`, { headers }),
      ]);
      let existingRows: any[][] = [];
      let rawRows: any[][] = [];
      if (readResFmt.ok) {
        const readData = await readResFmt.json();
        existingRows = readData.values || [];
      }
      if (readResRaw.ok) {
        const readData = await readResRaw.json();
        rawRows = readData.values || [];
      }
      // Assume header is first row if present
      const header = existingRows[0] ?? [];
      const dataRows = existingRows.slice(1);
      // Determine date to replace (use date of first new row)
      const targetDate = String(newRows[0]?.[dateColumn] ?? '');
      const targetConta = contaColumn !== undefined ? String(newRows[0]?.[contaColumn] ?? '') : undefined;

      let filtered: any[][];
      if (targetConta !== undefined) {
        // Dedup by date + conta: only remove rows that match BOTH date and conta
        filtered = dataRows.filter(row =>
          !(String(row[dateColumn] ?? '') === targetDate && String(row[contaColumn!] ?? '') === targetConta)
        );
      } else {
        // Dedup by date only (legacy behaviour)
        filtered = dataRows.filter(row => String(row[dateColumn] ?? '') !== targetDate);
      }

      // Colunas que devem ser sempre tratadas como texto puro:
      // Índice 2 = coluna C = Data Criação  ('DD/MM/YYYY)
      // Índice 3 = coluna D = Data Fechamento ('DD/MM/YYYY)
      // Índice 4 = coluna E = ID Pedido ('2000007890123456) — número grande → notação científica sem o apóstrofo
      const TEXT_FORCE_COLUMNS = new Set([2, 3, 4]);
      // Para IDs grandes (col 4), usamos o valor UNFORMATTED (numérico exato) para evitar 2,00E+15.
      const BIGINT_COLUMNS = new Set([4]);
      const numToPlainString = (n: any): string => {
        if (typeof n === 'number' && Number.isFinite(n)) {
          if (Number.isInteger(n)) return n.toFixed(0);
          return String(n);
        }
        return String(n ?? '');
      };
      const reprotectRow = (row: any[], rowIdx: number): any[] =>
        row.map((cell, colIdx) => {
          if (!TEXT_FORCE_COLUMNS.has(colIdx)) return cell;
          let s: string;
          if (BIGINT_COLUMNS.has(colIdx)) {
            const rawCell = rawRows[rowIdx + 1]?.[colIdx];
            const usable = (rawCell !== undefined && rawCell !== null && rawCell !== '') ? rawCell : cell;
            s = numToPlainString(usable).trim();
          } else {
            s = String(cell ?? '').trim();
          }
          if (!s) return cell;
          return s.startsWith("'") ? s : `'${s}`;
        });

      const reprotectedFiltered = filtered.map((row) => {
        const originalIdx = dataRows.indexOf(row);
        return reprotectRow(row, originalIdx);
      });
      const combined = [header, ...reprotectedFiltered, ...newRows];
      // Write back with USER_ENTERED so text/number types are preserved correctly
      const writeRes = await fetch(`${baseUrl}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ values: combined }),
      });
      if (!writeRes.ok) { const err = await writeRes.text(); throw new Error(`Sheets API dedup_write failed [${writeRes.status}]: ${err}`); }
      result = await writeRes.json();
    } else if (action === 'update_cell') {
      // Update a specific cell (for checkboxes)
      const res = await fetch(
        `${baseUrl}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({ values }),
        }
      );
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Sheets API update_cell failed [${res.status}]: ${err}`);
      }
      result = await res.json();
    } else if (action === 'clear') {
      // Clear a specific range (or entire sheet if range is just tab name)
      const res = await fetch(
        `${baseUrl}/values/${encodeURIComponent(range)}:clear`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        }
      );
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Sheets API clear failed [${res.status}]: ${err}`);
      }
      result = await res.json();
    } else if (action === 'clear_old_dates') {
      // values[0][0] = targetDate, values[0][1] = dateColumn index
      const targetDate = String(values[0]?.[0] ?? '');
      const dCol = Number(values[0]?.[1] ?? 0);
      
      const readRes = await fetch(`${baseUrl}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`, { headers });
      let existingRows: any[][] = [];
      if (readRes.ok) existingRows = (await readRes.json()).values || [];
      
      const header = existingRows[0] ?? [];
      const dataRows = existingRows.slice(1);
      
      // keep only rows where the date column matches targetDate exactly
      const filtered = dataRows.filter(row => String(row[dCol] ?? '') === targetDate);
      const combined = [header, ...filtered];
      
      // Before writing, we MUST clear the entire sheet or the old data trailing at the bottom won't be erased!
      const clearRes = await fetch(`${baseUrl}/values/${encodeURIComponent(range)}:clear`, {
        method: 'POST', headers, body: JSON.stringify({}),
      });
      if (!clearRes.ok) throw new Error(`Sheets API clear inside clear_old_dates failed [${clearRes.status}]: ${await clearRes.text()}`);

      const writeRes = await fetch(`${baseUrl}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
        method: 'PUT', headers, body: JSON.stringify({ values: combined }),
      });
      if (!writeRes.ok) throw new Error(`Sheets API clear_old_dates write failed [${writeRes.status}]: ${await writeRes.text()}`);
      result = await writeRes.json();
    } else if (action === 'create_sheet') {
      // Create a new sheet tab if it doesn't exist
      const title = sheetTitle || 'VIX_BACKUP';
      // First check if sheet already exists
      const infoRes = await fetch(baseUrl, { headers });
      const infoData = await infoRes.json();
      const exists = infoData.sheets?.some((s: any) => s.properties?.title === title);
      if (exists) {
        result = { status: 'already_exists', title };
      } else {
        const res = await fetch(`${baseUrl}:batchUpdate`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            requests: [{ addSheet: { properties: { title } } }],
          }),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Sheets API create_sheet failed [${res.status}]: ${err}`);
        }
        result = await res.json();
      }
    } else {
      throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Google Sheets error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
