import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[Snapshot] Starting daily sales snapshot...');

    const fetchFunc = async (name: string, action: string) => {
      const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(`${name} failed: ${await res.text()}`);
      return res.json();
    };

    const [mlData, shopeeData, tinyData, mktData] = await Promise.all([
      fetchFunc('mercado-livre', 'get_today_orders').catch(e => ({ orders: [], error: e.message })),
      fetchFunc('shopee', 'get_today_orders').catch(e => ({ orders: [], error: e.message })),
      fetchFunc('tiny', 'get_today_orders').catch(e => ({ orders: [], error: e.message })),
      fetchFunc('tiny', 'get_marketplace_orders').catch(e => ({ orders: [], error: e.message })),
    ]);

    const allOrders = [
      ...(mlData.orders || []),
      ...(shopeeData.orders || []),
      ...(tinyData.orders || []),
      ...(mktData.orders || []),
    ].filter(o => !o.error && ['paid', 'partially_paid', 'payment_in_process', 'payment_required'].includes(o.status));

    console.log(`[Snapshot] Found ${allOrders.length} paid orders.`);

    const horaMap = new Map<string, { hora: string; faturamento: number; pedidos: number }>();
    for (let h = 0; h <= 23; h++) {
      const label = `${String(h).padStart(2, '0')}h`;
      horaMap.set(label, { hora: label, faturamento: 0, pedidos: 0 });
    }

    let totalFat = 0;
    const porConta: Record<string, number> = {};
    const porSkuVendas: Record<string, number> = {};
    const porSkuFat: Record<string, number> = {};

    // Detalhamento por hora + plataforma + canal + conta (para filtros retroativos no dashboard)
    // chave: `${hora}||${plataforma}||${canal}||${conta}`
    const detalhadoMap = new Map<string, { hora: string; plataforma: string; canal: string; conta: string; faturamento: number; pedidos: number }>();

    // Replica classifyCanal do front (simplificado): drop = drop_shipping/dropshipping; full = fulfillment; outros default
    const classifyCanal = (o: any): string => {
      const tipo = String(o.logistic_type || o.shipping?.logistic?.type || '').toLowerCase();
      if (tipo.includes('drop')) return 'drop';
      if (tipo.includes('fulfillment')) return 'full';
      if (tipo.includes('cross_docking') || tipo.includes('xd_drop_off')) return 'flex';
      return 'outros';
    };

    allOrders.forEach(o => {
      const d = new Date(o.date_created);
      d.setHours(d.getHours() - 3);
      const h = `${String(d.getHours()).padStart(2, '0')}h`;
      const cur = horaMap.get(h);
      if (cur) {
        cur.faturamento += o.total_amount;
        cur.pedidos += 1;
        totalFat += o.total_amount;
      }
      const c = (o.conta || 'Outros').toString();
      porConta[c] = (porConta[c] || 0) + (Number(o.total_amount) || 0);

      // Agrega detalhado
      const plataforma = String(o.plataforma || '').toLowerCase() || 'outros';
      const canal = classifyCanal(o);
      const dkey = `${h}||${plataforma}||${canal}||${c}`;
      const existing = detalhadoMap.get(dkey);
      if (existing) {
        existing.faturamento += Number(o.total_amount) || 0;
        existing.pedidos += 1;
      } else {
        detalhadoMap.set(dkey, {
          hora: h,
          plataforma,
          canal,
          conta: c,
          faturamento: Number(o.total_amount) || 0,
          pedidos: 1,
        });
      }

      (o.items || []).forEach((it: any) => {
        const skuRaw = it.sku || '';
        if (!skuRaw) return;
        const sk = String(skuRaw).trim().toUpperCase();
        const qty = Number(it.quantity) || 0;
        const fat = qty * (Number(it.unit_price) || 0);
        porSkuVendas[sk] = (porSkuVendas[sk] || 0) + qty;
        porSkuFat[sk] = (porSkuFat[sk] || 0) + fat;
      });
    });

    const vendasDetalhadas = Array.from(detalhadoMap.values());

    const vendasPorHora = Array.from(horaMap.values());

    const spOffset = -3 * 60;
    const now = new Date();
    const localNow = new Date(now.getTime() + (spOffset + now.getTimezoneOffset()) * 60000);
    const dateRef = localNow.toISOString().split('T')[0];

    console.log(`[Snapshot] Saving snapshot for ${dateRef}. Total: R$ ${totalFat.toFixed(2)}`);

    const { error } = await supabase
      .from('daily_sales_snapshots')
      .upsert({
        data_referencia: dateRef,
        vendas_por_hora: vendasPorHora,
        total_faturamento: totalFat,
        total_pedidos: allOrders.length,
        por_conta: porConta,
        por_sku_vendas: porSkuVendas,
        por_sku_faturamento: porSkuFat,
      }, { onConflict: 'data_referencia' });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, date: dateRef, total: totalFat }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[Snapshot] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
