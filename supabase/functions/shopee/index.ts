import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

import { shopeeFetch, buildShopeeUrl, supabaseFetch } from '../_shared/shopee-utils.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const reqBody = await req.json();
    const { action } = reqBody;

    if (action === 'get_today_orders') {
      const accountsRes = await supabaseFetch('/shopee_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();

      if (!accounts || accounts.length === 0) {
        return new Response(JSON.stringify({ orders: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Today in São Paulo (UTC-3)
      const now = new Date();
      const spOffset = -3 * 60;
      const localNow = new Date(now.getTime() + (spOffset + now.getTimezoneOffset()) * 60000);
      const todayStart = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate(), 0, 0, 0);
      const timeFrom = Math.floor((todayStart.getTime() - (spOffset + now.getTimezoneOffset()) * 60000) / 1000);
      const timeTo = Math.floor(now.getTime() / 1000);

      const accountPromises = accounts.map(async (account: any) => {
        const accountOrders: any[] = [];
        try {
          // Step 1: Get order list (with pagination)
          let cursor = '';
          let hasMore = true;

          while (hasMore) {
            const params: Record<string, string> = {
              time_range_field: 'create_time',
              time_from: String(timeFrom),
              time_to: String(timeTo),
              page_size: '50',
              response_optional_fields: 'order_status',
            };
            if (cursor) params.cursor = cursor;

            const listData = await shopeeFetch(account, '/api/v2/order/get_order_list', params);
            const orderSns = (listData.response?.order_list || []).map((o: any) => o.order_sn);

            if (orderSns.length === 0) {
              hasMore = false;
              break;
            }

            // Step 2: Get order details
            const detailData = await shopeeFetch(account, '/api/v2/order/get_order_detail', {
              order_sn_list: orderSns.join(','),
              response_optional_fields: 'buyer_user_id,buyer_username,item_list,order_status,total_amount',
            });

            const orders = (detailData.response?.order_list || []).map((o: any) => ({
              id: o.order_sn,
              status: mapShopeeStatus(o.order_status),
              date_created: new Date(o.create_time * 1000).toISOString(),
              total_amount: o.total_amount || 0,
              buyer: o.buyer_username || 'N/A',
              items: (o.item_list || []).map((item: any) => ({
                title: item.item_name || '',
                sku: item.model_sku || item.item_sku || '',
                quantity: item.model_quantity_purchased || 1,
                unit_price: item.model_discounted_price || item.model_original_price || 0,
              })),
              conta: `Shopee|${account.nome}`,
              plataforma: 'shopee',
              account_id: account.id,
            }));

            accountOrders.push(...orders);
            
            hasMore = listData.response?.more || false;
            cursor = listData.response?.next_cursor || '';
          }
        } catch (err) {
          console.error(`Error fetching Shopee orders for ${account.nome}:`, err);
          accountOrders.push({ error: `Shopee|${account.nome}: ${err instanceof Error ? err.message : 'Unknown error'}`, conta: `Shopee|${account.nome}` });
        }
        return accountOrders;
      });

      const results = await Promise.all(accountPromises);
      const allOrders = results.flat();

      return new Response(JSON.stringify({ orders: allOrders }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_pending_shipments') {
      const accountsRes = await supabaseFetch('/shopee_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();

      if (!accounts || accounts.length === 0) {
        return new Response(JSON.stringify({ shipments: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Last 15 days
      const now = new Date();
      const past = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
      const timeFrom = Math.floor(past.getTime() / 1000);
      const timeTo = Math.floor(now.getTime() / 1000);

      const accountPromises = accounts.map(async (account: any) => {
        const accountShipments: any[] = [];
        try {
          let cursor = '';
          let hasMore = true;

          while (hasMore) {
            const params: Record<string, string> = {
              time_range_field: 'create_time',
              time_from: String(timeFrom),
              time_to: String(timeTo),
              page_size: '50',
              status: 'READY_TO_SHIP', // Only fetch pending orders
            };
            if (cursor) params.cursor = cursor;

            const listData = await shopeeFetch(account, '/api/v2/order/get_order_list', params);
            const orderSns = (listData.response?.order_list || []).map((o: any) => o.order_sn);

            if (orderSns.length === 0) {
              hasMore = false;
              break;
            }

            // Get order details including shipping_carrier
            const detailData = await shopeeFetch(account, '/api/v2/order/get_order_detail', {
              order_sn_list: orderSns.join(','),
              response_optional_fields: 'buyer_user_id,buyer_username,item_list,order_status,total_amount,shipping_carrier',
            });

            const orders = (detailData.response?.order_list || [])
              .filter((o: any) => {
                const s = o.order_status;
                // Only include pending shipments
                return s === 'READY_TO_SHIP' || s === 'PROCESSED' || s === 'RETRY_SHIP';
              })
              .map((o: any) => ({
                orderId: o.order_sn,
                status: mapShopeeStatus(o.order_status),
                shippingStatus: o.order_status,
                logisticType: o.shipping_carrier || 'Standard',
                dateCreated: new Date(o.create_time * 1000).toISOString(),
                totalAmount: o.total_amount || 0,
                buyer: o.buyer_username || 'N/A',
                items: (o.item_list || []).map((item: any) => ({
                  title: item.item_name || '',
                  sku: item.model_sku || item.item_sku || '',
                  quantity: item.model_quantity_purchased || 1,
                  unitPrice: item.model_discounted_price || item.model_original_price || 0,
                })),
                conta: account.nome,
                accountId: account.id,
                plataforma: 'shopee'
              }));

            accountShipments.push(...orders);
            
            hasMore = listData.response?.more || false;
            cursor = listData.response?.next_cursor || '';
          }
        } catch (err) {
          console.error(`Error fetching Shopee pending shipments for ${account.nome}:`, err);
          accountShipments.push({ error: `${account.nome}: ${err instanceof Error ? err.message : 'Unknown error'}`, conta: account.nome });
        }
        return accountShipments;
      });

      const results = await Promise.all(accountPromises);
      const allShipments = results.flat();

      return new Response(JSON.stringify({ shipments: allShipments }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ━━━━━━━━━━ PRODUCT MANAGEMENT (Ficha Técnica) ━━━━━━━━━━

    if (action === 'list_accounts') {
      const accountsRes = await supabaseFetch('/shopee_accounts?ativo=eq.true&select=id,nome');
      const accounts = await accountsRes.json();
      return new Response(JSON.stringify(accounts || []), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'list_items') {
      const { account_id, offset = 0, limit = 50, item_status = 'NORMAL' } = await req.clone().json() as any;
      const accountsRes = await supabaseFetch(`/shopee_accounts?id=eq.${account_id}&ativo=eq.true`);
      const accounts = await accountsRes.json();
      if (!accounts || accounts.length === 0) throw new Error('Conta Shopee não encontrada');
      const account = accounts[0];

      const listData = await shopeeFetch(account, '/api/v2/product/get_item_list', {
        offset: String(offset),
        page_size: String(Math.min(limit, 50)),
        item_status,
      });

      const itemIds = (listData.response?.item || []).map((i: any) => i.item_id);
      if (itemIds.length === 0) {
        return new Response(JSON.stringify({ items: [], total: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fetch base info for all items
      const infoData = await shopeeFetch(account, '/api/v2/product/get_item_base_info', {
        item_id_list: itemIds.join(','),
      });

      const items = (infoData.response?.item_list || []).map((item: any) => ({
        id: String(item.item_id),
        title: item.item_name || '',
        price: item.price_info?.[0]?.current_price || 0,
        thumbnail: (item.image?.image_url_list || [])[0] || '',
        available_quantity: item.stock_info_v2?.summary_info?.total_available_stock || 0,
        status: mapShopeeItemStatus(item.item_status),
        sub_status: [],
        seller_sku: item.item_sku || '',
        skus: [item.item_sku].filter(Boolean),
        conta: `Shopee|${account.nome}`,
      }));

      return new Response(JSON.stringify({
        items,
        total: listData.response?.total_count || items.length,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_item_detail') {
      const { account_id, item_id } = await req.clone().json() as any;
      const accountsRes = await supabaseFetch(`/shopee_accounts?id=eq.${account_id}&ativo=eq.true`);
      const accounts = await accountsRes.json();
      if (!accounts || accounts.length === 0) throw new Error('Conta Shopee não encontrada');
      const account = accounts[0];

      // Base info
      const infoData = await shopeeFetch(account, '/api/v2/product/get_item_base_info', {
        item_id_list: item_id,
      });
      const item = infoData.response?.item_list?.[0];
      if (!item) throw new Error('Item não encontrado');

      // Models (variations)
      let models: any[] = [];
      try {
        const modelData = await shopeeFetch(account, '/api/v2/product/get_model_list', {
          item_id: String(item_id),
        });
        models = modelData.response?.model || [];
      } catch { /* item may have no models */ }

      const pictures = (item.image?.image_url_list || []).map((url: string, i: number) => ({
        id: `img_${i}`,
        url,
        secure_url: url,
      }));

      const variations = models.map((m: any) => ({
        id: m.model_id,
        price: m.price_info?.[0]?.current_price || 0,
        available_quantity: m.stock_info_v2?.summary_info?.total_available_stock || 0,
        picture_ids: [],
        attribute_combinations: (m.tier_index || []).map((ti: number, idx: number) => ({
          id: `tier_${idx}`,
          name: `Variação ${idx + 1}`,
          value_name: String(ti),
        })),
      }));

      const detail = {
        id: String(item.item_id),
        title: item.item_name || '',
        price: item.price_info?.[0]?.current_price || 0,
        available_quantity: item.stock_info_v2?.summary_info?.total_available_stock || 0,
        status: mapShopeeItemStatus(item.item_status),
        sub_status: [],
        condition: item.condition || 'NEW',
        permalink: '',
        listing_type_id: 'shopee_standard',
        date_created: item.create_time ? new Date(item.create_time * 1000).toISOString() : '',
        category_id: String(item.category_id || ''),
        catalog_listing: false,
        warranty: '',
        video_id: '',
        pictures,
        variations,
        shipping: { logistic_type: 'shopee_logistics', free_shipping: false },
        seller_custom_field: item.item_sku || '',
        description_text: item.description || '',
        conta: `Shopee|${account.nome}`,
        tags: [],
        attributes: (item.attribute_list || []).map((a: any) => ({
          id: String(a.attribute_id),
          name: a.attribute_name || `attr_${a.attribute_id}`,
          value_name: a.attribute_value_list?.[0]?.original_value_name || '',
        })),
        promotions: [],
        health: { good_quality_thumbnail: true, good_quality_picture: true, catalog_listing: false },
        sale_terms: [],
      };

      return new Response(JSON.stringify(detail), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update_item') {
      const { account_id, item_id, fields } = await req.clone().json() as any;
      const accountsRes = await supabaseFetch(`/shopee_accounts?id=eq.${account_id}&ativo=eq.true`);
      const accounts = await accountsRes.json();
      if (!accounts || accounts.length === 0) throw new Error('Conta Shopee não encontrada');
      const account = accounts[0];

      const results: string[] = [];

      // Update item name/description
      if (fields.title || fields.description) {
        const updatePayload: any = { item_id: parseInt(item_id) };
        if (fields.title) updatePayload.item_name = fields.title;
        if (fields.description) updatePayload.description = fields.description;

        const url = await buildShopeeUrl(account, '/api/v2/product/update_item');
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        });
        const data = await res.json();
        if (data.error) results.push(`Erro ao atualizar item: ${data.error} ${data.message || ''}`);
        else results.push('Nome/Descrição atualizado');
      }

      // Update price (via model or global)
      if (fields.price !== undefined) {
        const pricePayload = {
          item_id: parseInt(item_id),
          price_list: [{ original_price: parseFloat(fields.price) }],
        };
        const url = await buildShopeeUrl(account, '/api/v2/product/update_price');
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pricePayload),
        });
        const data = await res.json();
        if (data.error) results.push(`Erro ao atualizar preço: ${data.error}`);
        else results.push('Preço atualizado');
      }

      // Update stock
      if (fields.available_quantity !== undefined) {
        const stockPayload = {
          item_id: parseInt(item_id),
          stock_list: [{ seller_stock: [{ stock: parseInt(fields.available_quantity) }] }],
        };
        const url = await buildShopeeUrl(account, '/api/v2/product/update_stock');
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(stockPayload),
        });
        const data = await res.json();
        if (data.error) results.push(`Erro ao atualizar estoque: ${data.error}`);
        else results.push('Estoque atualizado');
      }

      return new Response(JSON.stringify({ results, id: item_id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    
    if (action === 'sync_vendas_marketplace') {
      const { date_from, date_to, spreadsheet_id, sheet_name } = reqBody;
      const dateFromStr = date_from || new Date(Date.now() - 7 * 86400000).toLocaleDateString('pt-BR');
      const dateToStr = date_to || new Date().toLocaleDateString('pt-BR');

      // Helper function to parse DD/MM/YYYY into Unix timestamp
      const parseDateToUnix = (dateStr, endOfDay = false) => {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
          if (endOfDay) {
            d.setHours(23, 59, 59, 999);
          }
          return Math.floor(d.getTime() / 1000);
        }
        return Math.floor(Date.now() / 1000);
      };

      const timeFrom = parseDateToUnix(dateFromStr, false);
      const timeTo = parseDateToUnix(dateToStr, true);

      const accountsRes = await supabaseFetch('/shopee_accounts?ativo=eq.true');
      const accounts = await accountsRes.json();
      if (!accounts || accounts.length === 0) {
        return new Response(JSON.stringify({ mensagem: 'Nenhuma conta Shopee ativa', linhas_escritas: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const allRows = [];
      const allDbRows = [];
      const debugInfo = { contas: accounts.length, pedidos_listados: 0, pedidos_detalhados: 0, date_from: dateFromStr, date_to: dateToStr };

      for (const account of accounts) {
        console.log(`[SHOPEE NATIVE] Sincronizando conta ${account.nome}...`);
        try {
          let cursor = '';
          let hasMore = true;
          const orderSns = [];

          // 1. Get all Order SNs in the date range
          while (hasMore) {
            const params: Record<string, string> = {
              time_range_field: 'create_time',
              time_from: String(timeFrom),
              time_to: String(timeTo),
              page_size: '50',
            };
            if (cursor) params.cursor = cursor;

            const listData = await shopeeFetch(account, '/api/v2/order/get_order_list', params);
            const list = listData?.response?.order_list || [];
            
            for (const o of list) {
              orderSns.push(o.order_sn);
            }
            
            hasMore = listData?.response?.more || false;
            cursor = listData?.response?.next_cursor || '';
          }

          debugInfo.pedidos_listados += orderSns.length;

          if (orderSns.length === 0) continue;

          // 2. Chunk by 50 and get order details
          const chunkSize = 50;
          for (let i = 0; i < orderSns.length; i += chunkSize) {
            const chunk = orderSns.slice(i, i + chunkSize);
            
            const detailData = await shopeeFetch(account, '/api/v2/order/get_order_detail', {
              order_sn_list: chunk.join(','),
              response_optional_fields: 'buyer_user_id,buyer_username,item_list,order_status,total_amount,recipient_address,estimated_shipping_fee,actual_shipping_fee',
            });

            const orders = detailData?.response?.order_list || [];
            debugInfo.pedidos_detalhados += orders.length;

            // 3. For each order, get Escrow details individually (with slight parallelism/batching)
            for (const o of orders) {
              // Status check (only paid/completed orders)
              const status = (o.order_status || '').toUpperCase();
              if (['UNPAID', 'CANCELLED', 'IN_CANCEL'].includes(status)) {
                 continue; // ignore unpaid/cancelled
              }

              // Escrow Detail (Taxes and Commissions)
              let escrowIncome = null;
              try {
                const escrowData = await shopeeFetch(account, '/api/v2/payment/get_escrow_detail', { order_sn: o.order_sn });
                escrowIncome = escrowData?.response?.order_income || null;
              } catch (e) {
                 console.warn(`Falha no Escrow do pedido ${o.order_sn}`);
              }

              // Financial extraction
              const shopeeComissaoTotal = escrowIncome ? Math.abs(parseFloat(escrowIncome.commission_fee || 0)) + Math.abs(parseFloat(escrowIncome.service_fee || 0)) + Math.abs(parseFloat(escrowIncome.seller_service_fee || 0)) : 0;
              const shopeeTaxaTransacao = escrowIncome ? Math.abs(parseFloat(escrowIncome.seller_transaction_fee || 0)) : 0;
              const shopeeFrete = escrowIncome ? Math.abs(parseFloat(escrowIncome.actual_shipping_fee || 0)) - Math.abs(parseFloat(escrowIncome.shopee_shipping_rebate || 0)) : 0;

              const dtCriacao = new Date(o.create_time * 1000).toISOString();
              const dateBr = `${dtCriacao.substring(8,10)}/${dtCriacao.substring(5,7)}/${dtCriacao.substring(0,4)}`;
              const numPed = `'${o.order_sn}`;
              const plataformaCapitalized = 'Shopee';
              const state = o.recipient_address?.state || '';

              const itens = o.item_list || [];
              let isFirstItem = true;

              for (const it of itens) {
                const sku = it.model_sku || it.item_sku || 'SEM_SKU';
                const qtd = parseInt(it.model_quantity_purchased || '1');
                const precoUnit = parseFloat(it.model_discounted_price || it.model_original_price || '0');
                const totalItem = precoUnit * qtd;

                // Comissao da linha (apenas no primeiro item se não houver prorrateamento, seguindo logica antiga)
                let comissaoLinha = 0;
                let taxaLinha = 0;
                
                if (escrowIncome) {
                   if (isFirstItem) {
                      comissaoLinha = shopeeComissaoTotal * -1;
                      taxaLinha = shopeeTaxaTransacao * -1;
                   }
                } else {
                   comissaoLinha = ((totalItem * 0.235) + (4.00 * qtd)) * -1; // Fallback da Shopee
                }

                allRows.push([
                  sku, // A
                  sku, // B
                  dateBr, // C
                  dateBr, // D
                  numPed, // E
                  plataformaCapitalized, // F
                  '', // G
                  'Padrão', // H
                  '', // I
                  'Padrão', // J
                  precoUnit.toFixed(2).replace('.', ','), // K
                  qtd, // L
                  totalItem.toFixed(2).replace('.', ','), // M
                  taxaLinha.toFixed(2).replace('.', ','), // N (Tarifa)
                  '0,00', // O (Impostos)
                  comissaoLinha.toFixed(2).replace('.', ','), // P (Comissão)
                  isFirstItem ? (shopeeFrete * -1).toFixed(2).replace('.', ',') : '0,00', // Q (Frete)
                  account.nome, // R
                  state // S (Estado/UF direto da Shopee)
                ]);

                isFirstItem = false;
              }
            }
          }
        } catch (err) {
          console.error(`Erro conta ${account.nome}:`, err);
        }
      }

      const sheetTab = sheet_name || 'Shopee_Vendas';
      const sheetId = spreadsheet_id || '1lMq5aeInwwv7st8-Rf-S8NYQJaQKkSbSD7PjtFhtPms';

      // Salvar na Planilha Google
      if (allRows.length > 0) {
        await invokeSheets(sheetId, `${sheetTab}!A:S`, allRows, 'append');
      }

      const msg = `Nativa Shopee: ${allRows.length} linhas escritas em ${sheetTab} | DEBUG: ${JSON.stringify(debugInfo)}`;
      console.log(`[SYNC NATIVE] ${msg}`);
      
      return new Response(JSON.stringify({ mensagem: msg, linhas_escritas: allRows.length, debug: debugInfo }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unknown action: ${action}`);
  } catch (error: unknown) {
    console.error('Shopee API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function mapShopeeStatus(status: string): string {
  switch (status) {
    case 'READY_TO_SHIP':
    case 'PROCESSED':
    case 'SHIPPED':
    case 'COMPLETED':
    case 'INVOICE_PENDING':
      return 'paid';
    case 'IN_CANCEL':
    case 'CANCELLED':
      return 'cancelled';
    default:
      return status?.toLowerCase() || 'unknown';
  }
}

function mapShopeeItemStatus(status: string): string {
  switch (status) {
    case 'NORMAL': return 'active';
    case 'BANNED': return 'closed';
    case 'DELETED': return 'closed';
    case 'UNLIST': return 'paused';
    default: return status?.toLowerCase() || 'unknown';
  }
}


// ═══ GOOGLE SHEETS UTILS ═══════════════════════════════════════════════════
async function invokeSheets(spreadsheetId: string, range: string, values: any[][], action: 'append' | 'write' | 'clear' = 'append') {
  const url = (Deno.env.get('EXTERNAL_DB_URL') || Deno.env.get('SUPABASE_URL'))!;
  const key = (Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
  const gsUrl = `${url}/functions/v1/google-sheets`;
  const gsHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` };

  let normalizedRange = range;
  const bangIdx = range.indexOf('!');
  const rawTab = bangIdx > 0 ? range.slice(0, bangIdx).replace(/^'+|'+$/g, '') : '';
  if (rawTab && bangIdx > 0) {
    const cellRef = range.slice(bangIdx + 1);
    normalizedRange = `'${rawTab}'!${cellRef}`;
  }

  if (rawTab) {
    try {
      await fetch(gsUrl, {
        method: 'POST', headers: gsHeaders,
        body: JSON.stringify({ action: 'create_sheet', spreadsheetId, sheetTitle: rawTab }),
      });
    } catch { /* tab may already exist */ }
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
