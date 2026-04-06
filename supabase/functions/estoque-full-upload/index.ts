import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SHEET_ID = '15a5rPb1TeMJCqcm4XzcpixCvtvi7RUFalMQxtNVkIH8';
const NOME_ABA = 'Full_Estoque';

const MAPA_CONTAS: Record<string, string> = {
  'viaflix': '(VIAFLIX)',
  'gs': '(GS)',
  'decarion': '(MONACO)',
};

function formatarNomeConta(key: string): string {
  return MAPA_CONTAS[key.toLowerCase()] ?? `(${key.toUpperCase()})`;
}

function getInt(val: any): number {
  if (val === null || val === undefined) return 0;
  const s = String(val).trim();
  if (['-', '', 'nan', 'none'].includes(s.toLowerCase())) return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.round(n);
}

async function callGoogleSheets(action: string, body: object) {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-sheets`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({ action, ...body }),
  });
  if (!res.ok) throw new Error(`google-sheets error: ${await res.text()}`);
  return res.json();
}

// Encontra o índice de uma coluna pelo nome (case-insensitive, parcial)
function findCol(headers: string[], ...keywords: string[]): number {
  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    const idx = headers.findIndex(h => h.toLowerCase().includes(kwLower));
    if (idx >= 0) return idx;
  }
  return -1;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const formData = await req.formData();
    const contaKey = String(formData.get('conta') || '').trim().toLowerCase();
    const file = formData.get('file') as File | null;

    if (!contaKey) throw new Error('Parâmetro "conta" obrigatório.');
    if (!file) throw new Error('Arquivo não enviado.');
    if (!file.name.endsWith('.xlsx')) throw new Error('Somente arquivos .xlsx são aceitos.');

    const nomeConta = formatarNomeConta(contaKey);
    const dataHoje = new Date().toLocaleDateString('pt-BR');

    const { read, utils } = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
    const buffer = await file.arrayBuffer();
    const wb = read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = utils.sheet_to_json(ws, { header: 1, defval: null });

    // ML Full export: cabeçalho nas linhas 10-11 (merged), dados a partir da linha 13 (index 12)
    // Colunas fixas do export ML:
    // A=Código ML, B=Código universal, C=SKU, D=# Anúncio, E=Agrupador, F=Produto, G=Tamanho,
    // H=Tipo de produto, I=Status do anúncio, J=Oferece Full, K=Vendas últimos 30 dias,
    // L=Unidades que afetam métrica, M=Entrada pendente, N=Em transferência, ...
    
    // Buscar header row dinamicamente (procura nas primeiras 15 linhas)
    const HEADER_KEYWORDS = ['sku', 'produto', 'tamanho', 'status do anúncio', 'código ml', 'entrada pendente'];
    let headerRowIdx = -1;
    let headers: string[] = [];
    
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const row = rows[i];
      if (!row) continue;
      const rowStrs = row.map((c: any) => String(c ?? '').trim());
      const rowLower = rowStrs.map(s => s.toLowerCase());
      const matches = HEADER_KEYWORDS.filter(kw => rowLower.some(h => h.includes(kw)));
      if (matches.length >= 2) {
        headerRowIdx = i;
        headers = rowStrs;
        break;
      }
    }

    // Se não achou por keywords, usa fallback fixo: cabeçalho na linha 10 (index 9)
    if (headerRowIdx < 0) {
      // Tenta linhas 9, 10, 11 como possíveis cabeçalhos
      for (const tryIdx of [9, 10, 11]) {
        if (tryIdx < rows.length && rows[tryIdx]) {
          const rowStrs = rows[tryIdx].map((c: any) => String(c ?? '').trim());
          if (rowStrs.some(h => h.toLowerCase().includes('sku') || h.toLowerCase().includes('produto'))) {
            headerRowIdx = tryIdx;
            headers = rowStrs;
            break;
          }
        }
      }
    }

    // Log para debug
    console.log(`[estoque-full-upload] headerRowIdx=${headerRowIdx}, headers=${JSON.stringify(headers?.slice(0, 15))}`);
    for (let i = 0; i < Math.min(rows.length, 3); i++) {
      console.log(`[estoque-full-upload] Row ${i}:`, JSON.stringify(rows[i]?.slice(0, 8)));
    }

    // Mapear colunas pelo nome do cabeçalho
    let colSku = findCol(headers, 'sku');
    const colTamanho = findCol(headers, 'tamaño', 'tamanho');
    const colStatus = findCol(headers, 'status do anúncio', 'status', 'estado');
    const colEntradaPendente = findCol(headers, 'entrada pendente', 'entrada pendiente');
    const colTransferencia = findCol(headers, 'em transferência', 'en transferencia', 'transferencia', 'transferência');
    const colDevolucao = findCol(headers, 'devolvidas pelo comprador', 'devueltas', 'devolv');
    const colAptas = findCol(headers, 'aptas para venda', 'aptas para la venta', 'aptas');
    const colEspacioFull = findCol(headers, 'unidades que ocupan espacio en full', 'espacio en full', 'espaço full', 'ocupan espacio');

    // Fallback: se não achou cabeçalho nem SKU, usa índices fixos do export padrão ML
    if (headerRowIdx < 0 || colSku < 0) {
      console.log('[estoque-full-upload] Usando mapeamento fixo do export ML');
      headerRowIdx = 11; // dados começam na linha 13 (index 12), header é 12 (index 11)
      colSku = 3; // Coluna D = SKU
    }

    // Pular linhas vazias entre header e dados (ex: linha 12 pode ser vazia)
    let dataStartIdx = headerRowIdx + 1;
    while (dataStartIdx < rows.length) {
      const row = rows[dataStartIdx];
      if (row && row.some((c: any) => c != null && String(c).trim() !== '')) break;
      dataStartIdx++;
    }

    console.log(`[estoque-full-upload] colSku=${colSku}, dataStart=${dataStartIdx}`);

    const dadosNovos: any[][] = [];

    for (let i = dataStartIdx; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const skuRaw = row[colSku] != null ? String(row[colSku]).trim() : '';
      if (!skuRaw || ['', 'nan', 'sku', 'none'].includes(skuRaw.toLowerCase())) continue;

      const sku = skuRaw.endsWith('.0') ? skuRaw.slice(0, -2) : skuRaw;

      const tamanho = colTamanho >= 0 && row[colTamanho] != null ? String(row[colTamanho]).trim() : '-';
      const status = colStatus >= 0 && row[colStatus] != null ? String(row[colStatus]).trim() : '-';

      dadosNovos.push([
        dataHoje,
        nomeConta,
        sku,
        ['', 'nan', 'none'].includes(tamanho.toLowerCase()) ? '-' : tamanho,
        ['', 'nan', 'none'].includes(status.toLowerCase()) ? '-' : status,
        colEntradaPendente >= 0 ? getInt(row[colEntradaPendente]) : 0,
        colTransferencia >= 0 ? getInt(row[colTransferencia]) : 0,
        colDevolucao >= 0 ? getInt(row[colDevolucao]) : 0,
        colAptas >= 0 ? getInt(row[colAptas]) : 0,
        colEspacioFull >= 0 ? getInt(row[colEspacioFull]) : 0,
      ]);
    }

    if (dadosNovos.length === 0) {
      return new Response(JSON.stringify({
        sucesso: false,
        mensagem: 'Nenhum dado encontrado. Verifique se o arquivo tem a coluna SKU.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Ler dados existentes da aba
    let dadosExistentes: any[][] = [];
    try {
      const readResult = await callGoogleSheets('read', {
        spreadsheetId: SHEET_ID,
        range: `${NOME_ABA}!A:J`,
      });
      dadosExistentes = readResult.values || [];
    } catch {
      dadosExistentes = [];
    }

    const cabecalho = [
      'Data', 'Conta', 'SKU', 'Tamanho', 'Status do anúncio',
      'Entrada pendente', 'Em transferência', 'Devolvidas pelo comprador',
      'Aptas para venda', 'Unidades que ocupan espacio en Full'
    ];

    const linhasAnteriores = dadosExistentes
      .slice(1)
      .filter(row => row[1] !== nomeConta);

    const dadosFinais = [cabecalho, ...linhasAnteriores, ...dadosNovos];

    await callGoogleSheets('write', {
      spreadsheetId: SHEET_ID,
      range: `${NOME_ABA}!A1`,
      values: dadosFinais,
    });

    return new Response(JSON.stringify({
      sucesso: true,
      mensagem: `✅ ${dadosNovos.length} SKUs de ${nomeConta} salvos na aba ${NOME_ABA}.`,
      linhas: dadosNovos.length,
      conta: nomeConta,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    console.error('[estoque-full-upload]', e.message);
    return new Response(JSON.stringify({
      sucesso: false,
      mensagem: `❌ Erro: ${e.message}`,
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
