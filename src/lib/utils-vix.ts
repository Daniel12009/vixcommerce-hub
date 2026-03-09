/** Parse Brazilian currency string "R$ 1.200,50" to float */
export function parseBRL(value: string): number {
  if (!value || typeof value !== 'string') return 0;
  const cleaned = value.replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/** Format number as BRL currency */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/** Format number with thousands separator */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

/** Format percentage */
export function formatPercent(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`;
}

/** Calculate replenishment need */
export function calcReposicao(
  vmd: number,
  diasCobertura: number,
  leadTime: number,
  estoqueAtual: number,
  emTransito: number,
  emTransferencia: number,
): number {
  const necessidade = (vmd * (diasCobertura + leadTime)) - (estoqueAtual + emTransito + emTransferencia);
  return Math.max(0, necessidade);
}

/** Get stock coverage status color */
export function getStockStatus(diasCobertura: number): 'green' | 'yellow' | 'red' {
  if (diasCobertura >= 30) return 'green';
  if (diasCobertura >= 15) return 'yellow';
  return 'red';
}

/** Calculate real margin per SKU */
export function calcMargemReal(
  receita: number,
  impostos: number,
  taxas: number,
  custo: number,
  frete: number,
): number {
  return receita - impostos - taxas - custo - frete;
}

/** Gestor responsável padrão */
export const GESTOR_PADRAO = 'João';
