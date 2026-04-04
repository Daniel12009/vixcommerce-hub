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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Recebe multipart/form-data com o arquivo + conta
    const formData = await req.formData();
    const contaKey = String(formData.get('conta') || '').trim().toLowerCase();
    const file = formData.get('file') as File | null;

    if (!contaKey) throw new Error('Parâmetro "conta" obrigatório.');
    if (!file) throw new Error('Arquivo não enviado.');
    if (!file.name.endsWith('.xlsx')) throw new Error('Somente arquivos .xlsx são aceitos.');

    const nomeConta = formatarNomeConta(contaKey);
    const dataHoje = new Date().toLocaleDateString('pt-BR'); // DD/MM/YYYY

    // Ler o arquivo Excel no Deno usando a lib xlsx (CDN)
    const { read, utils } = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
    const buffer = await file.arrayBuffer();
    const wb = read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // header: 1 = retorna como array de arrays (sem nomes de colunas)
    const rows: any[][] = utils.sheet_to_json(ws, { header: 1, defval: null });

    const dadosNovos: any[][] = [];

    for (let i = 3; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const skuRaw = row[3] != null ? String(row[3]).trim() : '';
      if (!skuRaw || ['', 'nan', 'sku', 'none'].includes(skuRaw.toLowerCase())) continue;

      const sku = skuRaw.endsWith('.0') ? skuRaw.slice(0, -2) : skuRaw;

      const tamanho = row[7] != null ? String(row[7]).trim() : '-';
      const status = row[9] != null ? String(row[9]).trim() : '-';

      dadosNovos.push([
        dataHoje,
        nomeConta,
        sku,
        ['', 'nan', 'none'].includes(tamanho.toLowerCase()) ? '-' : tamanho,
        ['', 'nan', 'none'].includes(status.toLowerCase()) ? '-' : status,
        getInt(row[13]), // Entrada pendente
        getInt(row[14]), // Em transferência
        getInt(row[15]), // Devolvidas pelo comprador
        getInt(row[16]), // Aptas para venda
        getInt(row[21]), // Unidades que ocupan espacio en Full
      ]);
    }

    if (dadosNovos.length === 0) {
      return new Response(JSON.stringify({
        sucesso: false,
        mensagem: 'Nenhum dado encontrado a partir da 4ª linha. Verifique o arquivo.',
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

    // Remover cabeçalho e linhas da conta atual (preserva outras contas)
    const linhasAnteriores = dadosExistentes
      .slice(1) // pula cabeçalho
      .filter(row => row[1] !== nomeConta);

    // Resultado final: cabeçalho + outras contas + novas linhas
    const dadosFinais = [cabecalho, ...linhasAnteriores, ...dadosNovos];

    // Sobrescrever a aba inteira
    await callGoogleSheets('write', {
      spreadsheetId: SHEET_ID,
      range: `${NOME_ABA}!A1`,
      values: dadosFinais,
    });

    return new Response(JSON.stringify({
      sucesso: true,
      mensagem: `✅ ${dadosNovos.length} linhas de ${nomeConta} salvas na aba ${NOME_ABA}.`,
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
