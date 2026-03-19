import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TINY_API = 'https://api.tiny.com.br/api2';

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

function mapTinyStatus(situacao: string): string {
  const s = (situacao || '').toLowerCase();
  if (s.includes('faturado') || s.includes('pronto envio') || s.includes('enviado') || s.includes('entregue') || s.includes('aprovado')) {
    return 'paid';
  }
  if (s.includes('cancelado')) return 'cancelled';
  if (s.includes('aberto') || s.includes('em andamento')) return 'payment_in_process';
  return s || 'unknown';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action } = await req.json();

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
