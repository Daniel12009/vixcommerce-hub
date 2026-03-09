import { DollarSign, TrendingUp, Percent } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { KpiCard } from '@/components/shared/KpiCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { mockFinancialItems } from '@/lib/mock-data';
import { formatBRL, formatPercent } from '@/lib/utils-vix';

export function FinanceiroPage() {
  const totalReceita = mockFinancialItems.reduce((s, i) => s + i.receita, 0);
  const totalMargem = mockFinancialItems.reduce((s, i) => s + i.margemReal, 0);
  const margemMedia = totalReceita > 0 ? (totalMargem / totalReceita) * 100 : 0;

  return (
    <div>
      <PageHeader title="Financeiro" subtitle="Margem real por SKU (Receita - Impostos - Taxas - Custo - Frete)" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <KpiCard title="Receita Total" value={formatBRL(totalReceita)} change={14.3} icon={DollarSign} delay={0} />
        <KpiCard title="Margem Total" value={formatBRL(totalMargem)} change={8.7} icon={TrendingUp} delay={50} />
        <KpiCard title="Margem Média" value={formatPercent(margemMedia)} icon={Percent} delay={100} />
      </div>

      {/* Margin chart */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6 animate-fade-in" style={{ animationDelay: '150ms' }}>
        <h3 className="text-foreground font-semibold mb-4">Margem Real por SKU</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={mockFinancialItems}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="skuPrincipal" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
            <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
              formatter={(value: number) => [formatBRL(value)]}
            />
            <Bar dataKey="receita" name="Receita" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.7} />
            <Bar dataKey="margemReal" name="Margem" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in" style={{ animationDelay: '250ms' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left py-3 px-4 font-semibold text-muted-foreground">SKU</th>
                <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Produto</th>
                <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Receita</th>
                <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Impostos</th>
                <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Taxas</th>
                <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Custo</th>
                <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Frete</th>
                <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Margem R$</th>
                <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Margem %</th>
              </tr>
            </thead>
            <tbody>
              {mockFinancialItems.map((item) => (
                <tr key={item.skuPrincipal} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs text-primary font-semibold">{item.skuPrincipal}</td>
                  <td className="py-3 px-4 text-foreground">{item.nome}</td>
                  <td className="py-3 px-4 text-right text-foreground">{formatBRL(item.receita)}</td>
                  <td className="py-3 px-4 text-right text-vix-danger">{formatBRL(item.impostos)}</td>
                  <td className="py-3 px-4 text-right text-vix-warning">{formatBRL(item.taxas)}</td>
                  <td className="py-3 px-4 text-right text-muted-foreground">{formatBRL(item.custo)}</td>
                  <td className="py-3 px-4 text-right text-muted-foreground">{formatBRL(item.frete)}</td>
                  <td className={`py-3 px-4 text-right font-semibold ${item.margemReal >= 0 ? 'text-vix-success' : 'text-vix-danger'}`}>{formatBRL(item.margemReal)}</td>
                  <td className={`py-3 px-4 text-right ${item.margemPercent >= 0 ? 'text-vix-success' : 'text-vix-danger'}`}>{formatPercent(item.margemPercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
