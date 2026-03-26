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
  conta: string;
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

export interface EstoqueFullItem {
  data: string;
  conta: string;
  sku: string;
  tamanho: string;
  statusAnuncio: string;
  entradaPendente: number;
  emTransferencia: number;
  devolvidasComprador: number;
  aptasParaVenda: number;
  unidadesOcupamEspaco: number;
}

export interface EstoqueTinyItem {
  sku: string;
  quantidade: number;
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

export interface DevolucaoItem {
  dataPlanilha: string;
  plataforma: string;
  dataAprovacao: string;
  valorReembolso: number;
  pedido: string;
  anuncio: string;
  skuProduto: string;
  statusDevolucao: string;
  acaoAposDevolucao: string;
  devolucaoGeradaPor: string;
  rastreioCorreios: string;
  motivo: string;
  detalhesMotivo: string;
  novoMotivo: string;
  detalhe: string;
  setor: string;
  custoDevolucao: number;
  comissaoNaoDevolvida: number;
  custo: number;
  quantidade: number;
  situacaoMercadoria: string;
  totalCustoMercadoria: number;
  formaReembolso: string;
  dataReembolso: string;
  depositoDevolucao: string;
  notaFiscalDevolucao: string;
  colaborador: string;
  retornoDevolucao: string;
}

export type ModuleName = 'dashboard' | 'estoque' | 'financeiro' | 'cadastro' | 'marketing' | 'atualizar' | 'devolucao' | 'usuarios' | 'configuracoes' | 'atendimento' | 'metas';

export type MarketplaceId = 'ml1' | 'ml2' | 'ml3' | 'ml4' | 'tiny' | 'shopee' | 'amazon';

export interface MarketplaceAccount {
  id: MarketplaceId;
  nome: string;
  plataforma: string;
  loja: string;
  status: 'connected' | 'disconnected' | 'syncing';
  ultimaSync?: string;
  totalPedidos?: number;
  faturamento?: number;
}

export interface Order {
  id: string;
  marketplace: MarketplaceId;
  numeroPedido: string;
  data: string;
  comprador: string;
  sku: string;
  produto: string;
  quantidade: number;
  valorTotal: number;
  statusPedido: 'pendente' | 'pago' | 'enviado' | 'entregue' | 'cancelado';
  frete: number;
  taxas: number;
  conta?: string;
}

export interface VendaItem {
  numeroPedido: string;
  data: string;
  conta: string;
  contaMae: string;
  comprador: string;
  sku: string;
  skuProduto: string;
  produto: string;
  quantidade: number;
  valorTotal: number;
  statusPedido: string;
  frete: number;
  origem: string;
  pedidoOrigem: string;
  precoUnitario: number;
  impostos: number;
  comissao: number;
  custoEnvio: number;
  ads: number;
  cmv: number;
  margem: string;
  liquido: number;
  devolucao: string;
}

export interface AdsCampaign {
  campanha: string;
  roasObjetivo: number;
  investimento: number;
  receita: number;
  roasRealizado: number;
  orcamentoDiario: number;
  status: 'ativo' | 'pausado' | 'ajustar';
  recomendacao: string;
}

export interface PerformanceItem {
  plataforma: string;
  idAnuncio: string;
  sku: string;
  titulo: string;
  preco: number;
  visitas: number;
  vendas: number;
  canceladas: number;
  conversao: number;
  link: string;
  conta: string;
  dataRef: string;
}

export interface AdsImportItem {
  tipo: string;
  dataRef: string;
  conta: string;
  campanha: string;
  idCampanha: string;
  idAnuncio: string;
  titulo: string;
  investimento: number;
  receita: number;
  vendasQtd: number;
  acos: number;
  roas: number;
  cliques: number;
  impressoes: number;
  ultAtualizacao: string;
}
