const fs = require('fs');

let content = fs.readFileSync('supabase/functions/mercado-livre/index.ts', 'utf8');

// 1. Signature
content = content.replace(
  /async function processarVendaMLSingle([\s\S]*?)\): Promise<any\[\]\[\]> {/,
  `async function processarVendaMLSingle$1): Promise<{ linhasSheets: any[][]; dbRows: any[] }> {`
);

// 2. Returns and init arrays
content = content.replace(
  /    if \(venda\.status === 'cancelled'\) return \[\];\r?\n/,
  `    if (venda.status === 'cancelled') return { linhasSheets: [], dbRows: [] };\n`
);

content = content.replace(
  /    const linhas: any\[\]\[\] = \[\];\r?\n    const orderItems: any\[\] =/g,
  `    const linhasSheets: any[][] = [];\n    const dbRows: any[] = [];\n    const orderItems: any[] =`
);

// 3. Inject Date parsing loop start
content = content.replace(
  /    for \(const item of orderItems\) \{/g,
  `    let ymd = new Date().toISOString().slice(0, 10);\n    if (venda.date_created) {\n      try {\n        const dt = new Date(venda.date_created.replace('Z', '+00:00'));\n        dt.setHours(dt.getHours() - 3);\n        ymd = dt.toISOString().slice(0, 10);\n      } catch { }\n    }\n\n    for (const item of orderItems) {`
);

// 4. Update push and return within loop
content = content.replace(
  /      linhas\.push\(\[/g,
  `      linhasSheets.push([`
);

content = content.replace(
  /        estado,\r?\n      \]\);\r?\n    \}\r?\n\r?\n    return linhas;\r?\n  \} catch \(err\) \{\r?\n    console\.error\('\[processarVendaMLSingle\] erro:', err\);\r?\n    return \[\];\r?\n  \}/g,
  `        estado,\n      ]);\n\n      dbRows.push({\n        numero_pedido: id_referencia_pedido,\n        data: ymd,\n        conta: account.nome,\n        conta_id: account.id,\n        sku: sku,\n        quantidade: qtd,\n        valor_total: valor_total_item,\n        comissao: Math.abs(fee_total_neg),\n        frete: Math.abs(custo_calc),\n        marketplace: 'Mercado Livre',\n        origem: venda.seller?.nickname || account.nome || '',\n        payload: { status: venda.status, date_closed: venda.date_closed }\n      });\n    }\n\n    return { linhasSheets, dbRows };\n  } catch (err) {\n    console.error('[processarVendaMLSingle] erro:', err);\n    return { linhasSheets: [], dbRows: [] };\n  }`
);

// 5. Update calling loop
content = content.replace(
  /      const loteLinhas: any\[\]\[\] = \[\];\r?\n      const BATCH = 10;/,
  `      const loteLinhas: any[][] = [];\n      const loteDbRows: any[] = [];\n      const BATCH = 10;`
);

content = content.replace(
  /        for \(const linhas of batchResults\) \{\r?\n          if \(linhas\.length > 0\) loteLinhas\.push\(\.\.\.linhas\);\r?\n        \}/,
  `        for (const res of batchResults) {\n          if (res.linhasSheets?.length > 0) loteLinhas.push(...res.linhasSheets);\n          if (res.dbRows?.length > 0) loteDbRows.push(...res.dbRows);\n        }`
);

content = content.replace(
  /      if \(loteLinhas\.length > 0\) \{\r?\n(.*?)await invokeSheets\(sheetId, (.*?)!A:S(.*?), loteLinhas, 'dedup_write', 2\);\r?\n      \}/s,
  `      if (loteLinhas.length > 0) {\n$1await invokeSheets(sheetId, $2!A:S$3, loteLinhas, 'dedup_write', 2);\n      }\n\n      if (loteDbRows.length > 0) {\n        try {\n          const resDb = await supabaseFetch('/vendas_db?on_conflict=numero_pedido,sku', {\n            method: 'POST',\n            headers: { 'Prefer': 'resolution=merge-duplicates' },\n            body: JSON.stringify(loteDbRows)\n          });\n          if (!resDb.ok) {\n             console.error('[SYNC VENDAS DB ML] Upsert failed:', await resDb.text());\n          } else {\n             console.log('[SYNC DB] Upsert em vendas_db OK (' + loteDbRows.length + ' linhas)');\n          }\n        } catch (e) {\n          console.error('[SYNC VENDAS DB ML] Erro fatal no fetch do banco:', e);\n        }\n      }`
);

fs.writeFileSync('supabase/functions/mercado-livre/index.ts', content, 'utf8');
console.log('SUCCESS!');
