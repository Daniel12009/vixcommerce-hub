import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TINY_API = 'https://api.tiny.com.br/api2';

async function getSupabaseClient() {
  const url = (Deno.env.get('EXTERNAL_DB_URL') || Deno.env.get('SUPABASE_URL'))!;
  const key = (Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
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

// Get today's date in dd/mm/yyyy format (São Paulo)
function getTodayBR(): string {
  const now = new Date();
  const spOffset = -3 * 60;
  const localNow = new Date(now.getTime() + (spOffset + now.getTimezoneOffset()) * 60000);
  const d = String(localNow.getDate()).padStart(2, '0');
  const m = String(localNow.getMonth() + 1).padStart(2, '0');
  const y = localNow.getFullYear();
  return `${d}/${m}/${y}`;
}

// Fetch order details from Tiny
async function fetchOrderDetail(token: string, orderId: string): Promise<any> {
  const form = new URLSearchParams({
    token,
    id: orderId,
    formato: 'json',
  });

  const res = await fetch(`${TINY_API}/pedido.obter.php`, {
    method: 'POST',
    body: form,
  });

  const data = await res.json();
  return data?.retorno?.pedido || null;
}

// Search orders from Tiny
async function searchOrders(token: string, dataInicial: string, dataFinal: string, pagina: number): Promise<any> {
  const form = new URLSearchParams({
    token,
    formato: 'json',
    dataInicialOcorrencia: dataInicial,
    dataFinalOcorrencia: dataFinal,
    pagina: String(pagina),
    sort: 'DESC',
  });

  const res = await fetch(`${TINY_API}/pedidos.pesquisa.php`, {
    method: 'POST',
    body: form,
  });

  return res.json();
}

function parseTinyDate(dateStr: string): string {
  // Tiny dates: dd/mm/yyyy
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00-03:00`).toISOString();
  }
  return new Date().toISOString();
}

// ═══ COMISSÃO MARKETPLACE (tabela 2026) ═══════════════════════════════════
// Se API retornar valor_comissao > 0, usar. Senão, usar esta tabela como fallback.
function calcularComissao(plataforma: string, precoUnit: number, quantidade: number): number {
  const totalItem = precoUnit * quantidade;
  switch (plataforma.toLowerCase()) {
    case 'shopee': {
      // Tabela vigente março/2026 — por faixa de preço unitário
      if (precoUnit < 8.00)   return totalItem * 0.50;
      if (precoUnit < 80.00)  return (totalItem * 0.20) + (4.00 * quantidade);
      if (precoUnit < 100.00) return (totalItem * 0.14) + (16.00 * quantidade);
      if (precoUnit < 200.00) return (totalItem * 0.14) + (20.00 * quantidade);
      return (totalItem * 0.14) + (26.00 * quantidade); // R$200+ (cap removido mar/2026)
    }
    case 'shein':   return totalItem * 0.16;
    case 'amazon':  return totalItem * 0.11;
    case 'tiktok':  return totalItem * 0.05;
    case 'temu':    return totalItem * 0.18;
    default:        return totalItem * 0.20;
  }
}

function mapTinyStatus(situacao: string): string {
  const s = (situacao || '').toLowerCase();
  if (s.includes('faturado') || s.includes('pronto envio') || s.includes('enviado') || s.includes('entregue') || s.includes('aprovado')) {
    return 'paid';
  }
  if (s.includes('cancelado')) return 'cancelled';
  if (s.includes('aberto') || s.includes('em andamento')) return 'payment_in_process';
  return s || 'unknown';
}

// Helper: chamar google-sheets edge function para append
async function invokeSheets(spreadsheetId: string, range: string, values: any[][], action: 'append' | 'write' | 'clear' = 'append') {
  const url = (Deno.env.get('EXTERNAL_DB_URL') || Deno.env.get('SUPABASE_URL'))!;
  const key = (Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
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

  const res = await fetch(gsUrl, {
    method: 'POST', headers: gsHeaders,
    body: JSON.stringify({ action, spreadsheetId, range: normalizedRange, values }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets ${action} failed: ${err}`);
  }
  return res.json();
}

// Mapa de aba por plataforma
const SHEET_MAP: Record<string, string> = {
  shopee: 'Shopee_Vendas',
  shein: 'Shopee_Vendas',
  amazon: 'VENDASAZ',
  tiktok: 'VENDASTK',
  temu: 'VENDASTM',
};

// Mapa de nome de entrega por plataforma
const DELIVERY_MAP: Record<string, string> = {
  shopee: 'Shopee Xpress',
  shein: 'Shein Logistics',
  amazon: 'FBA',
  tiktok: 'TikTok Shipping',
  temu: 'Temu Logistics',
};

const PLANILHA_MESTRA = '1lMq5aeInwwv7st8-Rf-S8NYQJaQKkSbSD7PjtFhtPms';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const reqBody = await req.json();
    const { action } = reqBody;

    if (action === 'get_today_orders') {
      const accountsRes = await supabaseFetch('/tiny_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();

      if (!accounts || accounts.length === 0) {
        return new Response(JSON.stringify({ orders: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const today = getTodayBR();
      const allOrders: any[] = [];

      for (const account of accounts) {
        try {
          let pagina = 1;
          let hasMore = true;

          while (hasMore) {
            const data = await searchOrders(account.api_token, today, today, pagina);

            if (data?.retorno?.status === 'Erro') {
              // No orders found is not an error
              if (data.retorno?.codigo_erro === '2') {
                hasMore = false;
                break;
              }
              throw new Error(`Tiny error: ${data.retorno?.erros?.[0]?.erro || 'Unknown'}`);
            }

            const pedidos = data?.retorno?.pedidos || [];

            for (const p of pedidos) {
              const pedido = p.pedido;

              // Skip marketplace orders (already come from ML/Shopee APIs)
              const numEcom = (pedido.numero_ecommerce || '').toString();
              const ecommerce = (pedido.ecommerce || pedido.nome_ecommerce || '').toString().toLowerCase();

              const isMarketplace = numEcom.length > 0 ||
                ecommerce.includes('mercado') ||
                ecommerce.includes('shopee') ||
                ecommerce.includes('magalu') ||
                ecommerce.includes('amazon') ||
                ecommerce.includes('americanas') ||
                ecommerce.includes('shein') ||
                ecommerce.includes('tiktok');

              if (isMarketplace) {
                continue;
              }

              // Fetch full order detail for correct values
              const orderId = pedido.id || pedido.numero;
              let detail: any = null;
              try {
                detail = await fetchOrderDetail(account.api_token, String(orderId));
              } catch (e) {
                console.error(`Failed detail for order ${orderId}:`, e);
              }

              const detailPedido = detail || pedido;
              const totalAmount = parseFloat(detailPedido.total_pedido || detailPedido.totalPedido || detailPedido.valor || '0');

              // Get vendedor (seller)
              const vendedor = detailPedido.vendedor || detailPedido.nome_vendedor || '';
              console.log(`Order ${orderId}: vendedor="${vendedor}", buyer="${detailPedido.cliente?.nome || ''}", total=${totalAmount}`);

              // Classify canal based on vendedor name
              const vendedorLower = vendedor.toLowerCase();
              let canal = 'loja';
              if (vendedorLower.includes('alexia') && vendedorLower.includes('atacado')) {
                canal = 'atacado_alexia';
              } else if (vendedorLower.includes('atacado') || vendedorLower.includes('wholesale')) {
                canal = 'atacado_vf';
              }

              // Get items from detail
              const itens = detailPedido.itens || [];
              const items = itens.length > 0 ? itens.map((i: any) => {
                const it = i.item || i;
                return {
                  title: it.descricao || it.nome || '',
                  sku: it.codigo || '',
                  quantity: parseInt(it.quantidade || '1'),
                  unit_price: parseFloat(it.valor_unitario || '0'),
                };
              }) : [{
                title: `Pedido #${detailPedido.numero || orderId}`,
                sku: '',
                quantity: 1,
                unit_price: totalAmount,
              }];

              // Build conta label
              const canalLabel = canal === 'atacado_alexia' ? 'Atacado Alexia' :
                canal === 'atacado_vf' ? 'Atacado VF' : 'Loja';

              allOrders.push({
                id: orderId,
                status: mapTinyStatus(detailPedido.situacao || pedido.situacao),
                date_created: detailPedido.data_pedido ? parseTinyDate(detailPedido.data_pedido) : new Date().toISOString(),
                total_amount: totalAmount,
                buyer: detailPedido.cliente?.nome || pedido.cliente?.nome || pedido.nome || 'N/A',
                vendedor,
                canal,
                items,
                conta: `${account.nome} | ${canalLabel}`,
                plataforma: 'tiny',
                account_id: account.id,
              });
            }

            const totalPaginas = data?.retorno?.numero_paginas || 1;
            pagina++;
            hasMore = pagina <= totalPaginas;
          }
        } catch (err) {
          console.error(`Error fetching Tiny orders for ${account.nome}:`, err);
          allOrders.push({
            error: `Tiny|${account.nome}: ${err instanceof Error ? err.message : 'Unknown error'}`,
            conta: `Tiny|${account.nome}`,
          });
        }
      }

      return new Response(JSON.stringify({ orders: allOrders }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_pending_shipments') {
      const accountsRes = await supabaseFetch('/tiny_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();

      if (!accounts || accounts.length === 0) {
        return new Response(JSON.stringify({ shipments: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Last 15 days
      const now = new Date();
      const past = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
      
      const formatTinyDate = (d: Date) => {
        const spOffset = -3 * 60;
        const local = new Date(d.getTime() + (spOffset + d.getTimezoneOffset()) * 60000);
        return `${String(local.getDate()).padStart(2, '0')}/${String(local.getMonth() + 1).padStart(2, '0')}/${local.getFullYear()}`;
      };

      const dataInicial = formatTinyDate(past);
      const dataFinal = formatTinyDate(now);

      const allShipments: any[] = [];

      for (const account of accounts) {
        try {
          let pagina = 1;
          let hasMore = true;

          while (hasMore) {
            const data = await searchOrders(account.api_token, dataInicial, dataFinal, pagina);

            if (data?.retorno?.status === 'Erro') {
              if (data.retorno?.codigo_erro === '2') { hasMore = false; break; }
              throw new Error(`Tiny error: ${data.retorno?.erros?.[0]?.erro || 'Unknown'}`);
            }

            const pedidos = data?.retorno?.pedidos || [];

            for (const p of pedidos) {
              const pedido = p.pedido;
              const situacaoRaw = (pedido.situacao || '').toLowerCase();
              
              // Only pending shipments: Aberto, Aprovado, Preparando envio, Em separação
              if (!situacaoRaw.includes('aberto') && !situacaoRaw.includes('aprovado') && !situacaoRaw.includes('preparando') && !situacaoRaw.includes('separação')) {
                continue;
              }

              const numEcom = (pedido.numero_ecommerce || '').toString();
              const ecommerce = (pedido.ecommerce || pedido.nome_ecommerce || '').toString().toLowerCase();

              // We also want to include marketplaces from Tiny here if they are pending!
              let plataforma = 'tiny';
              if (ecommerce.includes('tiktok')) plataforma = 'tiktok';
              else if (ecommerce.includes('shein')) plataforma = 'shein';
              else if (ecommerce.includes('amazon')) plataforma = 'amazon';
              else if (ecommerce.includes('magalu')) plataforma = 'magalu';
              else if (ecommerce.includes('americanas')) plataforma = 'americanas';
              else if (ecommerce.includes('temu')) plataforma = 'temu';
              else if (ecommerce.includes('mercado') || ecommerce.includes('shopee')) {
                 continue; // ML and Shopee are handled directly via their APIs
              }

              // Fetch details
              const orderId = pedido.id || pedido.numero;
              let detail: any = null;
              try { detail = await fetchOrderDetail(account.api_token, String(orderId)); } catch (e) { /* skip */ }

              const detailPedido = detail || pedido;
              const totalAmount = parseFloat(detailPedido.total_pedido || detailPedido.totalPedido || detailPedido.valor || '0');
              const vendedor = detailPedido.vendedor || detailPedido.nome_vendedor || '';
              
              const formatedDate = detailPedido.data_pedido ? parseTinyDate(detailPedido.data_pedido) : new Date().toISOString();

              const itens = detailPedido.itens || [];
              const items = itens.length > 0 ? itens.map((i: any) => {
                const it = i.item || i;
                return {
                  title: it.descricao || it.nome || '',
                  sku: it.codigo || '',
                  quantity: parseInt(it.quantidade || '1'),
                  unitPrice: parseFloat(it.valor_unitario || '0'),
                };
              }) : [{ title: `Pedido #${orderId}`, sku: numEcom, quantity: 1, unitPrice: totalAmount }];

              allShipments.push({
                orderId: orderId,
                status: mapTinyStatus(detailPedido.situacao),
                shippingStatus: detailPedido.situacao,
                logisticType: detailPedido.forma_envio || 'Padrão',
                dateCreated: formatedDate,
                totalAmount: totalAmount,
                buyer: detailPedido.cliente?.nome || pedido.cliente?.nome || 'N/A',
                items,
                vendedor,
                conta: account.nome,
                accountId: account.id,
                plataforma
              });
            }

            const totalPaginas = data?.retorno?.numero_paginas || 1;
            pagina++;
            hasMore = pagina <= totalPaginas;
          }
        } catch (err) {
          console.error(`Error fetching Tiny pending shipments for ${account.nome}:`, err);
          allShipments.push({ error: `Tiny|${account.nome}: ${err instanceof Error ? err.message : 'Unknown'}`, conta: account.nome });
        }
      }

      return new Response(JSON.stringify({ shipments: allShipments }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch marketplace orders from Tiny (TikTok, Shein, Amazon, etc.)
    if (action === 'get_marketplace_orders') {
      const accountsRes = await supabaseFetch('/tiny_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();

      if (!accounts || accounts.length === 0) {
        return new Response(JSON.stringify({ orders: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const today = getTodayBR();
      const allOrders: any[] = [];

      // Marketplaces to look for (not covered by direct APIs)
      const targetMarketplaces = ['tiktok', 'shein', 'amazon', 'magalu', 'americanas', 'temu'];

      for (const account of accounts) {
        try {
          let pagina = 1;
          let hasMore = true;

          while (hasMore) {
            const data = await searchOrders(account.api_token, today, today, pagina);

            if (data?.retorno?.status === 'Erro') {
              if (data.retorno?.codigo_erro === '2') { hasMore = false; break; }
              throw new Error(`Tiny error: ${data.retorno?.erros?.[0]?.erro || 'Unknown'}`);
            }

            const pedidos = data?.retorno?.pedidos || [];

            for (const p of pedidos) {
              const pedido = p.pedido;
              const numEcom = (pedido.numero_ecommerce || '').toString();
              const ecommerce = (pedido.ecommerce || pedido.nome_ecommerce || '').toString().toLowerCase();

              // Only include orders from target marketplaces
              const matchedPlatform = targetMarketplaces.find(mp => ecommerce.includes(mp));
              if (!matchedPlatform && numEcom.length === 0) continue;
              if (!matchedPlatform) continue; // has ecommerce but not a target one (ML/Shopee handled elsewhere)

              // Fetch full details
              const orderId = pedido.id || pedido.numero;
              let detail: any = null;
              try { detail = await fetchOrderDetail(account.api_token, String(orderId)); } catch (e) { /* skip */ }

              const dp = detail || pedido;
              const totalAmount = parseFloat(dp.total_pedido || dp.totalPedido || dp.valor || '0');

              const itens = dp.itens || [];
              const items = itens.length > 0 ? itens.map((i: any) => {
                const it = i.item || i;
                return {
                  title: it.descricao || it.nome || '',
                  sku: it.codigo || '',
                  quantity: parseInt(it.quantidade || '1'),
                  unit_price: parseFloat(it.valor_unitario || '0'),
                };
              }) : [{ title: `Pedido #${dp.numero || orderId}`, sku: numEcom, quantity: 1, unit_price: totalAmount }];

              // Platform label
              const platformName = matchedPlatform === 'tiktok' ? 'TikTok Shop' :
                matchedPlatform.charAt(0).toUpperCase() + matchedPlatform.slice(1);

              allOrders.push({
                id: orderId,
                status: mapTinyStatus(dp.situacao || pedido.situacao),
                date_created: dp.data_pedido ? parseTinyDate(dp.data_pedido) : new Date().toISOString(),
                total_amount: totalAmount,
                buyer: dp.cliente?.nome || pedido.cliente?.nome || pedido.nome || 'N/A',
                items,
                conta: `${platformName} | ${account.nome}`,
                plataforma: matchedPlatform,
                account_id: account.id,
              });
            }

            const totalPaginas = data?.retorno?.numero_paginas || 1;
            pagina++;
            hasMore = pagina <= totalPaginas;
          }
        } catch (err) {
          console.error(`Error fetching marketplace orders for ${account.nome}:`, err);
        }
      }

      return new Response(JSON.stringify({ orders: allOrders }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══ GET DROP PENDING SHIPMENTS (TINY V3) ══════════════════════════════
    if (action === 'get_drop_pending_shipments') {
      const accountsRes = await supabaseFetch('/tiny_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();

      if (!accounts || accounts.length === 0) {
        return new Response(JSON.stringify({ shipments: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const allShipments: any[] = [];
      const accountPromises = accounts.map(async (account: any) => {
        const accountShipments: any[] = [];
        try {
          // Fetch from V3 /separacao
          // situations=0 is usually "Aguardando separação" in Tiny V3 docs
          const res = await fetch('https://api.tiny.com.br/public-api/v3/separacao?situacoes=0', {
            headers: { 'Authorization': `Bearer ${account.api_token}` },
          });

          if (!res.ok) throw new Error(`Tiny V3 Error: ${res.status}`);
          const data = await res.json();
          
          const separacoes = data?.itens || [];
          for (const s of separacoes) {
            // Fetch detail for items if needed, but /separacao usually has enough or we can map it
            // Tiny V3 list might be simplified, let's map what we have
            accountShipments.push({
              orderId: s.idOrigem || s.id,
              status: 'Aguardando Separação',
              shippingStatus: 'open',
              logisticType: 'Dropshipping',
              dateCreated: s.dataCriacao || new Date().toISOString(),
              totalAmount: s.valorTotal || 0,
              buyer: s.contato?.nome || 'N/A',
              items: (s.itens || []).map((i: any) => ({
                title: i.descricao || 'Produto',
                sku: i.codigo || '',
                quantity: i.quantidade || 1,
                unitPrice: i.valorUnitario || 0,
              })),
              conta: account.nome,
              accountId: account.id,
              plataforma: 'tiny_drop'
            });
          }
        } catch (err) {
          console.error(`Error fetching Tiny Drop shipments for ${account.nome}:`, err);
          accountShipments.push({ error: `${account.nome}: ${err instanceof Error ? err.message : 'Unknown error'}`, conta: account.nome });
        }
        return accountShipments;
      });

      const results = await Promise.all(accountPromises);
      const flattened = results.flat();

      return new Response(JSON.stringify({ shipments: flattened }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'sync_vendas_marketplace') {
      const body = await req.clone().then(r => r.json()).catch(() => ({}));
      const { date_from, date_to, plataforma, spreadsheet_id, sheet_name } = body;

      if (!date_from || !date_to || !plataforma) {
        throw new Error('date_from, date_to e plataforma são obrigatórios');
      }

      const platLower = plataforma.toLowerCase();
      const sheetTab = sheet_name || SHEET_MAP[platLower] || 'Shopee_Vendas';
      const sheetId = spreadsheet_id || PLANILHA_MESTRA;
      const platLabel = platLower === 'tiktok' ? 'TikTok Shop' :
        platLower.charAt(0).toUpperCase() + platLower.slice(1);

      const accountsRes = await supabaseFetch('/tiny_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();
      if (!accounts || accounts.length === 0) {
        return new Response(JSON.stringify({ mensagem: 'Nenhuma conta Tiny ativa', linhas_escritas: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const allRows: any[][] = [];
      const allDbRows: any[] = [];

      for (const account of accounts) {
        try {
          let pagina = 1;
          let hasMore = true;

          while (hasMore) {
            const data = await searchOrders(account.api_token, date_from, date_to, pagina);

            if (data?.retorno?.status === 'Erro') {
              if (data.retorno?.codigo_erro === '2') { hasMore = false; break; }
              throw new Error(`Tiny error: ${data.retorno?.erros?.[0]?.erro || 'Unknown'}`);
            }

            const pedidos = data?.retorno?.pedidos || [];

            for (const p of pedidos) {
              const pedido = p.pedido;
              const situacaoRaw = (pedido.situacao || '').toLowerCase();

              // Ignorar cancelados
              if (situacaoRaw.includes('cancelado')) continue;

              const numEcom = (pedido.numero_ecommerce || '').toString();
              const ecommerce = (pedido.ecommerce || pedido.nome_ecommerce || '').toString().toLowerCase();

              // Filtrar apenas marketplace desejado
              if (!ecommerce.includes(platLower)) continue;

              // Buscar detalhes
              const orderId = pedido.id || pedido.numero;
              let detail: any = null;
              try { detail = await fetchOrderDetail(account.api_token, String(orderId)); } catch { /* skip */ }
              const dp = detail || pedido;

              const itens = dp.itens || [];
              if (itens.length === 0) continue;

              const dataVenda = (dp.data_pedido || '').replace(/-/g, '/');
              const uf = dp.cliente?.uf || dp.cliente?.estado || '';

              for (const itemWrapper of itens) {
                const item = itemWrapper.item || itemWrapper;
                const sku = item.codigo || '';
                const qtd = parseInt(item.quantidade || '1');
                const precoUnit = parseFloat(item.valor_unitario || '0');
                const receita = precoUnit * qtd;

                // Comissão: API tem prioridade, senão fallback
                const comissaoApi = parseFloat(item.valor_comissao || '0');
                const comissaoFinal = comissaoApi > 0
                  ? comissaoApi
                  : calcularComissao(platLower, precoUnit, qtd);

                const frete = parseFloat(dp.valor_frete || '0');

                // Linha no formato 19-colunas (col 0-18)
                allRows.push([
                  sku,                                      // 0  SKU PRINCIPAL
                  sku,                                      // 1  SKU
                  dataVenda,                                // 2  Data da venda
                  dataVenda,                                // 3  EMISSAO
                  "'" + (numEcom || orderId),                 // 4  N.º de venda
                  platLabel,                                // 5  origem
                  numEcom || '',                            // 6  # de anúncio
                  'Padrão',                                 // 7  tipo de anuncio
                  '',                                       // 8  Venda por publicidade
                  DELIVERY_MAP[platLower] || 'Padrão',      // 9  Forma de entrega
                  precoUnit,                                // 10 Preço unitário
                  qtd,                                      // 11 Unidades
                  receita,                                  // 12 Receita
                  frete > 0 ? -frete : 0,                   // 13 Envio Seller
                  0,                                        // 14 TARIFA
                  -Math.abs(comissaoFinal),                  // 15 Tarifa de venda
                  '',                                       // 16 ADS
                  account.nome,                             // 17 conta
                  uf,                                       // 18 Estado
                ]);

                allDbRows.push({
                  numero_pedido: String(numEcom || orderId),
                  data: parseTinyDate(dp.data_pedido).slice(0,10),
                  conta: account.nome,
                  conta_id: account.id, // Tiny accounts also have ID in table
                  sku: sku,
                  quantidade: qtd,
                  valor_total: receita,
                  comissao: Math.abs(comissaoFinal),
                  frete: Math.abs(frete),
                  marketplace: platLabel,
                  origem: account.nome,
                  payload: { situacao: dp.situacao, ecommerce: dp.ecommerce }
                });
              }
            }

            const totalPaginas = data?.retorno?.numero_paginas || 1;
            pagina++;
            hasMore = pagina <= totalPaginas;
          }
        } catch (err) {
          console.error(`[SYNC] Erro Tiny ${platLabel} ${account.nome}:`, err);
        }
      }

      // Escrever no Google Sheets
      if (allRows.length > 0) {
        await invokeSheets(sheetId, `${sheetTab}!A:S`, allRows, 'append');
      }

      if (allDbRows.length > 0) {
        try {
          const resDb = await supabaseFetch('/vendas_db?on_conflict=numero_pedido,sku', {
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify(allDbRows)
          });
          if (!resDb.ok) {
             console.error('[SYNC VENDAS DB TINY] Upsert failed:', await resDb.text());
          } else {
             console.log('[SYNC DB] Upsert em vendas_db OK (' + allDbRows.length + ' linhas)');
          }
        } catch (e) {
          console.error('[SYNC VENDAS DB TINY] Erro no fetch do banco:', e);
        }
      }

      const msg = `${platLabel}: ${allRows.length} linhas escritas em ${sheetTab}`;
      console.log(`[SYNC] ${msg}`);
      return new Response(JSON.stringify({ mensagem: msg, linhas_escritas: allRows.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══ SYNC ESTOQUE TINY (JSchruber → ESTOQUE-TINY) ═══════════════════
    if (action === 'sync_estoque_tiny') {
      const TINY_TOKEN = (Deno.env.get('TINY_TOKEN_JSCHRUBER') || '').trim();
      if (!TINY_TOKEN) throw new Error('Token Tiny JSCHRUBER não configurado no .env');

      const startPage = reqBody.page || 1;
      const startOffset = reqBody.offset || 0;
      const sheetMode = reqBody.sheetMode || 'write';
      const MAX_PRODUCTS_PER_CALL = 10; // Process max 10 products per invocation to stay under timeout

      const PLANILHA_MESTRA = '1lMq5aeInwwv7st8-Rf-S8NYQJaQKkSbSD7PjtFhtPms';
      const SHEET_TAB = 'ESTOQUE-TINY';

      // Step 1: Fetch product list for the current page
      let data: any = null;
      let listAttempts = 0;
      while (listAttempts < 3) {
        const params = new URLSearchParams({
          token: TINY_TOKEN,
          formato: 'json',
          pagina: String(startPage),
        });
        const res = await fetch('https://api.tiny.com.br/api2/produtos.pesquisa.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });
        data = await res.json();

        if (data?.retorno?.status === 'Erro' || data?.retorno?.status === 'ERRO') {
          const code = data.retorno?.codigo_erro;
          if (code === '6' || code === '31' || String(data.retorno.erros?.[0]?.erro).includes('Bloqueada')) {
            listAttempts++;
            console.log(`Rate limit lista TINY. Tentativa ${listAttempts}/3. Aguardando 5s...`);
            await new Promise(r => setTimeout(r, 5000));
            continue;
          } else {
            throw new Error(`API Tiny Erro: ${data.retorno.erros?.[0]?.erro || JSON.stringify(data.retorno)}`);
          }
        }
        break;
      }

      if (data?.retorno?.status === 'Erro' || data?.retorno?.status === 'ERRO') {
        throw new Error(`API Tiny Erro fatal: ${data.retorno.erros?.[0]?.erro || JSON.stringify(data.retorno)}`);
      }

      const allProdutos = data?.retorno?.produtos || [];
      const totalPaginas = data?.retorno?.numero_paginas || 1;

      if (allProdutos.length === 0) {
        return new Response(JSON.stringify({ 
          mensagem: 'Nenhum produto encontrado', skus: 0, hasMore: false 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Step 2: Process only a slice of the products (startOffset to startOffset + MAX_PRODUCTS_PER_CALL)
      const slice = allProdutos.slice(startOffset, startOffset + MAX_PRODUCTS_PER_CALL);
      const allProducts: any[][] = [];

      for (const pw of slice) {
            console.log(`[TINY-DEBUG] Usando token: ${TINY_TOKEN.substring(0, 5)}...`);
            console.log(`[TINY-DEBUG] Produto raw: ${JSON.stringify(pw)}`);
            const p = pw.produto || pw;
            const codigo = (p.codigo || '').trim();
            if (!codigo) {
              console.log(`[TINY-SKIP] SKU vazio no ID ${p.id}`);
              continue;
            }

            let attempts = 0;
            let success = false;
            while (attempts < 3 && !success) {
              try {
                // Try with both id and idProduto for maximum compatibility
                const stockParams = new URLSearchParams({ 
                  token: TINY_TOKEN, 
                  id: String(p.id),
                  idProduto: String(p.id),
                  formato: 'json' 
                });
                const sRes = await fetch('https://api.tiny.com.br/api2/produto.obter.estoque.php', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: stockParams.toString(),
                });
                const sData = await sRes.json();
                console.log(`[TINY-DEBUG] sData Resposta (ID ${p.id}): ${JSON.stringify(sData)}`);

                if (sData?.retorno?.status === 'Erro') {
              const code = sData.retorno?.codigo_erro;
              if (code === '6' || code === '31' || String(sData.retorno.erros?.[0]?.erro).includes('Bloqueada')) {
                attempts++;
                console.log(`Rate limit TINY ID ${p.id}. Tentativa ${attempts}/3... aguardando 5s`);
                await new Promise(r => setTimeout(r, 5000));
                continue;
              }
            }

            const saldoStr = sData?.retorno?.produto?.saldo || 
                             sData?.retorno?.produto?.estoque_atual || 
                             sData?.retorno?.produto?.estoque?.saldo || '0';
            const saldo = parseFloat(String(saldoStr));
            
            console.log(`[TINY-STOCK] SKU: ${codigo}, ID: ${p.id}, Saldo: ${saldoStr} -> Parsed: ${saldo}`);

            // Only include products with stock >= 1
            if (Math.round(saldo) >= 1) {
              allProducts.push([codigo, Math.round(saldo), getTodayBR()]);
            } else {
              console.log(`[TINY-STOCK] SKU: ${codigo} ignorado (saldo < 1)`);
            }
            success = true;

            // Increased delay to 1500ms (40 req/min) to stay well under Tiny limits
            await new Promise(r => setTimeout(r, 1500));
          } catch (err) {
            console.error(`Erro buscando estoque ID ${p.id}:`, err);
            break;
          }
        }
      }

      // Step 3: Write to sheets
      const header = ['SKU', 'TOTAL', 'DATA SYNC'];
      if (sheetMode === 'write') {
        // First batch: clear the sheet then write header + data
        await invokeSheets(PLANILHA_MESTRA, SHEET_TAB, [], 'clear');
        await invokeSheets(PLANILHA_MESTRA, `${SHEET_TAB}!A1`, [header, ...allProducts], 'write');
      } else {
        // Subsequent batches: just append rows (no header)
        if (allProducts.length > 0) {
          await invokeSheets(PLANILHA_MESTRA, `${SHEET_TAB}!A1`, allProducts, 'append');
        }
      }

      // Determine next batch
      const nextOffset = startOffset + MAX_PRODUCTS_PER_CALL;
      let hasMore = false;
      let nextPage = startPage;
      let returnOffset = 0;

      if (nextOffset < allProdutos.length) {
        hasMore = true;
        returnOffset = nextOffset;
      } else if (startPage < totalPaginas) {
        hasMore = true;
        nextPage = startPage + 1;
        returnOffset = 0;
      }

      const msg = `Estoque Tiny: ${allProducts.length} SKUs (pag ${startPage}, offset ${startOffset})`;
      console.log(`[ESTOQUE-TINY] ${msg}`);
      return new Response(JSON.stringify({
        mensagem: msg,
        skus: allProducts.length,
        hasMore,
        nextPage,
        nextOffset: returnOffset,
        sheetMode: 'append',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error: unknown) {
    console.error('Tiny API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
