const fs = require('fs');

let content = fs.readFileSync('supabase/functions/mercado-livre/index.ts', 'utf8');

// 1. Initialize loteAdsDbRows
content = content.replace(
  /const linhas_resumo: any\[\]\[\] = \[\];/,
  `const linhas_resumo: any[][] = [];
      const loteAdsDbRows: any[] = [];`
);

// 2. Collect metrics per day
// We need to accumulate revenue, clicks, etc. per day inside the while(true) loop or just after it.
// Current code has total_investido_dia. Let's add more accumulators.

content = content.replace(
  /let total_investido_dia = 0;\r?\n        let offset = 0;/,
  `let total_investido_dia = 0;
        let total_receita_dia = 0;
        let total_vendas_dia = 0;
        let total_cliques_dia = 0;
        let offset = 0;`
);

content = content.replace(
  /total_investido_dia \+= custo;/,
  `total_investido_dia += custo;
            total_receita_dia += receita;
            total_vendas_dia += vendas_qtd;
            total_cliques_dia += (metrics.clicks || 0);`
);

// 3. Push to loteAdsDbRows after the while loop (per day)
content = content.replace(
  /if \(total_investido_dia > 0\) \{\r?\n          linhas_resumo\.push\(\[data_ref_br, nome_conta_upper, `R\$ \$\{toStringDecimal\(total_investido_dia\)\}`\]\);\r?\n        \}/,
  `if (total_investido_dia > 0) {
          linhas_resumo.push([data_ref_br, nome_conta_upper, \`R$ \${toStringDecimal(total_investido_dia)}\`]);
          
          loteAdsDbRows.push({
            data_ref: dia_atual,
            conta: account.nome,
            conta_id: account.id,
            investimento: total_investido_dia,
            receita: total_receita_dia,
            vendas: total_vendas_dia,
            cliques: total_cliques_dia,
            roas: total_investido_dia > 0 ? (total_receita_dia / total_investido_dia) : 0
          });
        }`
);

// 4. Upsert at the end
content = content.replace(
  /await invokeSheets\(sheetId, `\$\{nome_aba_total\}!A:C`, linhas_resumo, 'dedup_write', 0, 1\);\r?\n      \}/,
  `await invokeSheets(sheetId, \`\${nome_aba_total}!A:C\`, linhas_resumo, 'dedup_write', 0, 1);
      }

      if (loteAdsDbRows.length > 0) {
        try {
          const resDb = await supabaseFetch('/ads_db?on_conflict=data_ref,conta_id', {
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify(loteAdsDbRows)
          });
          if (!resDb.ok) {
             console.error('[SYNC ADS DB] Upsert failed:', await resDb.text());
          } else {
             console.log('[SYNC DB] Upsert em ads_db OK (' + loteAdsDbRows.length + ' dias)');
          }
        } catch (e) {
          console.error('[SYNC ADS DB] Erro fatal no fetch do banco:', e);
        }
      }`
);

fs.writeFileSync('supabase/functions/mercado-livre/index.ts', content, 'utf8');
console.log('SUCCESS');
