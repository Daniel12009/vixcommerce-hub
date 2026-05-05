const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'supabase', 'functions', 'shopee', 'index.ts');
let content = fs.readFileSync(targetFile, 'utf8');

// The new action block
const newActionCode = `
    if (action === 'sync_vendas_marketplace') {
      const { date_from, date_to, spreadsheet_id, sheet_name } = await req.clone().json().catch(() => reqBody || {});
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
        console.log(\`[SHOPEE NATIVE] Sincronizando conta \${account.nome}...\`);
        try {
          let cursor = '';
          let hasMore = true;
          const orderSns = [];

          // 1. Get all Order SNs in the date range
          while (hasMore) {
            const params = {
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
                 console.warn(\`Falha no Escrow do pedido \${o.order_sn}\`);
              }

              // Financial extraction
              const shopeeComissaoTotal = escrowIncome ? Math.abs(parseFloat(escrowIncome.commission_fee || 0)) + Math.abs(parseFloat(escrowIncome.service_fee || 0)) + Math.abs(parseFloat(escrowIncome.seller_service_fee || 0)) : 0;
              const shopeeTaxaTransacao = escrowIncome ? Math.abs(parseFloat(escrowIncome.seller_transaction_fee || 0)) : 0;
              const shopeeFrete = escrowIncome ? Math.abs(parseFloat(escrowIncome.actual_shipping_fee || 0)) - Math.abs(parseFloat(escrowIncome.shopee_shipping_rebate || 0)) : 0;

              const dtCriacao = new Date(o.create_time * 1000).toISOString();
              const dateBr = \`\${dtCriacao.substring(8,10)}/\${dtCriacao.substring(5,7)}/\${dtCriacao.substring(0,4)}\`;
              const numPed = \`'\${o.order_sn}\`;
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
          console.error(\`Erro conta \${account.nome}:\`, err);
        }
      }

      const sheetTab = sheet_name || 'Shopee_Vendas';
      const sheetId = spreadsheet_id || '1lMq5aeInwwv7st8-Rf-S8NYQJaQKkSbSD7PjtFhtPms';

      // Salvar na Planilha Google
      if (allRows.length > 0) {
        await invokeSheets(sheetId, \`\${sheetTab}!A:S\`, allRows, 'append');
      }

      const msg = \`Nativa Shopee: \${allRows.length} linhas escritas em \${sheetTab} | DEBUG: \${JSON.stringify(debugInfo)}\`;
      console.log(\`[SYNC NATIVE] \${msg}\`);
      
      return new Response(JSON.stringify({ mensagem: msg, linhas_escritas: allRows.length, debug: debugInfo }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
`;

const invokeSheetsCode = `
// ═══ GOOGLE SHEETS UTILS ═══════════════════════════════════════════════════
async function invokeSheets(spreadsheetId: string, range: string, values: any[][], action: 'append' | 'write' | 'clear' = 'append') {
  const url = (Deno.env.get('EXTERNAL_DB_URL') || Deno.env.get('SUPABASE_URL'))!;
  const key = (Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
  const gsUrl = \`\${url}/functions/v1/google-sheets\`;
  const gsHeaders = { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${key}\` };

  let normalizedRange = range;
  const bangIdx = range.indexOf('!');
  const rawTab = bangIdx > 0 ? range.slice(0, bangIdx).replace(/^'+|'+$/g, '') : '';
  if (rawTab && bangIdx > 0) {
    const cellRef = range.slice(bangIdx + 1);
    normalizedRange = \`'\${rawTab}'!\${cellRef}\`;
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
    throw new Error(\`Sheets \${action} failed: \${err}\`);
  }
  return res.json();
}
`;

// Insert action block right before "throw new Error(`Unknown action: ${action}`);"
if (!content.includes("action === 'sync_vendas_marketplace'")) {
    content = content.replace("throw new Error(`Unknown action: ${action}`);", newActionCode + "\\n    throw new Error(`Unknown action: ${action}`);");
}

// Append invokeSheets at the end
if (!content.includes("function invokeSheets(")) {
    content += "\\n" + invokeSheetsCode;
}

fs.writeFileSync(targetFile, content, 'utf8');
console.log("Successfully patched shopee/index.ts!");
