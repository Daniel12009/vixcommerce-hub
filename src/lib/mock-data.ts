import type { Product, StockItem, FinancialItem, DashboardMetrics, AdsMetric } from './types';

export const mockDashboardMetrics: DashboardMetrics = {
  totalVisitas: 45230,
  totalVendas: 1847,
  taxaConversao: 4.08,
  faturamento: 287450.90,
  ticketMedio: 155.60,
  pedidos: 1847,
};

export const mockDashboardHistory = [
  { mes: 'Jan', visitas: 32000, vendas: 1200, conversao: 3.75 },
  { mes: 'Fev', visitas: 35400, vendas: 1350, conversao: 3.81 },
  { mes: 'Mar', visitas: 38100, vendas: 1520, conversao: 3.99 },
  { mes: 'Abr', visitas: 41200, vendas: 1680, conversao: 4.08 },
  { mes: 'Mai', visitas: 43800, vendas: 1790, conversao: 4.09 },
  { mes: 'Jun', visitas: 45230, vendas: 1847, conversao: 4.08 },
];

export const mockProducts: Product[] = [
  {
    skuPrincipal: 'VIX-001',
    nome: 'Camiseta Básica Premium',
    categoria: 'Vestuário',
    status: 'Ativo',
    marca: 'VixWear',
    ean: '7891234567890',
    descricao: 'Camiseta básica em algodão premium 100%',
    peso: 0.25,
    altura: 3,
    largura: 30,
    comprimento: 40,
    estoqueAtual: 450,
    estoqueMinimo: 100,
    leadTime: 15,
    emTransito: 200,
    emTransferencia: 0,
    precoCusto: 22.50,
    precoVenda: 79.90,
    impostos: 12.5,
    taxaMarketplace: 16,
    custoFrete: 8.50,
    geralCompleto: true,
    logisticaCompleta: true,
    financeiroCompleto: true,
  },
  {
    skuPrincipal: 'VIX-002',
    nome: 'Calça Jeans Slim',
    categoria: 'Vestuário',
    status: 'Ativo',
    marca: 'VixWear',
    ean: '7891234567891',
    descricao: 'Calça jeans slim fit com elastano',
    peso: 0.65,
    altura: 5,
    largura: 35,
    comprimento: 45,
    estoqueAtual: 120,
    estoqueMinimo: 50,
    leadTime: 20,
    emTransito: 80,
    emTransferencia: 30,
    precoCusto: 45.00,
    precoVenda: 189.90,
    impostos: 15,
    taxaMarketplace: 16,
    custoFrete: 12.00,
    geralCompleto: true,
    logisticaCompleta: true,
    financeiroCompleto: true,
  },
  {
    skuPrincipal: 'VIX-003',
    nome: 'Tênis Runner Pro',
    categoria: 'Calçados',
    status: 'Ativo',
    marca: 'VixSport',
    ean: '7891234567892',
    peso: 0.8,
    altura: 15,
    largura: 30,
    comprimento: 35,
    estoqueAtual: 35,
    estoqueMinimo: 40,
    leadTime: 30,
    emTransito: 0,
    emTransferencia: 0,
    precoCusto: 85.00,
    precoVenda: 299.90,
    impostos: 18,
    taxaMarketplace: 16,
    custoFrete: 15.00,
    geralCompleto: true,
    logisticaCompleta: true,
    financeiroCompleto: true,
  },
  {
    skuPrincipal: 'VIX-004',
    nome: 'Bolsa Couro Elegance',
    categoria: 'Acessórios',
    status: 'Rascunho',
    marca: 'VixStyle',
    geralCompleto: true,
    logisticaCompleta: false,
    financeiroCompleto: false,
  },
  {
    skuPrincipal: 'VIX-005',
    nome: 'Relógio Digital Sport',
    categoria: 'Acessórios',
    status: 'Inativo',
    marca: 'VixTech',
    ean: '7891234567894',
    peso: 0.15,
    altura: 10,
    largura: 10,
    comprimento: 8,
    estoqueAtual: 0,
    estoqueMinimo: 20,
    leadTime: 45,
    emTransito: 50,
    emTransferencia: 0,
    precoCusto: 65.00,
    precoVenda: 249.90,
    impostos: 20,
    taxaMarketplace: 16,
    custoFrete: 10.00,
    geralCompleto: true,
    logisticaCompleta: true,
    financeiroCompleto: true,
  },
];

function calcStockStatus(diasCobertura: number): 'green' | 'yellow' | 'red' {
  if (diasCobertura >= 30) return 'green';
  if (diasCobertura >= 15) return 'yellow';
  return 'red';
}

export const mockStockItems: StockItem[] = mockProducts
  .filter(p => p.estoqueAtual !== undefined)
  .map(p => {
    const vmd = Math.round(Math.random() * 15 + 5);
    const diasCobertura = p.estoqueAtual! > 0 ? Math.round(p.estoqueAtual! / vmd) : 0;
    const necessidade = (vmd * (30 + (p.leadTime || 15))) - (p.estoqueAtual! + (p.emTransito || 0) + (p.emTransferencia || 0));
    return {
      skuPrincipal: p.skuPrincipal,
      nome: p.nome,
      estoqueAtual: p.estoqueAtual!,
      estoqueMinimo: p.estoqueMinimo || 0,
      vmd,
      diasCobertura,
      leadTime: p.leadTime || 15,
      emTransito: p.emTransito || 0,
      emTransferencia: p.emTransferencia || 0,
      necessidadeReposicao: Math.max(0, necessidade),
      statusCobertura: calcStockStatus(diasCobertura),
    };
  });

export const mockFinancialItems: FinancialItem[] = mockProducts
  .filter(p => p.precoVenda && p.precoCusto)
  .map(p => {
    const units = Math.round(Math.random() * 200 + 30);
    const receita = units * p.precoVenda!;
    const impostos = receita * (p.impostos || 0) / 100;
    const taxas = receita * (p.taxaMarketplace || 0) / 100;
    const custo = units * p.precoCusto!;
    const frete = units * (p.custoFrete || 0);
    const margem = receita - impostos - taxas - custo - frete;
    return {
      skuPrincipal: p.skuPrincipal,
      nome: p.nome,
      receita,
      impostos,
      taxas,
      custo,
      frete,
      margemReal: margem,
      margemPercent: (margem / receita) * 100,
      unidadesVendidas: units,
    };
  });

export const mockAdsMetrics: AdsMetric[] = [
  {
    campanha: 'Verão 2024 - Camisetas',
    plataforma: 'Meta Ads',
    investimento: 2500,
    receita: 12800,
    roas: 5.12,
    acos: 19.53,
    cliques: 3200,
    impressoes: 85000,
    ctr: 3.76,
    cpc: 0.78,
  },
  {
    campanha: 'Calça Jeans - Remarketing',
    plataforma: 'Google Ads',
    investimento: 1800,
    receita: 8500,
    roas: 4.72,
    acos: 21.18,
    cliques: 2100,
    impressoes: 62000,
    ctr: 3.39,
    cpc: 0.86,
  },
  {
    campanha: 'Black Friday - Geral',
    plataforma: 'Meta Ads',
    investimento: 5200,
    receita: 32000,
    roas: 6.15,
    acos: 16.25,
    cliques: 8500,
    impressoes: 210000,
    ctr: 4.05,
    cpc: 0.61,
  },
  {
    campanha: 'Tênis Runner - Performance',
    plataforma: 'Google Ads',
    investimento: 3100,
    receita: 9200,
    roas: 2.97,
    acos: 33.70,
    cliques: 4200,
    impressoes: 95000,
    ctr: 4.42,
    cpc: 0.74,
  },
  {
    campanha: 'Brand Awareness',
    plataforma: 'TikTok Ads',
    investimento: 1200,
    receita: 4100,
    roas: 3.42,
    acos: 29.27,
    cliques: 5600,
    impressoes: 180000,
    ctr: 3.11,
    cpc: 0.21,
  },
];
