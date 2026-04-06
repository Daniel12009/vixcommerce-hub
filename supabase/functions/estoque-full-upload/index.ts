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

    // ML Full export structure (from screenshot):
    // A(0)=Código ML, B(1)=Código universal, C(2)=SKU, D(3)=# Anúncio, 
    // E(4)=Agrupador de variações, F(5)=Produto, G(6)=Tamanho,
    // H(7)=Tipo de produto, I(8)=Status do anúncio, J(9)=Oferece Full,
    // K(10)=Vendas últimos 30 dias, L(11)=Unidades que afetam métrica,
    // M(12)=Entrada pendente, N(13)=Em transferência, O(14)=Devolvidas pelo comprador,
    // P(15)=Aptas para venda, ... U(20)=Unidades que ocupan espacio en Full
    // Header is on rows 10-11 (merged), data starts row 13 (index 12)

    // Use fixed mapping based on known ML export structure
    // SKU = column C (index 2)
    const COL = {
      sku: 2,         // C
      tamanho: 6,     // G
      status: 8,      // I - Status do anúncio
      entradaPend: 12, // M - Entrada pendente
      transferencia: 13, // N - Em transferência
      devolucao: 14,  // O - Devolvidas pelo comprador
      aptas: 15,      // P - Aptas para venda
      espacioFull: 20, // U - Unidades que ocupan espacio en Full
    };

    // Find data start: skip first 11 rows (header area), then skip empty rows
    let dataStartIdx = 12; // row 13 = index 12
    // Also try to detect by looking for first row with content in SKU column
    for (let i = 10; i < Math.min(rows.length, 20); i++) {
      const row = rows[i];
      if (!row) continue;
      const cellC = row[COL.sku] != null ? String(row[COL.sku]).trim().toLowerCase() : '';
      // Skip header-like rows
      if (cellC === 'sku' || cellC === '' || cellC.includes('código')) continue;
      // Found first data row
      dataStartIdx = i;
      break;
    }

    // Log for debug
    console.log(`[estoque-full-upload] dataStartIdx=${dataStartIdx}`);
    console.log(`[estoque-full-upload] Sample row ${dataStartIdx}:`, JSON.stringify(rows[dataStartIdx]?.slice(0, 10)));
    console.log(`[estoque-full-upload] Row 10 (header?):`, JSON.stringify(rows[9]?.slice(0, 10)));
    console.log(`[estoque-full-upload] Row 11 (header?):`, JSON.stringify(rows[10]?.slice(0, 10)));

    const dadosNovos: any[][] = [];

    for (let i = dataStartIdx; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const skuRaw = row[COL.sku] != null ? String(row[COL.sku]).trim() : '';
      if (!skuRaw || ['', 'nan', 'sku', 'none'].includes(skuRaw.toLowerCase())) continue;

      const sku = skuRaw.endsWith('.0') ? skuRaw.slice(0, -2) : skuRaw;

      const tamanho = row[COL.tamanho] != null ? String(row[COL.tamanho]).trim() : '-';
      const status = row[COL.status] != null ? String(row[COL.status]).trim() : '-';

      dadosNovos.push([
        dataHoje,
        nomeConta,
        sku,
        ['', 'nan', 'none'].includes(tamanho.toLowerCase()) ? '-' : tamanho,
        ['', 'nan', 'none'].includes(status.toLowerCase()) ? '-' : status,
        getInt(row[COL.entradaPend]),
        getInt(row[COL.transferencia]),
        getInt(row[COL.devolucao]),
        getInt(row[COL.aptas]),
        getInt(row[COL.espacioFull]),
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
