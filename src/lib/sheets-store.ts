// Sheets configuration store with localStorage persistence

export type ModuloDestino = 'estoque' | 'estoque-full' | 'estoque-tiny' | 'financeiro' | 'vendas' | 'vendas-7d' | 'performance' | 'ads' | 'devolucao' | 'marketplace-dia' | 'calculadora' | 'compras' | 'atividades';

export interface SheetConfig {
  id: string;
  url: string;
  nome: string;
  spreadsheetId: string;
  abaNome: string;
  moduloDestino: ModuloDestino;
  mapeamento: Record<string, string>; // fieldName -> column header name
  valoresFixos?: Record<string, string>; // fieldName -> fixed value (e.g. conta from a different row)
  linhaInicial: number; // 1-indexed row where headers are (data starts next row)
  ultimaSync?: string;
}

// Fields required per module
export const CAMPOS_POR_MODULO: Record<ModuloDestino, { key: string; label: string; obrigatorio?: boolean }[]> = {
  atividades: [
    { key: 'sku', label: 'SKU' },
    { key: 'conta', label: 'Conta' },
    { key: 'id', label: 'ID (Shopee)' },
    { key: 'observacao', label: 'Observação' },
    { key: 'tarefa', label: 'Tarefa Principal' },
    { key: 'prioridade', label: 'Prioridade' },
    { key: 'data_verificacao', label: 'Data da Verificação' },
    { key: 'acao', label: 'Ação' },
    { key: 'responsavel', label: 'Responsável' },
    { key: 'data_inicio', label: 'Data Início' },
    { key: 'data_finalizacao', label: 'Data Finalização' },
    { key: 'prazo', label: 'Prazo' },
    { key: 'status', label: 'Status' },
  ],
  estoque: [
    { key: 'skuPrincipal', label: 'SKU Principal', obrigatorio: true },
    { key: 'nome', label: 'Nome do Produto', obrigatorio: true },
    { key: 'conta', label: 'Conta / Loja' },
    { key: 'estoqueAtual', label: 'Estoque Atual', obrigatorio: true },
    { key: 'estoqueMinimo', label: 'Estoque Mínimo' },
    { key: 'vmd', label: 'VMD (Vendas/Dia)' },
    { key: 'leadTime', label: 'Lead Time (dias)' },
    { key: 'emTransito', label: 'Em Trânsito' },
    { key: 'emTransferencia', label: 'Em Transferência' },
  ],
  financeiro: [
    { key: 'skuPrincipal', label: 'SKU Principal', obrigatorio: true },
    { key: 'nome', label: 'Nome do Produto', obrigatorio: true },
    { key: 'receita', label: 'Receita', obrigatorio: true },
    { key: 'impostos', label: 'Impostos' },
    { key: 'taxas', label: 'Taxas Marketplace' },
    { key: 'custo', label: 'Custo' },
    { key: 'frete', label: 'Frete' },
    { key: 'unidadesVendidas', label: 'Unidades Vendidas' },
  ],
  vendas: [
    { key: 'numeroPedido', label: 'Nº Pedido (codigoPedido)', obrigatorio: true },
    { key: 'data', label: 'Data (dataCriacao)', obrigatorio: true },
    { key: 'sku', label: 'SKU PRINCIPAL', obrigatorio: true },
    { key: 'skuProduto', label: 'SkuProduto' },
    { key: 'produto', label: 'Produto' },
    { key: 'pedidoOrigem', label: 'pedidoOrigem (Marketplace)' },
    { key: 'conta', label: 'Conta (AG)' },
    { key: 'contaMae', label: 'CONTA MÃE (AI)' },
    { key: 'origem', label: 'Origem (Plataforma|Conta)' },
    { key: 'comprador', label: 'Comprador' },
    { key: 'quantidade', label: 'quantidade' },
    { key: 'precoUnitario', label: 'precoUnitario' },
    { key: 'valorTotal', label: 'ValorPedido' },
    { key: 'statusPedido', label: 'Status' },
    { key: 'custoEnvio', label: 'CustoEnvioSeller (AC)' },
    { key: 'impostos', label: 'TarifaGatwayPagamento (AD)' },
    { key: 'comissao', label: 'TarifaMarketplace (AE)' },
    { key: 'ads', label: 'ADS (AF)' },
    { key: 'cmv', label: 'cmv (AN)' },
    { key: 'liquido', label: 'Líquido Custo Real (AK)' },
    { key: 'margem', label: 'Margem sobre Custo Real (AJ)' },
    { key: 'devolucao', label: 'Devolução' },
    { key: 'frete', label: 'Forma de entrega' },
  ],
  performance: [
    { key: 'plataforma', label: 'Plataforma', obrigatorio: true },
    { key: 'idAnuncio', label: 'ID Anúncio', obrigatorio: true },
    { key: 'sku', label: 'SKU' },
    { key: 'titulo', label: 'Título' },
    { key: 'preco', label: 'Preço' },
    { key: 'visitas', label: 'Visitas (Ontem)' },
    { key: 'vendas', label: 'Vendas (Ontem)' },
    { key: 'canceladas', label: 'Canceladas' },
    { key: 'conversao', label: 'Conversão %' },
    { key: 'link', label: 'Link' },
    { key: 'conta', label: 'Conta' },
    { key: 'dataRef', label: 'Data Ref' },
  ],
  ads: [
    { key: 'tipo', label: 'Tipo' },
    { key: 'dataRef', label: 'Data Ref' },
    { key: 'conta', label: 'Conta', obrigatorio: true },
    { key: 'campanha', label: 'Campanha' },
    { key: 'idCampanha', label: 'ID Campanha' },
    { key: 'idAnuncio', label: 'ID Anúncio', obrigatorio: true },
    { key: 'titulo', label: 'Título' },
    { key: 'investimento', label: 'Investimento', obrigatorio: true },
    { key: 'receita', label: 'Receita' },
    { key: 'vendasQtd', label: 'Vendas (Qtd)' },
    { key: 'acos', label: 'ACOS' },
    { key: 'roas', label: 'ROAS' },
    { key: 'cliques', label: 'Cliques' },
    { key: 'impressoes', label: 'Impressões' },
    { key: 'ultAtualizacao', label: 'Ult. Atualização' },
  ],
  'estoque-full': [
    { key: 'data', label: 'Data' },
    { key: 'conta', label: 'Conta', obrigatorio: true },
    { key: 'sku', label: 'SKU', obrigatorio: true },
    { key: 'tamanho', label: 'Tamanho' },
    { key: 'statusAnuncio', label: 'Status do anúncio' },
    { key: 'entradaPendente', label: 'Entrada pendente' },
    { key: 'emTransferencia', label: 'Em transferência' },
    { key: 'devolvidasComprador', label: 'Devolvidas pelo comprador' },
    { key: 'aptasParaVenda', label: 'Aptas para venda', obrigatorio: true },
    { key: 'unidadesOcupamEspaco', label: 'Unidades que ocupam espaço em Full' },
  ],
  'estoque-tiny': [
    { key: 'sku', label: 'SKU', obrigatorio: true },
    { key: 'quantidade', label: 'Quantidade (UND)', obrigatorio: true },
  ],
  devolucao: [
    { key: 'dataPlanilha', label: 'DATA DA PLANILHA' },
    { key: 'plataforma', label: 'PLATAFORMA', obrigatorio: true },
    { key: 'dataAprovacao', label: 'data Aprovação' },
    { key: 'valorReembolso', label: 'Valor do Reembolso', obrigatorio: true },
    { key: 'pedido', label: 'PEDIDO', obrigatorio: true },
    { key: 'anuncio', label: 'ANÚNCIO' },
    { key: 'skuProduto', label: 'SKU PRODUTO' },
    { key: 'statusDevolucao', label: 'STATUS DA DEVOLUÇÃO' },
    { key: 'acaoAposDevolucao', label: 'AÇÃO APÓS DEVOLUÇÃO' },
    { key: 'devolucaoGeradaPor', label: 'DEVOLUÇÃO GERADA POR' },
    { key: 'rastreioCorreios', label: 'RASTREIO CORREIOS' },
    { key: 'motivo', label: 'MOTIVO' },
    { key: 'detalhesMotivo', label: 'DETALHES DO MOTIVO' },
    { key: 'novoMotivo', label: 'NOVO MOTIVO' },
    { key: 'detalhe', label: 'DETALHE' },
    { key: 'setor', label: 'SETOR' },
    { key: 'custoDevolucao', label: 'CUSTO DEVOLUÇÃO' },
    { key: 'comissaoNaoDevolvida', label: 'COMISSÃO NÃO DEVOLVIDA' },
    { key: 'custo', label: 'CUSTO' },
    { key: 'quantidade', label: 'QTDE' },
    { key: 'situacaoMercadoria', label: 'SITUAÇÃO DA MERCADORIA' },
    { key: 'totalCustoMercadoria', label: 'TOTAL CUSTO MERCADORIA' },
    { key: 'formaReembolso', label: 'FORMA DE REEMBOLSO' },
    { key: 'dataReembolso', label: 'DATA REEMBOLSO' },
    { key: 'depositoDevolucao', label: 'DEPÓSITO DA DEVOLUÇÃO' },
    { key: 'notaFiscalDevolucao', label: 'NOTA FISCAL DEVOLUÇÃO' },
    { key: 'colaborador', label: 'COLABORADOR' },
    { key: 'retornoDevolucao', label: 'RETORNO DA DEVOLUÇÃO' },
  ],
  'marketplace-dia': [
    { key: 'data', label: 'DATA', obrigatorio: true },
    { key: 'numeroPedidos', label: 'Número de pedidos no dia' },
    { key: 'ticketMedio', label: 'Ticket médio' },
    { key: 'faturamentoBruto', label: 'Faturamento Bruto', obrigatorio: true },
    { key: 'ads', label: 'Ads' },
    { key: 'comissao', label: 'Comissão' },
    { key: 'frete', label: 'Frete' },
    { key: 'embalagem', label: 'Embalagem' },
    { key: 'impostos', label: 'Impostos' },
    { key: 'cmv', label: 'CMV' },
    { key: 'custoReal', label: 'Custo real' },
    { key: 'lucroLiquidoDia', label: 'Lucro Líquido do dia', obrigatorio: true },
    { key: 'origem', label: 'Origem', obrigatorio: true },
    { key: 'pctCmv', label: '%CMV' },
    { key: 'pctAds', label: '% ADS' },
    { key: 'pctMc', label: '%MC' },
    { key: 'roas', label: 'ROAS' },
  ],
  calculadora: [
    { key: 'sku', label: 'SKU', obrigatorio: true },
    { key: 'cmv', label: 'CMV', obrigatorio: true },
  ],
  compras: [
    { key: 'sku', label: 'SKU', obrigatorio: true },
    { key: 'categoria', label: 'Categoria' },
    { key: 'custoProduto', label: 'custo do produto' },
    { key: 'margemAtual', label: 'Margem\nOut', obrigatorio: true },
    { key: 'curvaABC', label: 'ABC' },
    { key: 'mediaVendaDiaria', label: 'media dia compra Atual' },
    { key: 'onHand', label: 'OnHand' },
    { key: 'diasParaRuptura', label: 'quantos dias para dar merda' },
    { key: 'pedidoSugerido', label: 'Pedido Final' },
    { key: 'lucroPorCBM', label: 'Lucratividade por CBM' },
    { key: 'cbmTotal', label: 'CBM TOTAL' },
    { key: 'custoTotalPedido', label: 'CUSTO TOTAL PEDIDO FINAL' },
    { key: 'statusProjecao', label: 'vs proj 04/12' },
    { key: 'janSOP', label: 'Jan_S&OP' },
    { key: 'fevSOP', label: 'Fev_S&OP' },
    { key: 'marSOP', label: 'Mar_S&OP' },
    { key: 'abrSOP', label: 'Abr_S&OP' },
    { key: 'vendasHistoricoGeral', label: 'Vendas 2024' },
    { key: 'margemDez24', label: 'margem dez 2024' },
    { key: 'margemJan25', label: 'Margem Jan' },
    { key: 'margemFev25', label: 'Margem Fev' },
  ]
};

const STORAGE_KEY = 'vix_sheet_configs';

/** Sync load from localStorage (used for initial render) */
export function loadSheetConfigs(): SheetConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Sync save to localStorage */
export function saveSheetConfigs(configs: SheetConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
}

/** Async: save configs to Supabase (cross-browser) + localStorage */
export async function saveSheetConfigsToCloud(configs: SheetConfig[]) {
  const { saveToCloud } = await import('./persistence');
  await saveToCloud('sheet_configs', configs);
}

/** Async: load configs from Supabase first, fallback localStorage */
export async function loadSheetConfigsFromCloud(): Promise<SheetConfig[]> {
  const { loadFromCloud } = await import('./persistence');
  const result = await loadFromCloud<SheetConfig[]>('sheet_configs');
  return result || loadSheetConfigs();
}

export function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// Parse imported sheet rows using column mapping
export function parseSheetRows(
  headers: string[],
  rows: string[][],
  mapeamento: Record<string, string>
): Record<string, string>[] {
  const headerIndexMap: Record<string, number> = {};
  headers.forEach((h, i) => { headerIndexMap[h.trim()] = i; });

  return rows.map(row => {
    const obj: Record<string, string> = {};
    for (const [field, colHeader] of Object.entries(mapeamento)) {
      const idx = headerIndexMap[colHeader];
      if (idx !== undefined) {
        obj[field] = row[idx] || '';
      }
    }
    return obj;
  });
}

// Parse with fixed values merged into each row
export function parseSheetRowsWithFixos(
  headers: string[],
  rows: string[][],
  mapeamento: Record<string, string>,
  valoresFixos?: Record<string, string>
): Record<string, string>[] {
  const parsed = parseSheetRows(headers, rows, mapeamento);
  if (valoresFixos && Object.keys(valoresFixos).length > 0) {
    return parsed.map(row => ({ ...valoresFixos, ...row }));
  }
  return parsed;
}

// Default devolução config (seeded if not present)
const DEVOLUCAO_DEFAULT: SheetConfig = {
  id: 'devolucao-default',
  url: 'https://docs.google.com/spreadsheets/d/10hZH2Nmc926zUHsJa5MHFYy3NJb40DgjNXyGEFByHoQ/edit',
  nome: 'Devoluções',
  spreadsheetId: '10hZH2Nmc926zUHsJa5MHFYy3NJb40DgjNXyGEFByHoQ',
  abaNome: 'TODOS',
  moduloDestino: 'devolucao',
  linhaInicial: 1,
  mapeamento: {
    dataPlanilha: 'DATA DA PLANILHA',
    plataforma: 'PLATAFORMA',
    dataAprovacao: 'data Aprovação',
    valorReembolso: 'Valor do Reembolso',
    pedido: 'PEDIDO',
    anuncio: 'ANÚNCIO',
    skuProduto: 'SKU PRODUTO',
    statusDevolucao: 'STATUS DA DEVOLUÇÃO',
    acaoAposDevolucao: 'AÇÃO APÓS DEVOLUÇÃO (SE NECESSÁRIO)',
    devolucaoGeradaPor: 'DEVOLUÇÃO GERADA POR (PLATAFORMA OU MELHOR ENVIO)',
    rastreioCorreios: 'RASTREIO CORREIOS',
    motivo: 'MOTIVO',
    detalhesMotivo: 'DETALHES DO MOTIVO',
    novoMotivo: 'NOVO MOTIVO',
    detalhe: 'DETALHE',
    setor: 'SETOR',
    custoDevolucao: 'CUSTO DEVOLUÇÃO',
    comissaoNaoDevolvida: 'COMISSÃO NÃO DEVOLVIDA',
    custo: 'CUSTO',
    quantidade: 'QTDE',
    situacaoMercadoria: 'SITUAÇÃO DA MERCADORIA',
    totalCustoMercadoria: 'TOTAL CUSTO MERCADORIA',
    formaReembolso: 'FORMA DE REEMBOLSO',
    dataReembolso: 'DATA REEMBOLSO',
    depositoDevolucao: 'DEPÓSITO DA DEVOLUÇÃO',
    notaFiscalDevolucao: 'NOTA FISCAL DEVOLUÇÃO',
    colaborador: 'COLABORADOR',
    retornoDevolucao: 'RETORNO DA DEVOLUÇÃO',
  },
};


/**
 * Import a single sheet config from Google Sheets via Supabase edge function.
 * Returns the parsed rows + moduloDestino, or null on failure.
 */
export async function importSingleSheet(config: SheetConfig): Promise<{ parsed: Record<string, string>[]; config: SheetConfig } | null> {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const startRow = config.linhaInicial || 1;
    const { data, error } = await supabase.functions.invoke('google-sheets', {
      body: { action: 'read', spreadsheetId: config.spreadsheetId, range: `${config.abaNome}!A${startRow}:BZ` },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    const allRows = data.values || [];
    if (allRows.length < 2) return null;
    const headers = allRows[0];
    const rows = allRows.slice(1);
    const parsed = parseSheetRowsWithFixos(headers, rows, config.mapeamento, config.valoresFixos);
    return { parsed, config };
  } catch (err) {
    console.warn(`[AutoImport] Failed to import "${config.nome}":`, err);
    return null;
  }
}

/**
 * Auto-import all configured sheets from Google Sheets.
 * Loads configs from cloud, seeds default devolução, then imports all.
 * Returns configs and results for each module.
 */
export async function autoImportAllSheets(): Promise<{
  configs: SheetConfig[];
  results: { parsed: Record<string, string>[]; config: SheetConfig }[];
}> {
  // Load configs
  let configs = await loadSheetConfigsFromCloud();
  if (!configs || configs.length === 0) configs = loadSheetConfigs();

  // Seed default devolução config if not present
  if (!configs.find(c => c.moduloDestino === 'devolucao')) {
    configs = [...configs, DEVOLUCAO_DEFAULT];
    saveSheetConfigs(configs);
    saveSheetConfigsToCloud(configs);
  }

  // Import all sheets in parallel (with 8s timeout per sheet)
  const timeout = (ms: number) => new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));
  const importPromises = configs.map(config =>
    Promise.race([importSingleSheet(config), timeout(8000)])
  );
  const settled = await Promise.allSettled(importPromises);
  const results = settled
    .filter((r): r is PromiseFulfilledResult<{ parsed: Record<string, string>[]; config: SheetConfig } | null> =>
      r.status === 'fulfilled' && r.value !== null
    )
    .map(r => r.value!);

  // Update last sync timestamps
  const now = new Date().toLocaleString('pt-BR');
  const successIds = new Set(results.map(r => r.config.id));
  const updatedConfigs = configs.map(c => successIds.has(c.id) ? { ...c, ultimaSync: now } : c);
  saveSheetConfigs(updatedConfigs);
  saveSheetConfigsToCloud(updatedConfigs);

  return { configs: updatedConfigs, results };
}

/**
 * Import only sheets configured for a specific module.
 * Used by per-module refresh buttons.
 */
export async function importModuleSheets(moduloDestino: ModuloDestino): Promise<{
  results: { parsed: Record<string, string>[]; config: SheetConfig }[];
}> {
  let configs = await loadSheetConfigsFromCloud();
  if (!configs || configs.length === 0) configs = loadSheetConfigs();

  // Seed default devolução config if not present
  if (moduloDestino === 'devolucao' && !configs.find(c => c.moduloDestino === 'devolucao')) {
    configs = [...configs, DEVOLUCAO_DEFAULT];
    saveSheetConfigs(configs);
    saveSheetConfigsToCloud(configs);
  }

  const moduleConfigs = configs.filter(c => c.moduloDestino === moduloDestino);
  if (moduleConfigs.length === 0) return { results: [] };

  const timeout = (ms: number) => new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));
  const importPromises = moduleConfigs.map(config =>
    Promise.race([importSingleSheet(config), timeout(10000)])
  );
  const settled = await Promise.allSettled(importPromises);
  const results = settled
    .filter((r): r is PromiseFulfilledResult<{ parsed: Record<string, string>[]; config: SheetConfig } | null> =>
      r.status === 'fulfilled' && r.value !== null
    )
    .map(r => r.value!);

  // Update last sync timestamps
  const now = new Date().toLocaleString('pt-BR');
  const successIds = new Set(results.map(r => r.config.id));
  const updatedConfigs = configs.map(c => successIds.has(c.id) ? { ...c, ultimaSync: now } : c);
  saveSheetConfigs(updatedConfigs);

  return { results };
}
