import { Eye, ShoppingCart, TrendingUp, DollarSign, Receipt, Package } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart, Legend } from 'recharts';
import { KpiCard } from '@/components/shared/KpiCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { mockDashboardMetrics, mockDashboardHistory } from '@/lib/mock-data';
import { formatBRL, formatNumber, formatPercent } from '@/lib/utils-vix';

export function DashboardPage() {
  const m = mockDashboardMetrics;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Visão geral de performance do e-commerce" />

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <KpiCard title="Visitas" value={formatNumber(m.totalVisitas)} change={8.2} icon={Eye} delay={0} />
        <KpiCard title="Vendas" value={formatNumber(m.totalVendas)} change={12.5} icon={ShoppingCart} delay={50} />
        <KpiCard title="Conversão" value={formatPercent(m.taxaConversao)} change={3.8} icon={TrendingUp} delay={100} />
        <KpiCard title="Faturamento" value={formatBRL(m.faturamento)} change={15.2} icon={DollarSign} delay={150} />
        <KpiCard title="Ticket Médio" value={formatBRL(m.ticketMedio)} change={2.4} icon={Receipt} delay={200} />
        <KpiCard title="Pedidos" value={formatNumber(m.pedidos)} change={12.5} icon={Package} delay={250} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Visitas vs Vendas */}
        <div className="bg-card border border-border rounded-xl p-6 animate-fade-in" style={{ animationDelay: '300ms' }}>
          <h3 className="text-foreground font-semibold mb-4">Visitas vs Vendas</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={mockDashboardHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="mes" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
              <YAxis yAxisId="left" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  color: 'hsl(var(--foreground))',
                }}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="visitas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.8} />
              <Bar yAxisId="right" dataKey="vendas" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Conversão */}
        <div className="bg-card border border-border rounded-xl p-6 animate-fade-in" style={{ animationDelay: '400ms' }}>
          <h3 className="text-foreground font-semibold mb-4">Taxa de Conversão (%)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={mockDashboardHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="mes" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} domain={[3, 5]} />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  color: 'hsl(var(--foreground))',
                }}
              />
              <defs>
                <linearGradient id="convGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="conversao" stroke="hsl(var(--accent))" fill="url(#convGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
