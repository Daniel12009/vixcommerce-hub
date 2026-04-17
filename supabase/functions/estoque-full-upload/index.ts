import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
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
  const url = `${(Deno.env.get('EXTERNAL_DB_URL') || Deno.env.get('SUPABASE_URL'))}/functions/v1/google-sheets`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${(Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))}`,
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
    const rows = utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][];

    // ML Full export - xlsx parser strips merged header rows, data starts at row 0
    // Verified from logs: Row 0 = ["NVIW23131","789...","FC-35","3460362799 | 4466816737",...]
    // Column mapping (0-indexed):
    // 0=Código ML, 1=Código universal, 2=SKU, 3=# Anúncio, 4=Agrupador,
    // 5=Produto, 6=Tamanho, 7=Tipo produto, 8=Status, 9=Oferece Full,
    // 10=Vendas 30d, 11=Afetam métrica, 12=Entrada pendente, 13=Em transferência,
    // 14+=Devolvidas, Aptas, etc.
    const COL = {
      sku: 2,
      tamanho: 6,
      status: 8,
      entradaPend: 12,
      transferencia: 13,
      devolucao: 14,
      aptas: 15,
      espacioFull: 20,
    };

    // Detect data start: find first row where column 2 looks like a SKU (not a header keyword)
    let dataStartIdx = 0;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const row = rows[i];
      if (!row) continue;
      const cell = row[COL.sku] != null ? String(row[COL.sku]).trim().toLowerCase() : '';
      // Skip empty rows and header-like rows
      if (!cell || cell === 'sku' || cell.includes('código') || cell.includes('codigo')) continue;
      dataStartIdx = i;
      break;
    }

    // Log for debug
    console.log(`[estoque-full-upload] totalRows=${rows.length}, dataStartIdx=${dataStartIdx}`);
    console.log(`[estoque-full-upload] First data row:`, JSON.stringify(rows[dataStartIdx]?.slice(0, 16)));
    if (rows.length > 1) console.log(`[estoque-full-upload] Row 1:`, JSON.stringify(rows[1]?.slice(0, 16)));

    const dadosNovos: any[][] = [];

    for (let i = dataStartIdx; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const skuRaw = row[COL.sku] != null ? String(row[COL.sku]).trim() : '';
      if (!skuRaw || ['', 'nan', 'sku', 'none'].includes(skuRaw.toLowerCase())) continue;

      const sku = skuRaw.endsWith('.0') ? skuRaw.slice(0, -2) : skuRaw;

      const tamanho = row[COL.tamanho] != null ? String(row[COL.tamanho]).trim() : '-';
      const status = row[COL.status] != null ? String(row[COL.status]).trim() : '-';

      const entradaPend = getInt(row[COL.entradaPend]);
      const transferencia = getInt(row[COL.transferencia]);
      const devolucao = getInt(row[COL.devolucao]);
      const aptas = getInt(row[COL.aptas]);
      const espacioFull = getInt(row[COL.espacioFull]);

      // Filtro: se status é N/A e TODAS as colunas numéricas são 0, pula
      const statusNorm = status.toLowerCase();
      if ((statusNorm === 'n/a' || statusNorm === 'na' || statusNorm === '-') &&
          entradaPend === 0 && transferencia === 0 && devolucao === 0 && aptas === 0 && espacioFull === 0) {
        continue;
      }

      dadosNovos.push([
        dataHoje,
        nomeConta,
        sku,
        ['', 'nan', 'none'].includes(tamanho.toLowerCase()) ? '-' : tamanho,
        ['', 'nan', 'none'].includes(status.toLowerCase()) ? '-' : status,
        entradaPend,
        transferencia,
        devolucao,
        aptas,
        espacioFull,
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
