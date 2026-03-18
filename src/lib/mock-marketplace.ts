import type { MarketplaceAccount, Order, AdsCampaign } from './types';

export const mockMarketplaceAccounts: MarketplaceAccount[] = [
  {
    id: 'ml1',
    nome: 'VixStore Oficial',
    plataforma: 'Mercado Livre',
    loja: 'VIXSTORE_OFICIAL',
    status: 'connected',
    ultimaSync: '2026-03-09 14:32',
    totalPedidos: 847,
    faturamento: 156230.50,
  },
  {
    id: 'ml2',
    nome: 'VixHome Decoração',
    plataforma: 'Mercado Livre',
    loja: 'VIXHOME_DECO',
    status: 'connected',
    ultimaSync: '2026-03-09 13:15',
    totalPedidos: 523,
    faturamento: 98450.80,
  },
  {
    id: 'ml3',
    nome: 'VixSport Premium',
    plataforma: 'Mercado Livre',
    loja: 'VIXSPORT_PREM',
    status: 'connected',
    ultimaSync: '2026-03-09 12:45',
    totalPedidos: 312,
    faturamento: 72340.00,
  },
  {
    id: 'ml4',
    nome: 'VixTech Eletrônicos',
    plataforma: 'Mercado Livre',
    loja: 'VIXTECH_ELET',
    status: 'disconnected',
    totalPedidos: 0,
    faturamento: 0,
  },
  {
    id: 'tiny',
    nome: 'Tiny ERP',
    plataforma: 'Tiny',
    loja: 'VIX_TINY',
    status: 'connected',
    ultimaSync: '2026-03-09 14:00',
    totalPedidos: 1245,
    faturamento: 287450.90,
  },
  {
    id: 'shopee',
    nome: 'VixStore Shopee',
    plataforma: 'Shopee',
    loja: 'VIXSTORE_SHOPEE',
    status: 'disconnected',
    totalPedidos: 0,
    faturamento: 0,
  },
];

export const mockOrders: Order[] = [
  { id: '1', marketplace: 'ml1', numeroPedido: 'ML-20260308001', data: '2026-03-08', comprador: 'Maria Silva', sku: 'VIX-001', produto: 'Camiseta Básica Premium', quantidade: 2, valorTotal: 159.80, statusPedido: 'entregue', frete: 12.50, taxas: 25.57 },
  { id: '2', marketplace: 'ml1', numeroPedido: 'ML-20260308002', data: '2026-03-08', comprador: 'Carlos Santos', sku: 'VIX-002', produto: 'Calça Jeans Slim', quantidade: 1, valorTotal: 189.90, statusPedido: 'enviado', frete: 15.00, taxas: 30.38 },
  { id: '3', marketplace: 'ml2', numeroPedido: 'ML-20260308003', data: '2026-03-08', comprador: 'Ana Oliveira', sku: 'VIX-003', produto: 'Tênis Runner Pro', quantidade: 1, valorTotal: 299.90, statusPedido: 'pago', frete: 18.90, taxas: 47.98 },
  { id: '4', marketplace: 'ml1', numeroPedido: 'ML-20260309001', data: '2026-03-09', comprador: 'João Pereira', sku: 'VIX-001', produto: 'Camiseta Básica Premium', quantidade: 3, valorTotal: 239.70, statusPedido: 'pendente', frete: 12.50, taxas: 38.35 },
  { id: '5', marketplace: 'ml3', numeroPedido: 'ML-20260309002', data: '2026-03-09', comprador: 'Fernanda Lima', sku: 'VIX-005', produto: 'Relógio Digital Sport', quantidade: 1, valorTotal: 249.90, statusPedido: 'pago', frete: 10.00, taxas: 39.98 },
  { id: '6', marketplace: 'tiny', numeroPedido: 'TN-20260309001', data: '2026-03-09', comprador: 'Ricardo Almeida', sku: 'VIX-002', produto: 'Calça Jeans Slim', quantidade: 2, valorTotal: 379.80, statusPedido: 'enviado', frete: 20.00, taxas: 60.77 },
  { id: '7', marketplace: 'ml2', numeroPedido: 'ML-20260309003', data: '2026-03-09', comprador: 'Camila Rocha', sku: 'VIX-001', produto: 'Camiseta Básica Premium', quantidade: 1, valorTotal: 79.90, statusPedido: 'entregue', frete: 8.50, taxas: 12.78 },
  { id: '8', marketplace: 'ml1', numeroPedido: 'ML-20260309004', data: '2026-03-09', comprador: 'Lucas Mendes', sku: 'VIX-003', produto: 'Tênis Runner Pro', quantidade: 2, valorTotal: 599.80, statusPedido: 'pago', frete: 22.00, taxas: 95.97 },
  { id: '9', marketplace: 'ml3', numeroPedido: 'ML-20260307001', data: '2026-03-07', comprador: 'Patricia Costa', sku: 'VIX-002', produto: 'Calça Jeans Slim', quantidade: 1, valorTotal: 189.90, statusPedido: 'entregue', frete: 15.00, taxas: 30.38 },
  { id: '10', marketplace: 'tiny', numeroPedido: 'TN-20260307002', data: '2026-03-07', comprador: 'Bruno Souza', sku: 'VIX-005', produto: 'Relógio Digital Sport', quantidade: 3, valorTotal: 749.70, statusPedido: 'entregue', frete: 15.00, taxas: 119.95 },
  { id: '11', marketplace: 'ml1', numeroPedido: 'ML-20260307003', data: '2026-03-07', comprador: 'Amanda Ferreira', sku: 'VIX-001', produto: 'Camiseta Básica Premium', quantidade: 5, valorTotal: 399.50, statusPedido: 'enviado', frete: 18.00, taxas: 63.92 },
  { id: '12', marketplace: 'ml2', numeroPedido: 'ML-20260306001', data: '2026-03-06', comprador: 'Diego Martins', sku: 'VIX-003', produto: 'Tênis Runner Pro', quantidade: 1, valorTotal: 299.90, statusPedido: 'cancelado', frete: 0, taxas: 0 },
];

export const mockAdsCampaigns: AdsCampaign[] = [
  { campanha: '78998965097172', roasObjetivo: 20, investimento: 22.76, receita: 55, roasRealizado: 2.41, orcamentoDiario: 40, status: 'ajustar', recomendacao: 'Ajuste Urgente — ROAS muito abaixo. Revisar segmentação ou pausar.' },
  { campanha: '78998965097288', roasObjetivo: 10, investimento: 100.66, receita: 557, roasRealizado: 5.53, orcamentoDiario: 30, status: 'ajustar', recomendacao: 'Otimizar — Performance abaixo da meta. Analisar anúncios internos.' },
  { campanha: 'BA-03', roasObjetivo: 20, investimento: 0, receita: 0, roasRealizado: 0, orcamentoDiario: 20, status: 'pausado', recomendacao: 'Verificar — Campanha sem investimento. Ativar se necessário.' },
  { campanha: 'Banheira', roasObjetivo: 12, investimento: 221.03, receita: 2282, roasRealizado: 10.32, orcamentoDiario: 50, status: 'ativo', recomendacao: 'Alavancar — Performance próxima da meta. Aumentar investimento gradualmente.' },
  { campanha: 'BT054', roasObjetivo: 10, investimento: 3.24, receita: 0, roasRealizado: 0, orcamentoDiario: 15, status: 'ajustar', recomendacao: 'Analisar — Investiu mas sem receita. Verificar segmentação.' },
  { campanha: 'CB-01', roasObjetivo: 10, investimento: 16.77, receita: 0, roasRealizado: 0, orcamentoDiario: 20, status: 'ajustar', recomendacao: 'Analisar — Sem receita gerada. Revisar criativos.' },
  { campanha: 'CB-02', roasObjetivo: 12.5, investimento: 0, receita: 0, roasRealizado: 0, orcamentoDiario: 25, status: 'pausado', recomendacao: 'Verificar — Sem investimento. Campanha pode estar pausada.' },
  { campanha: 'Cubas High-Gain', roasObjetivo: 12, investimento: 583.29, receita: 5634, roasRealizado: 9.66, orcamentoDiario: 100, status: 'ativo', recomendacao: 'Alavancar — Maior investimento e receita. Manter ou escalar.' },
  { campanha: 'E160', roasObjetivo: 12.5, investimento: 1.94, receita: 0, roasRealizado: 0, orcamentoDiario: 15, status: 'ajustar', recomendacao: 'Analisar — Sem receita. Verificar se anúncios estão ativos.' },
  { campanha: 'FC-01 e FC-05', roasObjetivo: 14, investimento: 133.62, receita: 1309, roasRealizado: 9.8, orcamentoDiario: 40, status: 'ativo', recomendacao: 'Otimizar/Alavancar — Boa performance com espaço para melhoria.' },
];

// Sales by day for charts
export const mockSalesByDay = [
  { dia: '03/03', ml1: 12, ml2: 8, ml3: 5, tiny: 18, total: 43 },
  { dia: '04/03', ml1: 15, ml2: 6, ml3: 7, tiny: 22, total: 50 },
  { dia: '05/03', ml1: 18, ml2: 10, ml3: 4, tiny: 20, total: 52 },
  { dia: '06/03', ml1: 14, ml2: 9, ml3: 6, tiny: 25, total: 54 },
  { dia: '07/03', ml1: 20, ml2: 12, ml3: 8, tiny: 28, total: 68 },
  { dia: '08/03', ml1: 22, ml2: 11, ml3: 9, tiny: 30, total: 72 },
  { dia: '09/03', ml1: 16, ml2: 7, ml3: 5, tiny: 19, total: 47 },
];

// Revenue by marketplace for pie chart
export const mockRevenueByMarketplace = [
  { name: 'ML - VixStore Oficial', value: 156230.50, fill: 'hsl(var(--primary))' },
  { name: 'ML - VixHome Decoração', value: 98450.80, fill: 'hsl(var(--accent))' },
  { name: 'ML - VixSport Premium', value: 72340.00, fill: 'hsl(var(--vix-warning))' },
  { name: 'Tiny ERP', value: 287450.90, fill: 'hsl(var(--vix-info))' },
];
