const fs = require('fs');

let content = fs.readFileSync('supabase/functions/mercado-livre/index.ts', 'utf8');

const s1 = `async function processarVendaMLSingle(
  venda: any,
  token: string,
  account: any,
  dtIni: Date,
  dtFim: Date,
  contagemPacks: Record<string, number>,
  sellerId: string | number,
  listingTypeMap: Record<string, string> = {}
): Promise<any[][]> {
  try {
    if (venda.status === 'cancelled') return [];`;

const r1 = `async function processarVendaMLSingle(
  venda: any,
  token: string,
  account: any,
  dtIni: Date,
  dtFim: Date,
  contagemPacks: Record<string, number>,
  sellerId: string | number,
  listingTypeMap: Record<string, string> = {}
): Promise<{ linhasSheets: any[][]; dbRows: any[] }> {
  try {
    if (venda.status === 'cancelled') return { linhasSheets: [], dbRows: [] };`;

const s2 = `    let tipo_log = tipoLogInicial;
    let estado = estadoFrete;

    const linhas: any[][] = [];
    const orderItems: any[] = venda.order_items || [];

    for (const item of orderItems) {`;

const r2 = `    let tipo_log = tipoLogInicial;
    let estado = estadoFrete;

    const linhasSheets: any[][] = [];
    const dbRows: any[] = [];
    const orderItems: any[] = venda.order_items || [];

    let ymd = new Date().toISOString().slice(0, 10);
    if (venda.date_created) {
      try {
        const dt = new Date(venda.date_created.replace('Z', '+00:00'));
        dt.setHours(dt.getHours() - 3);
        ymd = dt.toISOString().slice(0, 10);
      } catch { }
    }

    for (const item of orderItems) {`;

const s3 = `      linhas.push([
        sku,
        sku,
        data_criacao,
        data_fechamento,
        id_venda_str,
        'Mercado Livre',
        ml_id,
        String(listing_type_id).toLowerCase().includes('gold_special') ? 'Clássico' : 'Premium',
        '',
        tipo_log,
        preco.toFixed(2),
        String(qtd),
        valor_total_item.toFixed(2),
        custo_calc.toFixed(2),
        '0',
        (Math.round(fee_total_neg * 100) / 100).toFixed(2),
        '',
        venda.seller?.nickname || account.nome || '',
        estado,
      ]);
    }

    return linhas;
  } catch (err) {
    console.error('[processarVendaMLSingle] erro:', err);
    return [];
  }
}`;

const r3 = `      linhasSheets.push([
        sku,
        sku,
        data_criacao,
        data_fechamento,
        id_venda_str,
        'Mercado Livre',
        ml_id,
        String(listing_type_id).toLowerCase().includes('gold_special') ? 'Clássico' : 'Premium',
        '',
        tipo_log,
        preco.toFixed(2),
        String(qtd),
        valor_total_item.toFixed(2),
        custo_calc.toFixed(2),
        '0',
        (Math.round(fee_total_neg * 100) / 100).toFixed(2),
        '',
        venda.seller?.nickname || account.nome || '',
        estado,
      ]);

      dbRows.push({
        numero_pedido: id_referencia_pedido,
        data: ymd,
        conta: account.nome,
        conta_id: account.id,
        sku: sku,
        quantidade: qtd,
        valor_total: valor_total_item,
        comissao: Math.abs(fee_total_neg),
        frete: Math.abs(custo_calc),
        marketplace: 'Mercado Livre',
        origem: venda.seller?.nickname || account.nome || '',
        payload: { status: venda.status, date_closed: venda.date_closed }
      });
    }

    return { linhasSheets, dbRows };
  } catch (err) {
    console.error('[processarVendaMLSingle] erro:', err);
    return { linhasSheets: [], dbRows: [] };
  }
}`;

const s4 = `      const loteLinhas: any[][] = [];
      const BATCH = 10;

      for (let i = 0; i < todasVendas.length; i += BATCH) {
        const batch = todasVendas.slice(i, i + BATCH);
        const batchResults = await Promise.all(
          batch.map(venda => processarVendaMLSingle(venda, token, account, dtIni, dtFim, contagemPacks, sellerId, listingTypeMap))
        );
        for (const linhas of batchResults) {
          if (linhas.length > 0) loteLinhas.push(...linhas);
        }
      }`;

const r4 = `      const loteLinhas: any[][] = [];
      const loteDbRows: any[] = [];
      const BATCH = 10;

      for (let i = 0; i < todasVendas.length; i += BATCH) {
        const batch = todasVendas.slice(i, i + BATCH);
        const batchResults = await Promise.all(
          batch.map(venda => processarVendaMLSingle(venda, token, account, dtIni, dtFim, contagemPacks, sellerId, listingTypeMap))
        );
        for (const res of batchResults) {
          if (res.linhasSheets?.length > 0) loteLinhas.push(...res.linhasSheets);
          if (res.dbRows?.length > 0) loteDbRows.push(...res.dbRows);
        }
      }`;

const s5 = `      if (loteLinhas.length > 0) {
        // Dedup: VendasML has date created at column 2 (index 2: "Data de Criação")
        // But date could also be used at column 11 if there is a 'Data Ref' instead?
        // Let's use date created (index 2). Wait, earlier we saw VendasML has Data Ref at col 11 (Actually col 2 is Data Criação, VendasML is what?).
        // For vendas, the data processed is 'dateFrom', which might be passed as a ref.
        // Actually earlier it was appending. Let's use column 2 (Data de Criação) for VendasML which has \`'DD/MM/YYYY\`.
        await invokeSheets(sheetId, \`\${sheetTab}!A:S\`, loteLinhas, 'dedup_write', 2);
      }`;

const r5 = `      if (loteLinhas.length > 0) {
        // Dedup: VendasML has date created at column 2 (index 2: "Data de Criação")
        await invokeSheets(sheetId, \`\${sheetTab}!A:S\`, loteLinhas, 'dedup_write', 2);
      }

      if (loteDbRows.length > 0) {
        try {
          const resDb = await supabaseFetch('/vendas_db?on_conflict=numero_pedido,sku', {
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify(loteDbRows)
          });
          if (!resDb.ok) {
             console.error('[SYNC VENDAS DB ML] Upsert failed:', await resDb.text());
          } else {
             console.log(\`[SYNC DB] Upsert em vendas_db OK (\${loteDbRows.length} linhas)\`);
          }
        } catch (e) {
          console.error('[SYNC VENDAS DB ML] Erro fatal no fetch do banco:', e);
        }
      }`;

function normalizeCRLF(str) {
  return str.replace(/\r\n/g, '\n');
}

let modifiedStr = normalizeCRLF(content);

const replaced = [s1, s2, s3, s4, s5].map((s, i) => {
  const normS = normalizeCRLF(s);
  const normR = normalizeCRLF([r1, r2, r3, r4, r5][i]);
  if (!modifiedStr.includes(normS)) {
    console.error(\`Failed to find string \${i + 1}\`);
    return false;
  }
  modifiedStr = modifiedStr.replace(normS, normR);
  return true;
});

if (replaced.every(Boolean)) {
  fs.writeFileSync('supabase/functions/mercado-livre/index.ts', modifiedStr, 'utf8');
  console.log('SUCCESS');
} else {
  process.exit(1);
}
