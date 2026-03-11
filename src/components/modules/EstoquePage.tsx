import { Package, AlertTriangle, TrendingDown, FileSpreadsheet } from 'lucide-react';
import { KpiCard } from '@/components/shared/KpiCard';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { mockStockItems } from '@/lib/mock-data';
import { formatNumber } from '@/lib/utils-vix';
import { useSheetsData } from '@/contexts/SheetsDataContext';

export function EstoquePage() {
  const { estoqueItems } = useSheetsData();
  const items = estoqueItems || mockStockItems;
  const isFromSheet = !!estoqueItems;

  const totalEstoque = items.reduce((s, i) => s + i.estoqueAtual, 0);
  const criticos = items.filter(i => i.statusCobertura === 'red').length;
  const emRuptura = items.filter(i => i.estoqueAtual <= i.estoqueMinimo).length;

  return (
    <div>
      <PageHeader title="Estoque Full" subtitle="Gestão logística com alertas de ruptura" />

      {isFromSheet && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-[hsl(var(--vix-success)/0.1)] border border-[hsl(var(--vix-success)/0.2)] text-xs text-[hsl(var(--vix-success))]">
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Dados importados da planilha Google ({items.length} itens)
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <KpiCard title="Estoque Total" value={formatNumber(totalEstoque)} icon={Package} delay={0} />
        <KpiCard title="SKUs Críticos" value={String(criticos)} icon={AlertTriangle} delay={50} />
        <KpiCard title="Em Ruptura" value={String(emRuptura)} icon={TrendingDown} delay={100} />
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in" style={{ animationDelay: '150ms' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left py-3 px-4 font-semibold text-muted-foreground">SKU</th>
                <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Produto</th>
                <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Estoque</th>
                <th className="text-right py-3 px-4 font-semibold text-muted-foreground">VMD</th>
                <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Cobertura (dias)</th>
                <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Em Trânsito</th>
                <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Reposição</th>
                <th className="text-center py-3 px-4 font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.skuPrincipal} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs text-primary font-semibold">{item.skuPrincipal}</td>
                  <td className="py-3 px-4 text-foreground">{item.nome}</td>
                  <td className="py-3 px-4 text-right text-foreground font-medium">{formatNumber(item.estoqueAtual)}</td>
                  <td className="py-3 px-4 text-right text-muted-foreground">{item.vmd}</td>
                  <td className="py-3 px-4 text-right text-foreground">{item.diasCobertura}</td>
                  <td className="py-3 px-4 text-right text-muted-foreground">{formatNumber(item.emTransito)}</td>
                  <td className="py-3 px-4 text-right font-semibold text-foreground">{formatNumber(item.necessidadeReposicao)}</td>
                  <td className="py-3 px-4 text-center"><StatusBadge status={item.statusCobertura} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
