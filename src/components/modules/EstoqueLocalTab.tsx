import { useState, useMemo } from 'react';
import { Search, Package, Check, AlertTriangle } from 'lucide-react';
import { useSheetsData } from '@/contexts/SheetsDataContext';

export function EstoqueLocalTab() {
  const { estoqueTinyItems } = useSheetsData();
  const [searchTerm, setSearchTerm] = useState('');

  const displayData = useMemo(() => {
    if (!estoqueTinyItems) return [];
    
    // Group by SKU to avoid duplicates if any, though Tiny array usually is unique by SKU
    const map = new Map<string, number>();
    estoqueTinyItems.forEach(item => {
      if (!item.sku) return;
      const sku = item.sku.trim().toUpperCase();
      map.set(sku, (map.get(sku) || 0) + Number(item.quantidade || 0));
    });

    const term = searchTerm.trim().toUpperCase();
    return Array.from(map.entries())
      .map(([sku, qtd]) => ({ sku, qtd }))
      .filter(row => !term || row.sku.includes(term))
      .sort((a, b) => a.sku.localeCompare(b.sku));
  }, [estoqueTinyItems, searchTerm]);

  if (!estoqueTinyItems?.length) {
    return (
      <div className="bg-card border border-border rounded-xl p-12 text-center animate-fade-in mt-4">
        <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
        <h3 className="text-lg font-semibold mb-2">Estoque Local Indisponível</h3>
        <p className="text-muted-foreground text-sm">
          Você precisa importar a aba de <strong>Estoque Tiny (Local)</strong> nas configurações de planilhas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-[hsl(200,80%,50%,0.1)] rounded-lg">
            <Package className="w-5 h-5 text-[hsl(200,80%,50%)]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Estoque Local (Tiny)</h2>
            <p className="text-xs text-muted-foreground">{displayData.length} SKUs encontrados</p>
          </div>
        </div>

        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Pesquisar SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 h-10 text-sm bg-card border border-border rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all"
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">SKU</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Quantidade</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {displayData.map((row) => (
                <tr key={row.sku} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono font-semibold text-primary">
                    {row.sku}
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${row.qtd <= 0 ? 'text-[hsl(var(--vix-danger))]' : 'text-foreground'}`}>
                    {row.qtd}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.qtd > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[hsl(var(--vix-success)/0.15)] text-[hsl(var(--vix-success))]">
                        <Check className="w-3 h-3" /> Disponível
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[hsl(var(--vix-danger)/0.15)] text-[hsl(var(--vix-danger))]">
                        <AlertTriangle className="w-3 h-3" /> Esgotado
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {displayData.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-muted-foreground">
                    Nenhum SKU encontrado para a pesquisa.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
