/** Get local date string YYYY-MM-DD regardless of timezone */
export function getLocalDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

/**
 * Known accounts: each entry has a canonical display name and keywords
 * that match variations of that account name (case-insensitive).
 * Later this will be configurable from a settings page.
 */
export const CONTAS_CONHECIDAS = [
  { nome: 'Via Flix', keywords: ['via flix', 'viaflix', 'via-flix'] },
  { nome: 'GS Torneiras', keywords: ['gs torneira', 'gstorneira', 'gs-torneira'] },
  { nome: 'Decarion (Monaco Metais)', keywords: ['decarion', 'monaco'] },
];

/** Normalize a raw account name to its canonical display name */
export function normalizeConta(raw: string): string {
  if (!raw) return raw;
  const lower = raw.toLowerCase().trim();
  for (const conta of CONTAS_CONHECIDAS) {
    for (const kw of conta.keywords) {
      if (lower.includes(kw)) return conta.nome;
    }
  }
  return raw; // Unknown account — keep original name
}

/** Get unique normalized account names from a list of raw names */
export function getContasNormalizadas(rawContas: string[]): string[] {
  const normalized = new Set(rawContas.map(c => normalizeConta(c)));
  return [...normalized].filter(Boolean).sort();
}
