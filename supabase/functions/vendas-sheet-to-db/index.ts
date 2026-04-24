import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TG_BOT = Deno.env.get('TELEGRAM_BOT_TOKEN');
const TG_CHAT = Deno.env.get('TELEGRAM_CHAT_ID');

async function tg(msg: string) {
  if (!TG_BOT || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_BOT}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: 'HTML' }),
    });
  } catch { /* ignore */ }
}

async function pgFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

async function readSheet(spreadsheetId: string, abaNome: string): Promise<any[][]> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/google-sheets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      action: 'read',
      spreadsheetId,
      range: `${abaNome}!A1:ZZ100000`,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`google-sheets read failed [${res.status}]: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.values || [];
}

function num(v: any): number {
  if (v === null || v === undefined || v === '') return 0;
  const s = String(v).trim().replace(/[R$\s]/g, '');
  // BR format "1.234,56" -> 1234.56
  const norm = s.includes(',') && s.includes('.')
    ? s.replace(/\./g, '').replace(',', '.')
    : s.replace(',', '.');
  const n = parseFloat(norm);
  return isNaN(n) ? 0 : n;
}

function str(v: any): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const startedAt = new Date().toISOString();
  let body: any = {};
  try { body = await req.json().catch(() => ({})); } catch { /* */ }
  const truncate = body.truncate === true;

  // log start
  let runId: string | null = null;
  try {
    const r = await pgFetch('/sync_run_log', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ module: 'vendas_sheet_to_db', status: 'running', started_at: startedAt }),
    });
    if (r.ok) {
      const j = await r.json();
      runId = j[0]?.id || null;
    }
  } catch { /* */ }

  try {
    // 1. carrega config
    const cfgRes = await pgFetch(`/sheet_configs?modulo_destino=eq.vendas&select=*&limit=1`);
    if (!cfgRes.ok) throw new Error(`sheet_configs fetch failed [${cfgRes.status}]`);
    const cfgs = await cfgRes.json();
    if (!cfgs.length) throw new Error('Nenhum sheet_config com modulo_destino=vendas encontrado');
    const cfg = cfgs[0];
    const map = cfg.mapeamento as Record<string, string>;
    const spreadsheetId = cfg.spreadsheet_id;
    const abaNome = cfg.aba_nome;

    // 2. lê planilha
    const rows = await readSheet(spreadsheetId, abaNome);
    if (rows.length < 2) throw new Error('Planilha vazia');
    const header = (rows[0] || []).map((h: any) => str(h));
    const headerIdx: Record<string, number> = {};
    header.forEach((h, i) => { headerIdx[h] = i; });

    // 3. monta os registros
    const records: any[] = [];
    const dataRows = rows.slice(1);
    for (const row of dataRows) {
      const get = (campoBanco: string) => {
        const headerName = map[campoBanco];
        if (!headerName) return '';
        const idx = headerIdx[headerName];
        if (idx === undefined || idx < 0) return '';
        return row[idx];
      };

      const numero_pedido = str(get('numeroPedido'));
      const sku = str(get('sku')) || str(get('skuProduto'));
      // ignora linhas sem chave
      if (!numero_pedido && !sku) continue;

      records.push({
        numero_pedido,
        sku,
        sku_produto: str(get('skuProduto')),
        produto: str(get('produto')) || str(get('skuProduto')),
        data: str(get('data')),
        conta: str(get('conta')),
        conta_mae: str(get('contaMae')),
        comprador: str(get('comprador')),
        quantidade: num(get('quantidade')) || 1,
        valor_total: num(get('valorTotal')),
        preco_unitario: num(get('precoUnitario')),
        liquido: num(get('liquido')),
        cmv: num(get('cmv')),
        comissao: num(get('comissao')),
        custo_envio: num(get('custoEnvio')),
        impostos: num(get('impostos')),
        frete: num(get('frete')) || 0,
        margem: str(get('margem')),
        devolucao: num(get('devolucao')),
        origem: str(get('origem')),
        pedido_origem: str(get('pedidoOrigem')),
        status_pedido: str(get('statusPedido')),
      });
    }

    // 3.5 deduplica por (numero_pedido, sku) somando quantidades/valores quando aparecer 2x
    const dedupMap = new Map<string, any>();
    for (const r of records) {
      const key = `${r.numero_pedido}|${r.sku}`;
      const prev = dedupMap.get(key);
      if (!prev) {
        dedupMap.set(key, r);
      } else {
        prev.quantidade = (prev.quantidade || 0) + (r.quantidade || 0);
        prev.valor_total = (prev.valor_total || 0) + (r.valor_total || 0);
        prev.liquido = (prev.liquido || 0) + (r.liquido || 0);
        prev.cmv = (prev.cmv || 0) + (r.cmv || 0);
        prev.comissao = (prev.comissao || 0) + (r.comissao || 0);
        prev.custo_envio = (prev.custo_envio || 0) + (r.custo_envio || 0);
        prev.impostos = (prev.impostos || 0) + (r.impostos || 0);
      }
    }
    const dedupRecords = Array.from(dedupMap.values());

    // 4. truncate opcional
    if (truncate) {
      const delRes = await pgFetch(`/vendas_items?id=neq.00000000-0000-0000-0000-000000000000`, { method: 'DELETE' });
      if (!delRes.ok) {
        const t = await delRes.text();
        console.warn(`[vendas-sheet-to-db] truncate aviso: ${delRes.status} ${t.slice(0, 200)}`);
      }
    }

    // 5. upsert em batches
    const BATCH = 500;
    let inserted = 0;
    let errors = 0;
    let lastErr = '';
    for (let i = 0; i < records.length; i += BATCH) {
      const chunk = records.slice(i, i + BATCH);
      const insRes = await pgFetch('/vendas_items?on_conflict=numero_pedido,sku', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(chunk),
      });
      if (!insRes.ok) {
        errors += chunk.length;
        lastErr = (await insRes.text()).slice(0, 300);
        console.error(`[vendas-sheet-to-db] upsert erro [${insRes.status}]: ${lastErr}`);
      } else {
        inserted += chunk.length;
      }
      // pequena pausa pra evitar throttle
      await new Promise(r => setTimeout(r, 50));
    }

    const msg = `✅ Vendas-Sheet→DB: ${inserted}/${records.length} linhas processadas${truncate ? ' (após truncate)' : ''}${errors ? ` | ⚠️ ${errors} falharam: ${lastErr}` : ''}`;
    console.log(msg);
    await tg(msg);

    if (runId) {
      await pgFetch(`/sync_run_log?id=eq.${runId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: errors ? 'partial' : 'success', finished_at: new Date().toISOString(), message: msg }),
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      total_planilha: records.length,
      inserted,
      errors,
      truncate,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    const msg = `❌ Vendas-Sheet→DB erro: ${e.message}`;
    console.error(msg);
    await tg(msg);
    if (runId) {
      await pgFetch(`/sync_run_log?id=eq.${runId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'error', finished_at: new Date().toISOString(), message: msg.slice(0, 500) }),
      });
    }
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
