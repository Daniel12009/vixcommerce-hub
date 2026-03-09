export interface Product {
  skuPrincipal: string;
  nome: string;
  categoria: string;
  status: 'Ativo' | 'Inativo' | 'Rascunho';
  // Geral
  marca?: string;
  ean?: string;
  descricao?: string;
  imagem?: string;
  // Logística
  peso?: number;
  altura?: number;
  largura?: number;
  comprimento?: number;
  estoqueAtual?: number;
  estoqueMinimo?: number;
  leadTime?: number;
  emTransito?: number;
  emTransferencia?: number;
  // Financeiro
  precoCusto?: number;
  precoVenda?: number;
  impostos?: number;
  taxaMarketplace?: number;
  custoFrete?: number;
  // Completeness
  geralCompleto?: boolean;
  logisticaCompleta?: boolean;
  financeiroCompleto?: boolean;
}

export interface StockItem {
  skuPrincipal: string;
  nome: string;
  estoqueAtual: number;
  estoqueMinimo: number;
  vmd: number; // Vendas Média Diária
  diasCobertura: number;
  leadTime: number;
  emTransito: number;
  emTransferencia: number;
  necessidadeReposicao: number;
  statusCobertura: 'green' | 'yellow' | 'red';
}

export interface FinancialItem {
  skuPrincipal: string;
  nome: string;
  receita: number;
  impostos: number;
  taxas: number;
  custo: number;
  frete: number;
  margemReal: number;
  margemPercent: number;
  unidadesVendidas: number;
}

export interface DashboardMetrics {
  totalVisitas: number;
  totalVendas: number;
  taxaConversao: number;
  faturamento: number;
  ticketMedio: number;
  pedidos: number;
}

export interface AdsMetric {
  campanha: string;
  plataforma: string;
  investimento: number;
  receita: number;
  roas: number;
  acos: number;
  cliques: number;
  impressoes: number;
  ctr: number;
  cpc: number;
}

export type ModuleName = 'dashboard' | 'estoque' | 'financeiro' | 'cadastro' | 'marketing';
