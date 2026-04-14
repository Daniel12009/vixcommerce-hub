const fs = require('fs');

let content = fs.readFileSync('supabase/functions/tiny/index.ts', 'utf8');

// 1. Correct the action name if it's indeed sync_estoque_tiny where it shouldn't be
// We saw it at line 586 in the previous view_file.
// It has date_from, date_to, plataforma, spreadsheet_id, sheet_name destructured.
content = content.replace(
  /if \(action === 'sync_estoque_tiny'\) \{\r?\n      const body = await req\.clone\(\)\.then\(r => r\.json\(\)\)\.catch\(\(\) => \(\{\}\)\);\r?\n      const \{ date_from, date_to, plataforma, spreadsheet_id, sheet_name \} = body;/,
  `if (action === 'sync_vendas_marketplace') {
      const body = await req.clone().then(r => r.json()).catch(() => ({}));
      const { date_from, date_to, plataforma, spreadsheet_id, sheet_name } = body;`
);

// 2. Locate the accounts loop and the rows array
// We need to collect dbRows as well.
content = content.replace(
  /const allRows: any\[\]\[\] = \[\];/,
  `const allRows: any[][] = [];
      const allDbRows: any[] = [];`
);

// 3. Inside the order item loop, push to allDbRows
content = content.replace(
  /allRows\.push\(\[\r?\n\s+sku,[\s\S]*?uf,[\s\S]*?\]\);/g,
  `allRows.push([
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
                });`
);

// 4. Perform the Supabase upsert after writing to sheets
content = content.replace(
  /await invokeSheets\(sheetId, `\$\{sheetTab\}!A:S`, allRows, 'append'\);\r?\n\s+\}/,
  `await invokeSheets(sheetId, \`\${sheetTab}!A:S\`, allRows, 'append');
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
      }`
);

fs.writeFileSync('supabase/functions/tiny/index.ts', content, 'utf8');
console.log('SUCCESS');
