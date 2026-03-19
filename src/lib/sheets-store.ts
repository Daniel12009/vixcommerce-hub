// Sheets configuration store with localStorage persistence

export type ModuloDestino = 'estoque' | 'financeiro' | 'vendas' | 'performance';

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
};

const STORAGE_KEY = 'vix_sheet_configs';

export function loadSheetConfigs(): SheetConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSheetConfigs(configs: SheetConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
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
