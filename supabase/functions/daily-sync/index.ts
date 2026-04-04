import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLANILHA_MESTRA = '1lMq5aeInwwv7st8-Rf-S8NYQJaQKkSbSD7PjtFhtPms';

// Mapa de aba por plataforma
const SHEET_MAP: Record<string, string> = {
  shopee: 'Shopee_Vendas',
  shein: 'Shopee_Vendas',
  amazon: 'VENDASAZ',
  tiktok: 'VENDASTK',
  temu: 'VENDASTM',
};

async function invokeFunction(name: string, body: object): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    try { return await res.json(); } catch { return { ok: true }; }
  }
  const errText = await res.text();
  return { error: errText.slice(0, 200) };
}

async function getMLAccounts(): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ml_accounts?ativo=eq.true&select=id,nome,seller_id`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  return res.ok ? await res.json() : [];
}

async function getShopeeAccounts(): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/shopee_accounts?ativo=eq.true&select=id,nome,source_mode`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  return res.ok ? await res.json() : [];
}

async function getTinyAccounts(): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/tiny_accounts?ativo=eq.true&select=id,nome`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  return res.ok ? await res.json() : [];
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// Calcular dia anterior no fuso America/Sao_Paulo
function getYesterdayBR(): string {
  const now = new Date();
  const spOffset = -3 * 60;
  const localNow = new Date(now.getTime() + (spOffset + now.getTimezoneOffset()) * 60000);
  localNow.setDate(localNow.getDate() - 1);
  const y = localNow.getFullYear();
  const m = String(localNow.getMonth() + 1).padStart(2, '0');
  const d = String(localNow.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getYesterdayBR_DDMMYYYY(): string {
  const iso = getYesterdayBR();
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const dIni = getYesterdayBR();
  const dIniBR = getYesterdayBR_DDMMYYYY();
  const log: string[] = [];

  log.push(`🚀 Ciclo daily-sync iniciado. Data ref: ${dIni}`);

  // ━━━ ML ACCOUNTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const mlAccounts = await getMLAccounts();
  log.push(`📋 ${mlAccounts.length} contas ML ativas`);

  for (const conta of mlAccounts) {
    const nome = conta.nome || conta.seller_id;

    try {
      // 1. Vendas ML dia anterior → VendasML
      const r1 = await invokeFunction('mercado-livre', {
        action: 'sync_vendas',
        account_id: conta.id,
        date_from: dIni,
        date_to: dIni,
        spreadsheet_id: PLANILHA_MESTRA,
        sheet_name: 'VendasML',
      });
      log.push(`✅ Vendas ML ${nome}: ${r1.mensagem || r1.error || 'ok'}`);

      await sleep(3000);

      // 2. Performance catálogo → PERF-{CONTA}
      const r2 = await invokeFunction('mercado-livre', {
        action: 'get_performance_catalog',
        account_id: conta.id,
        date_from: dIni,
        date_to: dIni,
        spreadsheet_id: PLANILHA_MESTRA,
      });
      log.push(`✅ Performance ${nome}: ${r2.mensagem || r2.error || 'ok'}`);

      await sleep(3000);

      // 3. Vendas Full 7 dias → V7-{CONTA}
      const r3 = await invokeFunction('mercado-livre', {
        action: 'get_vendas_full_7d',
        account_id: conta.id,
        spreadsheet_id: PLANILHA_MESTRA,
      });
      log.push(`✅ V7 ${nome}: ${r3.mensagem || r3.error || 'ok'}`);

      await sleep(3000);

      // 4. ADS product_ads dia anterior → ADS + ADS-TOTAL-ML
      const r4 = await invokeFunction('mercado-livre', {
        action: 'get_ads_full_report',
        account_id: conta.id,
        date_from: dIni,
        date_to: dIni,
        ad_type: 'product_ads',
        spreadsheet_id: PLANILHA_MESTRA,
        sheet_name: 'ADS',
        sheet_name_prefix: 'ADS-TOTAL-ML',
      });
      log.push(`✅ ADS ${nome}: ${r4.mensagem || r4.error || 'ok'}`);

      // brand_ads e display_ads: desativados do automático (não funcionais)

    } catch (e: any) {
      log.push(`❌ Erro ML ${nome}: ${e.message}`);
    }

    await sleep(2000);
  }

  // ━━━ SHOPEE ACCOUNTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const shopeeAccounts = await getShopeeAccounts();
  log.push(`📋 ${shopeeAccounts.length} contas Shopee ativas`);

  for (const conta of shopeeAccounts) {
    const nome = conta.nome;
    const sourceMode = conta.source_mode || 'tiny';

    try {
      if (sourceMode === 'api') {
        // API direta Shopee
        const r = await invokeFunction('shopee', {
          action: 'sync_vendas',
          account_id: conta.id,
          date_from: dIni,
          date_to: dIni,
          spreadsheet_id: PLANILHA_MESTRA,
          sheet_name: 'Shopee_Vendas',
        });
        log.push(`✅ Shopee API ${nome}: ${r.mensagem || r.error || 'ok'}`);
      } else {
        // Via Tiny ERP
        const r = await invokeFunction('tiny', {
          action: 'sync_vendas_marketplace',
          date_from: dIniBR,
          date_to: dIniBR,
          plataforma: 'shopee',
          spreadsheet_id: PLANILHA_MESTRA,
          sheet_name: 'Shopee_Vendas',
        });
        log.push(`✅ Shopee Tiny ${nome}: ${r.mensagem || r.error || 'ok'}`);
      }
    } catch (e: any) {
      log.push(`❌ Erro Shopee ${nome}: ${e.message}`);
    }

    await sleep(2000);
  }

  // ━━━ OUTRAS PLATAFORMAS VIA TINY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const tinyAccounts = await getTinyAccounts();
  const outrasPlataformas = ['shein', 'amazon', 'tiktok', 'temu'];

  for (const plat of outrasPlataformas) {
    try {
      const r = await invokeFunction('tiny', {
        action: 'sync_vendas_marketplace',
        date_from: dIniBR,
        date_to: dIniBR,
        plataforma: plat,
        spreadsheet_id: PLANILHA_MESTRA,
        sheet_name: SHEET_MAP[plat] || 'Shopee_Vendas',
      });
      log.push(`✅ ${plat.toUpperCase()} Tiny: ${r.mensagem || r.error || 'ok'}`);
    } catch (e: any) {
      log.push(`❌ Erro ${plat}: ${e.message}`);
    }

    await sleep(2000);
  }

  log.push(`✅ Ciclo daily-sync concluído. ${log.length} etapas processadas.`);
  console.log(log.join('\n'));

  return new Response(JSON.stringify({ sucesso: true, log }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
