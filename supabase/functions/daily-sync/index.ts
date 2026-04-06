import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLANILHA_MESTRA = '1lMq5aeInwwv7st8-Rf-S8NYQJaQKkSbSD7PjtFhtPms';

const SHEET_MAP: Record<string, string> = {
  shopee: 'Shopee_Vendas',
  shein: 'Shopee_Vendas',
  amazon: 'VENDASAZ',
  tiktok: 'VENDASTK',
  temu: 'VENDASTM',
};

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

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

async function restGet(path: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  return res.ok ? await res.json() : [];
}

async function getEnabledModules(): Promise<Record<string, boolean>> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/app_data?data_key=eq.daily_sync_modules&select=data_value`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (res.ok) {
      const rows = await res.json();
      if (rows.length > 0 && rows[0].data_value) {
        return rows[0].data_value;
      }
    }
  } catch (e) {
    console.error('Erro ao ler módulos ativos:', e);
  }
  return {};
}

function isEnabled(modules: Record<string, boolean>, key: string): boolean {
  return modules[key] === true;
}

const DELAY_BETWEEN_MODULES = 120_000; // 2 minutos

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const dIni = getYesterdayBR();
  const dIniBR = getYesterdayBR_DDMMYYYY();
  const log: string[] = [];

  // Ler módulos habilitados do app_data
  const modules = await getEnabledModules();
  const enabledKeys = Object.entries(modules).filter(([_, v]) => v).map(([k]) => k);

  log.push(`🚀 daily-sync iniciado. Data ref: ${dIni}`);
  log.push(`📋 Módulos ativos: ${enabledKeys.length > 0 ? enabledKeys.join(', ') : 'NENHUM (abortando)'}`);

  if (enabledKeys.length === 0) {
    log.push('⚠️ Nenhum módulo habilitado. Configure em Configurações → Sync Teste → Automação.');
    return new Response(JSON.stringify({ sucesso: true, log }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let stepCount = 0;

  // ━━━ ML ACCOUNTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const needsML = ['ml_vendas', 'ml_performance', 'ml_v7', 'ml_ads'].some(k => isEnabled(modules, k));

  if (needsML) {
    const mlAccounts = await restGet('ml_accounts?ativo=eq.true&select=id,nome,seller_id');
    log.push(`📋 ${mlAccounts.length} contas ML ativas`);

    for (const conta of mlAccounts) {
      const nome = conta.nome || conta.seller_id;

      // ML Vendas
      if (isEnabled(modules, 'ml_vendas')) {
        if (stepCount > 0) await sleep(DELAY_BETWEEN_MODULES);
        try {
          const r = await invokeFunction('mercado-livre', {
            action: 'sync_vendas', account_id: conta.id,
            date_from: dIni, date_to: dIni,
            spreadsheet_id: PLANILHA_MESTRA, sheet_name: 'VendasML',
          });
          log.push(`✅ Vendas ML ${nome}: ${r.mensagem || r.error || 'ok'}`);
        } catch (e: any) { log.push(`❌ Vendas ML ${nome}: ${e.message}`); }
        stepCount++;
      }

      // ML Performance
      if (isEnabled(modules, 'ml_performance')) {
        if (stepCount > 0) await sleep(DELAY_BETWEEN_MODULES);
        try {
          const r = await invokeFunction('mercado-livre', {
            action: 'get_performance_catalog', account_id: conta.id,
            date_from: dIni, date_to: dIni, spreadsheet_id: PLANILHA_MESTRA,
          });
          log.push(`✅ Performance ${nome}: ${r.mensagem || r.error || 'ok'}`);
        } catch (e: any) { log.push(`❌ Performance ${nome}: ${e.message}`); }
        stepCount++;
      }

      // ML V7
      if (isEnabled(modules, 'ml_v7')) {
        if (stepCount > 0) await sleep(DELAY_BETWEEN_MODULES);
        try {
          const r = await invokeFunction('mercado-livre', {
            action: 'get_vendas_full_7d', account_id: conta.id,
            spreadsheet_id: PLANILHA_MESTRA,
          });
          log.push(`✅ V7 ${nome}: ${r.mensagem || r.error || 'ok'}`);
        } catch (e: any) { log.push(`❌ V7 ${nome}: ${e.message}`); }
        stepCount++;
      }

      // ML ADS
      if (isEnabled(modules, 'ml_ads')) {
        if (stepCount > 0) await sleep(DELAY_BETWEEN_MODULES);
        try {
          const r = await invokeFunction('mercado-livre', {
            action: 'get_ads_full_report', account_id: conta.id,
            date_from: dIni, date_to: dIni, ad_type: 'product_ads',
            spreadsheet_id: PLANILHA_MESTRA, sheet_name: 'ADS', sheet_name_prefix: 'ADS-TOTAL-ML',
          });
          log.push(`✅ ADS ${nome}: ${r.mensagem || r.error || 'ok'}`);
        } catch (e: any) { log.push(`❌ ADS ${nome}: ${e.message}`); }
        stepCount++;
      }
    }
  }

  // ━━━ SHOPEE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (isEnabled(modules, 'shopee_vendas')) {
    const shopeeAccounts = await restGet('shopee_accounts?ativo=eq.true&select=id,nome,source_mode');
    log.push(`📋 ${shopeeAccounts.length} contas Shopee ativas`);

    for (const conta of shopeeAccounts) {
      if (stepCount > 0) await sleep(DELAY_BETWEEN_MODULES);
      const nome = conta.nome;
      const sourceMode = conta.source_mode || 'tiny';
      try {
        if (sourceMode === 'api') {
          const r = await invokeFunction('shopee', {
            action: 'sync_vendas', account_id: conta.id,
            date_from: dIni, date_to: dIni,
            spreadsheet_id: PLANILHA_MESTRA, sheet_name: 'Shopee_Vendas',
          });
          log.push(`✅ Shopee API ${nome}: ${r.mensagem || r.error || 'ok'}`);
        } else {
          const r = await invokeFunction('tiny', {
            action: 'sync_vendas_marketplace', date_from: dIniBR, date_to: dIniBR,
            plataforma: 'shopee', spreadsheet_id: PLANILHA_MESTRA, sheet_name: 'Shopee_Vendas',
          });
          log.push(`✅ Shopee Tiny ${nome}: ${r.mensagem || r.error || 'ok'}`);
        }
      } catch (e: any) { log.push(`❌ Shopee ${nome}: ${e.message}`); }
      stepCount++;
    }
  }

  // ━━━ OUTRAS PLATAFORMAS VIA TINY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const tinyPlatforms: { key: string; plat: string }[] = [
    { key: 'tiny_shein', plat: 'shein' },
    { key: 'tiny_amazon', plat: 'amazon' },
    { key: 'tiny_tiktok', plat: 'tiktok' },
    { key: 'tiny_temu', plat: 'temu' },
  ];

  for (const { key, plat } of tinyPlatforms) {
    if (!isEnabled(modules, key)) continue;
    if (stepCount > 0) await sleep(DELAY_BETWEEN_MODULES);
    try {
      const r = await invokeFunction('tiny', {
        action: 'sync_vendas_marketplace', date_from: dIniBR, date_to: dIniBR,
        plataforma: plat, spreadsheet_id: PLANILHA_MESTRA,
        sheet_name: SHEET_MAP[plat] || 'Shopee_Vendas',
      });
      log.push(`✅ ${plat.toUpperCase()} Tiny: ${r.mensagem || r.error || 'ok'}`);
    } catch (e: any) { log.push(`❌ ${plat}: ${e.message}`); }
    stepCount++;
  }

  // ━━━ ESTOQUE TINY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (isEnabled(modules, 'tiny_estoque')) {
    if (stepCount > 0) await sleep(DELAY_BETWEEN_MODULES);
    try {
      const r = await invokeFunction('tiny', { action: 'sync_estoque_tiny' });
      log.push(`✅ Estoque Tiny: ${r.mensagem || r.error || 'ok'}`);
    } catch (e: any) { log.push(`❌ Estoque Tiny: ${e.message}`); }
    stepCount++;
  }

  log.push(`✅ daily-sync concluído. ${stepCount} etapas processadas.`);
  console.log(log.join('\n'));

  return new Response(JSON.stringify({ sucesso: true, log }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
