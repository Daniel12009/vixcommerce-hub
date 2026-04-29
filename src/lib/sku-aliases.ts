// Mapa de SKUs sinônimos: chave = SKU como vem dos dados, valor = SKU canônico
// Adicione novos pares aqui conforme necessário.
export const SKU_ALIASES: Record<string, string> = {
  'FC-04': 'FC-04M',
};

export function canonicalSku(sku: string | null | undefined): string {
  if (!sku) return '';
  const norm = String(sku).trim().toUpperCase();
  return SKU_ALIASES[norm] ?? norm;
}
