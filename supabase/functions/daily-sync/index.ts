// sync_ads_db e sync_cmv_db habilitados - build 2026-04-15T11:20:13-03:00
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = (Deno.env.get('EXTERNAL_DB_URL') || Deno.env.get('SUPABASE_URL')) || '';
const SERVICE_KEY = (Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const PLANILHA_MESTRA = '1lMq5aeInwwv7st8-Rf-S8NYQJaQKkSbSD7PjtFhtPms';

const SHEET_MAP: Record<string, string> = {
  shopee: 'Shopee_Vendas',
  shein: 'Shopee_Vendas',
  amazon: 'VENDASAZ',
  tiktok: 'VENDASTK',
  temu: 'VENDASTM',
};

const MODULE_LABELS: Record<string, string> = {
  ml_vendas: 'ðŸ“¦ Vendas ML',
  ml_performance: 'ðŸ“Š Performance ML',
  ml_v7: 'ðŸ“ˆ V7 ML',
  ml_ads: 'ðŸ“¢ ADS ML',
  shopee_vendas: 'ðŸ›’ Vendas Shopee',
  tiny_shein: 'ðŸ‘— Shein (Tiny)',
  tiny_amazon: 'ðŸ“¦ Amazon (Tiny)',
  tiny_tiktok: 'ðŸŽµ TikTok (Tiny)',
  tiny_temu: 'ðŸ› ï¸  Temu (Tiny)',
  tiny_estoque: '📦 Estoque Tiny',
  ml_auto_robot: '🤖 Robô de Atendimento ML',
  ml_cmv: '📦 Sync CMV → Banco',
  sync_ads_db: 'ðŸ“¢ Sync ADS â†’ DB',
  sync_cmv_db: 'ðŸ“¦ Sync CMV â†’ DB',
  verify: 'ðŸ”  VerificaÃ§Ã£o Final',
};

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

function getTodayBR(): string {
  const now = new Date();
  const spOffset = -3 * 60;
  const localNow = new Date(now.getTime() + (spOffset + now.getTimezoneOffset()) * 60000);
  const y = localNow.getFullYear();
  const m = String(localNow.getMonth() + 1).padStart(2, '0');
  const d = String(localNow.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function colToIndex(col: string): number {
  if (!col) return 0;
  return col.trim().toUpperCase().charCodeAt(0) - 65;
}

async function restGet(path: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  return res.ok ? await res.json() : [];
}

async function restPost(path: string, body: any): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(body),
  });
  return res.ok ? await res.json() : null;
}

async function restPatch(path: string, body: any): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(body),
  });
  return res.ok ? await res.json() : null;
}

async function sendTelegram(text: string) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  } catch (e) {
    console.error('Telegram error:', e);
  }
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
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }
  return await res.json();
}

async function getEnabledModules(): Promise<Record<string, boolean>> {
  try {
    const rows = await restGet('app_data?data_key=eq.daily_sync_modules&select=data_value');
    if (rows.length > 0 && rows[0].data_value) return rows[0].data_value;
  } catch (e) {
    console.error('Erro ao ler mÃ³dulos:', e);
  }
  return {};
}

// â”â”â” MODULE HANDLERS â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”

async function runMLModule(moduleKey: string, action: string, extraParams: Record<string, any>, dIni: string): Promise<string[]> {
  const log: string[] = [];
  const mlAccounts = await restGet('ml_accounts?ativo=eq.true&select=id,nome,seller_id');
  log.push(`ðŸ“‹ ${mlAccounts.length} contas ML ativas`);

  for (const conta of mlAccounts) {
    const nome = conta.nome || conta.seller_id;
    try {
      const params: any = { action, account_id: conta.id, ...extraParams };
      if (action === 'sync_vendas') {
        params.date_from = dIni;
        params.date_to = dIni;
        params.spreadsheet_id = PLANILHA_MESTRA;
        params.sheet_name = 'VendasML';
      } else if (action === 'get_performance_catalog') {
        params.date_from = dIni;
        params.date_to = dIni;
        params.spreadsheet_id = PLANILHA_MESTRA;
      } else if (action === 'get_vendas_full_7d') {
        params.spreadsheet_id = PLANILHA_MESTRA;
      } else if (action === 'get_ads_full_report') {
        params.date_from = dIni;
        params.date_to = dIni;
        params.ad_type = 'product_ads';
        params.spreadsheet_id = PLANILHA_MESTRA;
        params.sheet_name = 'ADS';
        params.sheet_name_prefix = 'ADS-TOTAL-ML';
      }
      const r = await invokeFunction('mercado-livre', params);
      log.push(`âœ… ${MODULE_LABELS[moduleKey] || moduleKey} ${nome}: ${r.mensagem || r.error || 'ok'}`);
    } catch (e: any) {
      log.push(`âŒ ${MODULE_LABELS[moduleKey] || moduleKey} ${nome}: ${e.message}`);
    }
  }
  return log;
}

async function runShopeeVendas(dIni: string, dIniBR: string): Promise<string[]> {
  const log: string[] = [];
  const shopeeAccounts = await restGet('shopee_accounts?ativo=eq.true&select=id,nome,source_mode');
  log.push(`ðŸ“‹ ${shopeeAccounts.length} contas Shopee ativas`);

  for (const conta of shopeeAccounts) {
    const nome = conta.nome;
    const sourceMode = conta.source_mode || 'tiny';
    try {
      if (sourceMode === 'api') {
        const r = await invokeFunction('shopee', {
          action: 'sync_vendas', account_id: conta.id,
          date_from: dIni, date_to: dIni,
          spreadsheet_id: PLANILHA_MESTRA, sheet_name: 'Shopee_Vendas',
        });
        log.push(`âœ… Shopee API ${nome}: ${r.mensagem || r.error || 'ok'}`);
      } else {
        const r = await invokeFunction('tiny', {
          action: 'sync_vendas_marketplace', date_from: dIniBR, date_to: dIniBR,
          plataforma: 'shopee', spreadsheet_id: PLANILHA_MESTRA, sheet_name: 'Shopee_Vendas',
        });
        log.push(`âœ… Shopee Tiny ${nome}: ${r.mensagem || r.error || 'ok'}`);
      }
    } catch (e: any) {
      log.push(`âŒ Shopee ${nome}: ${e.message}`);
    }
  }
  return log;
}

async function runTinyPlatform(plat: string, dIniBR: string): Promise<string[]> {
  const log: string[] = [];
  try {
    const r = await invokeFunction('tiny', {
      action: 'sync_vendas_marketplace', date_from: dIniBR, date_to: dIniBR,
      plataforma: plat, spreadsheet_id: PLANILHA_MESTRA,
      sheet_name: SHEET_MAP[plat] || 'Shopee_Vendas',
    });
    log.push(`âœ… ${plat.toUpperCase()} Tiny: ${r.mensagem || r.error || 'ok'}`);
  } catch (e: any) {
    log.push(`âŒ ${plat}: ${e.message}`);
  }
  return log;
}

async function runTinyEstoque(resumePage = 1, resumeOffset = 0, resumeTotal = 0): Promise<string[]> {
  const log: string[] = [];
  let page = resumePage;
  let offset = resumeOffset;
  let sheetMode = (page === 1 && offset === 0) ? 'write' : 'append';
  let totalSkus = resumeTotal;

  // Simple loop - same as the manual test browser loop
  try {
    while (true) {
      log.push(`Estoque Tiny: pag ${page}, offset ${offset}...`);
      const r = await invokeFunction('tiny', {
        action: 'sync_estoque_tiny',
        page,
        offset,
        sheetMode,
      });
      totalSkus += r.skus || 0;

      if (!r.hasMore) {
        log.push(`Estoque Tiny: ${totalSkus} SKUs sincronizados`);
        break;
      }

      page = r.nextPage;
      offset = r.nextOffset || 0;
      sheetMode = 'append';
      await new Promise(resolve => setTimeout(resolve, 600));
    }
  } catch (e: any) {
    log.push(`ERRO Estoque Tiny (pag ${page}): ${e.message}`);
    if (totalSkus > 0) log.push(`Parcial: ${totalSkus} SKUs sincronizados antes do erro`);
  }
  return log;
}

async function runSyncAdsDB(): Promise<string[]> {
  const log: string[] = [];
  try {
    const data = await invokeFunction('google-sheets', {
      action: 'read',
      spreadsheetId: PLANILHA_MESTRA,
      range: 'ADS-TOTAL-ML!A:C',
    });

    const rows: any[][] = data.values || [];
    if (rows.length < 2) {
      log.push('âš ï¸  ADS-TOTAL-ML vazia ou sem dados');
      return log;
    }

    // Formato: [data_ref, conta, valor_investido]
    const dbRows = rows.slice(1).map(row => ({
      data_ref: row[0] ? (() => {
        const p = String(row[0]).replace(/^'/, '').split('/');
        return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : row[0];
      })() : null,
      conta: String(row[1] || '').replace(/^'/, '').trim(),
      investimento: parseFloat(String(row[2] || '0').replace('R$', '').replace('.', '').replace(',', '.').trim()) || 0,
    })).filter(r => r.data_ref && r.conta);

    if (dbRows.length === 0) {
      log.push('âš ï¸  Nenhuma linha vÃ¡lida em ADS-TOTAL-ML');
      return log;
    }

    // Deduplicar por data_ref + conta (pegar o último valor de cada par)
    const dedupedRows = Object.values(
      dbRows.reduce((acc: any, row: any) => {
        const key = `${row.data_ref}__${row.conta}`;
        acc[key] = row; // último sobrescreve
        return acc;
      }, {})
    );

    const res = await fetch(`${SUPABASE_URL}/rest/v1/ads_db?on_conflict=data_ref,conta`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(dedupedRows),
    });

    if (!res.ok) {
      log.push(`â Œ Erro upsert ads_db: ${await res.text()}`);
    } else {
      log.push(`âœ… ads_db: ${dbRows.length} registros sincronizados`);
    }
  } catch (e: any) {
    log.push(`â Œ Erro Sync ADS DB: ${e.message}`);
  }
  return log;
}

async function runSyncCmvDB(): Promise<string[]> {
  const log: string[] = [];
  try {
    const mlAccounts = await restGet('ml_accounts?ativo=eq.true&select=id,nome,cmv_spreadsheet_id,cmv_sheet_tab,cmv_header_row,cmv_col_sku,cmv_col_simples,cmv_col_lucro_real');
    log.push(`📋 Analisando ${mlAccounts.length} contas para sincronia de CMV`);

    for (const conta of mlAccounts) {
      const sheetId = conta.cmv_spreadsheet_id;
      const sheetName = conta.cmv_sheet_tab || 'CMV';
      const headerRow = conta.cmv_header_row || 1;
      const colSku = conta.cmv_col_sku || 'A';
      const colSimples = conta.cmv_col_simples || 'B';
      const colReal = conta.cmv_col_lucro_real || 'C';

      if (!sheetId) {
        log.push(`⚠️ ${conta.nome}: spreadsheet_id não configurado. Pulo.`);
        continue;
      }

      try {
        // Leitura 1: SKU + CMV Lucro Real (colunas A e C)
        const dataReal = await invokeFunction('google-sheets', {
          action: 'read',
          spreadsheetId: sheetId,
          range: `${sheetName}!A${headerRow}:${colReal}`,
        });

        // Leitura 2: SKU + CMV Simples (colunas A e N)
        const dataSimples = await invokeFunction('google-sheets', {
          action: 'read',
          spreadsheetId: sheetId,
          range: `${sheetName}!A${headerRow}:${colSimples}`,
        });

        const rowsReal: any[][] = dataReal.values || [];
        const rowsSimples: any[][] = dataSimples.values || [];

        // Montar mapa de SKU → cmv_lucro_real
        const mapaReal: Record<string, number> = {};
        const idxReal = colToIndex(colReal); // índice relativo ao A
        rowsReal.slice(1).forEach(row => {
          const sku = String(row[0] || '').trim();
          if (sku) mapaReal[sku] = parseFloat(String(row[idxReal] || '0').replace(',', '.')) || 0;
        });

        // Montar mapa de SKU → cmv_simples
        const mapaSimples: Record<string, number> = {};
        const idxSimples = colToIndex(colSimples); // índice relativo ao A
        rowsSimples.slice(1).forEach(row => {
          const sku = String(row[0] || '').trim();
          if (sku) mapaSimples[sku] = parseFloat(String(row[idxSimples] || '0').replace(',', '.')) || 0;
        });

        // Combinar os dois mapas
        const allSkus = new Set([...Object.keys(mapaReal), ...Object.keys(mapaSimples)]);
        const dbRows = Array.from(allSkus).map(sku => ({
          sku,
          conta: conta.nome,
          cmv_lucro_real: mapaReal[sku] || 0,
          cmv_simples: mapaSimples[sku] || 0,
          spreadsheet_id: sheetId,
          synced_at: new Date().toISOString(),
        })).filter(r => r.sku && r.sku.toLowerCase() !== 'sku');

        if (dbRows.length === 0) {
          log.push(`⚠️ ${conta.nome}: Nenhum dado de CMV encontrado.`);
          continue;
        }

        // Upsert no banco
        const resDb = await fetch(`${SUPABASE_URL}/rest/v1/cmv_db?on_conflict=sku,conta`, {
          method: 'POST',
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates',
          },
          body: JSON.stringify(dbRows),
        });

        if (!resDb.ok) {
          log.push(`❌ ${conta.nome}: Erro upsert cmv_db: ${await resDb.text()}`);
        } else {
          log.push(`✅ ${conta.nome}: ${dbRows.length} SKUs sincronizados`);
        }
      } catch (e: any) {
        log.push(`❌ ${conta.nome}: ${e.message}`);
      }
    }
  } catch (e: any) {
    log.push(`❌ Erro fatal CMV Sync: ${e.message}`);
  }
  return log;
}

async function runVerify(runDate: string): Promise<string[]> {
  const log: string[] = [];
  const results = await restGet(`sync_run_log?run_date=eq.${runDate}&select=module,status,message&order=started_at.asc`);

  const errors = results.filter(r => r.status === 'error');
  const successes = results.filter(r => r.status === 'success');
  const running = results.filter(r => r.status === 'running');

  log.push(`ðŸ“Š Resumo da sincronizaÃ§Ã£o de ${runDate}:`);
  log.push(`  âœ… Sucesso: ${successes.length} mÃ³dulos`);
  if (running.length > 0) log.push(`  â³ Ainda rodando: ${running.length} mÃ³dulos`);
  if (errors.length > 0) {
    log.push(`  âŒ Erros: ${errors.length} mÃ³dulos`);
    for (const err of errors) {
      log.push(`    â†’ ${MODULE_LABELS[err.module] || err.module}: ${err.message || 'erro desconhecido'}`);
    }
  }

  if (errors.length === 0 && running.length === 0) {
    log.push(`\nðŸŽ‰ Todos os mÃ³dulos executados com sucesso!`);
  }

  return log;
}

// â”â”â” MAIN HANDLER â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing environment variables' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}

  const targetModule = body.module as string | undefined;
  const dIni = getYesterdayBR();
  const dIniBR = getYesterdayBR_DDMMYYYY();
  const runDate = getTodayBR();

  // If no module specified, run ALL enabled modules sequentially (manual/legacy mode)
  if (!targetModule) {
    const modules = await getEnabledModules();
    const enabledKeys = Object.entries(modules).filter(([_, v]) => v).map(([k]) => k);
    const allLog: string[] = [`ðŸš€ daily-sync completo iniciado. Data ref: ${dIni}`, `ðŸ“‹ MÃ³dulos: ${enabledKeys.join(', ') || 'NENHUM'}`];

    if (enabledKeys.length === 0) {
      return new Response(JSON.stringify({ sucesso: true, log: allLog }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    for (const key of enabledKeys) {
      const moduleLog = await executeModule(key, dIni, dIniBR, runDate);
      allLog.push(...moduleLog);
    }

    allLog.push(`\nâœ… daily-sync completo concluÃ­do.`);
    return new Response(JSON.stringify({ sucesso: true, log: allLog }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // â”â”â” SINGLE MODULE MODE (used by cron) â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”

  // Verify module
  if (targetModule === 'verify') {
    const verifyLog = await runVerify(runDate);
    const verifyText = verifyLog.join('\n');

    const hasErrors = verifyText.includes('âŒ');
    const emoji = hasErrors ? 'âš ï¸' : 'âœ…';
    await sendTelegram(`<b>${emoji} VerificaÃ§Ã£o Final - SincronizaÃ§Ã£o DiÃ¡ria</b>\n\n<pre>${verifyText}</pre>`);

    return new Response(JSON.stringify({ sucesso: true, log: verifyLog }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check if module is enabled (auto_chain continuations bypass this check)
  const isAutoChain = body.auto_chain === true;
  if (!isAutoChain) {
    const modules = await getEnabledModules();
    if (!modules[targetModule]) {
      const msg = `Modulo desabilitado: ${MODULE_LABELS[targetModule] || targetModule}`;
      return new Response(JSON.stringify({ sucesso: true, log: [msg], skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }
  const isResume = body.resume_page !== undefined;
  const resumeData = isResume ? { ...body, is_resume: true } : {};
  const moduleLog = await executeModule(targetModule, dIni, dIniBR, runDate, resumeData);

  return new Response(JSON.stringify({ sucesso: true, log: moduleLog }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

async function executeModule(moduleKey: string, dIni: string, dIniBR: string, runDate: string, resumeData: any = {}): Promise<string[]> {
  const label = MODULE_LABELS[moduleKey] || moduleKey;

  // Log start (only if not resuming to avoid log spam)
  let logId: string | undefined;
  if (!resumeData.is_resume) {
    const logEntry = await restPost('sync_run_log', {
      run_date: runDate,
      module: moduleKey,
      status: 'running',
      message: 'Iniciando...',
    });
    logId = logEntry?.[0]?.id;

    // Telegram: started
    await sendTelegram(`<b>ðŸ”„ Iniciando: ${label}</b>\nData ref: ${dIni}`);
  }

  let moduleLog: string[] = [];
  let hasError = false;

  try {
    switch (moduleKey) {
      case 'ml_vendas':
        moduleLog = await runMLModule('ml_vendas', 'sync_vendas', {}, dIni);
        break;
      case 'ml_performance':
        moduleLog = await runMLModule('ml_performance', 'get_performance_catalog', {}, dIni);
        break;
      case 'ml_v7':
        moduleLog = await runMLModule('ml_v7', 'get_vendas_full_7d', {}, dIni);
        break;
      case 'ml_ads':
        moduleLog = await runMLModule('ml_ads', 'get_ads_full_report', {}, dIni);
        break;
      case 'shopee_vendas':
        moduleLog = await runShopeeVendas(dIni, dIniBR);
        break;
      case 'tiny_shein':
        moduleLog = await runTinyPlatform('shein', dIniBR);
        break;
      case 'tiny_amazon':
        moduleLog = await runTinyPlatform('amazon', dIniBR);
        break;
      case 'tiny_tiktok':
        moduleLog = await runTinyPlatform('tiktok', dIniBR);
        break;
      case 'tiny_temu':
        moduleLog = await runTinyPlatform('temu', dIniBR);
        break;
      case 'tiny_estoque':
        moduleLog = await runTinyEstoque(resumeData.resume_page, resumeData.resume_offset, resumeData.resume_total);
        break;
      case 'ml_auto_robot':
        // 1. Fetch questions
        moduleLog.push('Iniciando busca de novas perguntas ML...');
        const fetchRes = await invokeFunction('ml-fetch-questions', {});
        moduleLog.push(`Fetch: ${fetchRes.queued || 0} novas perguntas na fila.`);
        // 2. Auto answer
        moduleLog.push('Iniciando processamento de respostas automáticas...');
        const answerRes = await invokeFunction('ml-auto-answer', {});
        moduleLog.push(`Respostas: ${answerRes.auto || 0} enviadas, ${answerRes.queued_manual || 0} sugeridas.`);
        break;
      case 'ml_cmv':
        moduleLog = await runSyncCmvDB();
        break;
      case 'sync_ads_db':
        moduleLog = await runSyncAdsDB();
        break;
      case 'sync_cmv_db':
        moduleLog = await runSyncCmvDB();
        break;
      default:
        moduleLog = [`âš ï¸ MÃ³dulo desconhecido: ${moduleKey}`];
    }

    hasError = moduleLog.some(l => l.includes('âŒ'));
  } catch (e: any) {
    moduleLog.push(`âŒ Erro geral: ${e.message}`);
    hasError = true;
  }

  // Update log entry
  const resultText = moduleLog.join('\n');
  if (logId) {
    await restPatch(`sync_run_log?id=eq.${logId}`, {
      status: hasError ? 'error' : 'success',
      message: resultText.slice(0, 1000),
      finished_at: new Date().toISOString(),
    });
  }

  // Telegram: finished
  const emoji = hasError ? 'âŒ' : 'âœ…';
  await sendTelegram(`<b>${emoji} ConcluÃ­do: ${label}</b>\n\n<pre>${resultText}</pre>`);

  return moduleLog;
}
