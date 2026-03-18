import { Megaphone, TrendingUp, DollarSign } from 'lucide-react';
import { KpiCard } from '@/components/shared/KpiCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { mockAdsMetrics } from '@/lib/mock-data';
import { formatBRL, formatPercent } from '@/lib/utils-vix';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';

export function MarketingPage() {
  const totalInvestimento = mockAdsMetrics.reduce((s, i) => s + i.investimento, 0);
  const totalReceita = mockAdsMetrics.reduce((s, i) => s + i.receita, 0);
  const roasGeral = totalReceita / totalInvestimento;

  return (
    <div>
      <PageHeader title="Ads / Marketing" subtitle="Monitorização de ROAS e ACOS por campanha" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <KpiCard title="Investimento Total" value={formatBRL(totalInvestimento)} icon={DollarSign} delay={0} />
        <KpiCard title="Receita de Ads" value={formatBRL(totalReceita)} change={22.1} icon={TrendingUp} delay={50} />
        <KpiCard title="ROAS Geral" value={roasGeral.toFixed(2) + 'x'} icon={Megaphone} delay={100} />
      </div>

      {/* Chart */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6 animate-fade-in" style={{ animationDelay: '150ms' }}>
        <h3 className="text-foreground font-semibold mb-4">Investimento vs Receita por Campanha</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={mockAdsMetrics}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="campanha" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} angle={-15} textAnchor="end" height={60} />
            <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
              formatter={(value: number) => [formatBRL(value)]}
            />
            <Legend />
            <Bar dataKey="investimento" name="Investimento" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} opacity={0.7} />
            <Bar dataKey="receita" name="Receita" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in" style={{ animationDelay: '250ms' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Campanha</th>
                <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Plataforma</th>
                <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Investimento</th>
                <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Receita</th>
                <th className="text-right py-3 px-4 font-semibold text-muted-foreground">ROAS</th>
                <th className="text-right py-3 px-4 font-semibold text-muted-foreground">ACOS</th>
                <th className="text-right py-3 px-4 font-semibold text-muted-foreground">CTR</th>
                <th className="text-right py-3 px-4 font-semibold text-muted-foreground">CPC</th>
              </tr>
            </thead>
            <tbody>
              {mockAdsMetrics.map((item, idx) => (
                <tr key={idx} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4 text-foreground font-medium">{item.campanha}</td>
                  <td className="py-3 px-4 text-muted-foreground">{item.plataforma}</td>
                  <td className="py-3 px-4 text-right text-vix-danger">{formatBRL(item.investimento)}</td>
                  <td className="py-3 px-4 text-right text-vix-success">{formatBRL(item.receita)}</td>
                  <td className={`py-3 px-4 text-right font-semibold ${item.roas >= 4 ? 'text-vix-success' : item.roas >= 3 ? 'text-vix-warning' : 'text-vix-danger'}`}>{item.roas.toFixed(2)}x</td>
                  <td className={`py-3 px-4 text-right ${item.acos <= 20 ? 'text-vix-success' : item.acos <= 30 ? 'text-vix-warning' : 'text-vix-danger'}`}>{formatPercent(item.acos)}</td>
                  <td className="py-3 px-4 text-right text-muted-foreground">{formatPercent(item.ctr)}</td>
                  <td className="py-3 px-4 text-right text-muted-foreground">{formatBRL(item.cpc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
