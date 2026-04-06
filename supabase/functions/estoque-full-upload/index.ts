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

    // Log das primeiras 5 linhas para debug
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      console.log(`[estoque-full-upload] Row ${i}:`, JSON.stringify(rows[i]?.slice(0, 15)));
    }

    // Encontrar a linha de cabeçalho
    const HEADER_KEYWORDS = ['sku', 'publicación', 'publicacao', 'título', 'titulo', 'stock', 'disponible', 'tamaño', 'tamanho'];
    let headerRowIdx = -1;
    let headers: string[] = [];
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const row = rows[i];
      if (!row) continue;
      const rowStrs = row.map((c: any) => String(c ?? '').trim());
      const rowLower = rowStrs.map(s => s.toLowerCase());
      // Match if at least 2 header keywords are found in this row
      const matches = HEADER_KEYWORDS.filter(kw => rowLower.some(h => h.includes(kw)));
      if (matches.length >= 2) {
        headerRowIdx = i;
        headers = rowStrs;
        break;
      }
    }

    if (headerRowIdx < 0) {
      // Fallback: tenta cada linha procurando pelo menos 1 keyword
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i];
        if (!row) continue;
        const rowStrs = row.map((c: any) => String(c ?? '').trim());
        const rowLower = rowStrs.map(s => s.toLowerCase());
        if (HEADER_KEYWORDS.some(kw => rowLower.some(h => h.includes(kw)))) {
          headerRowIdx = i;
          headers = rowStrs;
          break;
        }
      }
    }

    if (headerRowIdx < 0) {
      throw new Error(`Cabeçalho não encontrado nas 10 primeiras linhas. Primeiras linhas: ${JSON.stringify(rows.slice(0, 3).map(r => r?.slice(0, 8)))}`);
    }

    console.log(`[estoque-full-upload] Header na linha ${headerRowIdx}:`, JSON.stringify(headers));

    // Mapear colunas pelo nome
    const colSku = findCol(headers, 'sku');
    const colTamanho = findCol(headers, 'tamaño', 'tamanho', 'size');
    const colStatus = findCol(headers, 'estado de la publicación', 'status', 'estado');
    const colEntradaPendente = findCol(headers, 'entrada pendiente', 'entrada pendente', 'inbound');
    const colTransferencia = findCol(headers, 'en transferencia', 'em transferência', 'transferencia');
    const colDevolucao = findCol(headers, 'devueltas por el comprador', 'devolvidas pelo comprador', 'devolv');
    const colAptas = findCol(headers, 'aptas para la venta', 'aptas para venda', 'aptas');
    const colEspacioFull = findCol(headers, 'unidades que ocupan espacio en full', 'espacio en full', 'espaço full');

    if (colSku < 0) {
      throw new Error(`Coluna "SKU" não encontrada no cabeçalho. Colunas encontradas: ${headers.join(', ')}`);
    }

    const dadosNovos: any[][] = [];

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
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
