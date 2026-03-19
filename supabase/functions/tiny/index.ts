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
              allOrders.push({
                id: pedido.id || pedido.numero,
                status: mapTinyStatus(pedido.situacao),
                date_created: new Date().toISOString(),
                total_amount: parseFloat(pedido.totalPedido || pedido.total_pedido || '0'),
                buyer: pedido.cliente?.nome || pedido.nome || 'N/A',
                items: [{
                  title: `Pedido #${pedido.numero || pedido.id}`,
                  sku: pedido.numero_ecommerce || '',
                  quantity: 1,
                  unit_price: parseFloat(pedido.totalPedido || pedido.total_pedido || '0'),
                }],
                conta: `Tiny|${account.nome}`,
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
