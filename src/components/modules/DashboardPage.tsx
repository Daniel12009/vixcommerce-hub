import { useState, useEffect, useCallback } from 'react';
import { ShoppingCart, DollarSign, Receipt, Package, RefreshCw, Store, Globe, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { KpiCard } from '@/components/shared/KpiCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatBRL, formatNumber } from '@/lib/utils-vix';
import { supabase } from '@/integrations/supabase/client';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#8b5cf6'];

interface MLOrder {
  id: string;
  status: string;
  date_created: string;
  total_amount: number;
  buyer: string;
  items: { title: string; sku: string; quantity: number; unit_price: number }[];
  conta: string;
  error?: string;
}

export function DashboardPage() {
  const [orders, setOrders] = useState<MLOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch ML and Shopee in parallel
      const [mlResult, shopeeResult] = await Promise.allSettled([
        supabase.functions.invoke('mercado-livre', { body: { action: 'get_today_orders' } }),
        supabase.functions.invoke('shopee', { body: { action: 'get_today_orders' } }),
      ]);

      const allFetched: MLOrder[] = [];
      const errors: string[] = [];

      // Process ML
      if (mlResult.status === 'fulfilled' && mlResult.value.data) {
        const mlOrders = (mlResult.value.data.orders || [])
          .filter((o: any) => !o.error && o.status)
          .map((o: any) => ({ ...o, plataforma: 'mercadolivre' }));
        allFetched.push(...mlOrders);
        const mlErrors = (mlResult.value.data.orders || []).filter((o: any) => o.error);
        mlErrors.forEach((e: any) => errors.push(e.error));
      } else if (mlResult.status === 'rejected') {
        errors.push(`ML: ${mlResult.reason}`);
      }

      // Process Shopee
      if (shopeeResult.status === 'fulfilled' && shopeeResult.value.data) {
        const shopeeOrders = (shopeeResult.value.data.orders || [])
          .filter((o: any) => !o.error && o.status);
        allFetched.push(...shopeeOrders);
        const spErrors = (shopeeResult.value.data.orders || []).filter((o: any) => o.error);
        spErrors.forEach((e: any) => errors.push(e.error));
      } else if (shopeeResult.status === 'rejected') {
        errors.push(`Shopee: ${shopeeResult.reason}`);
      }

      setOrders(allFetched);
      setLastRefresh(new Date().toLocaleString('pt-BR'));

      if (errors.length > 0) {
        console.warn('Account errors:', errors);
      }
    } catch (err: any) {
      setError(err.message);
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount + auto-refresh every 5 min
  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // Filter orders by status
  const paidOrders = orders.filter(o => ['paid', 'partially_paid', 'payment_in_process', 'payment_required'].includes(o.status));
  const allValidOrders = orders.filter(o => o.status !== 'cancelled');

  // KPIs
  const totalPedidos = allValidOrders.length;
  const totalFaturamento = Math.round(paidOrders.reduce((s, o) => s + o.total_amount, 0));
  const totalVendas = paidOrders.reduce((s, o) => s + o.items.reduce((is, item) => is + item.quantity, 0), 0);
  const ticketMedio = totalPedidos > 0 ? Math.round(totalFaturamento / paidOrders.length) : 0;

  // Sales by Account (Pie)
  const vendasPorConta: { conta: string; value: number; pedidos: number }[] = [];
  const contaMap = new Map<string, { conta: string; value: number; pedidos: number }>();
  paidOrders.forEach(o => {
    const c = o.conta || 'Outros';
    const cur = contaMap.get(c) || { conta: c, value: 0, pedidos: 0 };
    cur.value += o.total_amount;
    cur.pedidos += 1;
    contaMap.set(c, cur);
  });
  contaMap.forEach(v => vendasPorConta.push({ ...v, value: Math.round(v.value) }));
  vendasPorConta.sort((a, b) => b.value - a.value);

  // Sales by Hour
  const vendasPorHora: { hora: string; faturamento: number; pedidos: number }[] = [];
  const horaMap = new Map<string, { hora: string; faturamento: number; pedidos: number }>();
  for (let h = 0; h < 24; h++) {
    const label = `${String(h).padStart(2, '0')}h`;
    horaMap.set(label, { hora: label, faturamento: 0, pedidos: 0 });
  }
  paidOrders.forEach(o => {
    const d = new Date(o.date_created);
    const h = `${String(d.getHours()).padStart(2, '0')}h`;
    const cur = horaMap.get(h)!;
    cur.faturamento += o.total_amount;
    cur.pedidos += 1;
  });
  horaMap.forEach(v => vendasPorHora.push({ ...v, faturamento: Math.round(v.faturamento) }));

  // Top SKUs do dia
  const skuMap = new Map<string, { sku: string; title: string; vendas: number; faturamento: number }>();
  paidOrders.forEach(o => {
    o.items.forEach(item => {
      const key = item.sku || item.title?.slice(0, 30) || 'N/A';
      const cur = skuMap.get(key) || { sku: key, title: item.title, vendas: 0, faturamento: 0 };
      cur.vendas += item.quantity;
      cur.faturamento += item.unit_price * item.quantity;
      skuMap.set(key, cur);
    });
  });
  const topSkus = [...skuMap.values()]
    .map(x => ({ ...x, faturamento: Math.round(x.faturamento) }))
    .sort((a, b) => b.vendas - a.vendas)
    .slice(0, 10);

  // Últimos pedidos
  const ultimosPedidos = [...paidOrders]
    .sort((a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime())
    .slice(0, 15);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Vendas do dia em tempo real — Mercado Livre + Shopee"
      />

      {/* Status Bar */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={fetchOrders}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
        {lastRefresh && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" /> Última atualização: {lastRefresh}
          </span>
        )}
        {error && (
          <span className="text-xs text-[hsl(var(--vix-danger))] ml-auto">
            ⚠️ {error}
          </span>
        )}
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard title="Pedidos Hoje" value={formatNumber(totalPedidos)} icon={Package} delay={0} />
        <KpiCard title="Faturamento" value={formatBRL(totalFaturamento)} icon={DollarSign} delay={50} />
        <KpiCard title="Unidades Vendidas" value={formatNumber(totalVendas)} icon={ShoppingCart} delay={100} />
        <KpiCard title="Ticket Médio" value={formatBRL(ticketMedio)} icon={Receipt} delay={150} />
      </div>

      {orders.length === 0 && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-card border border-border rounded-xl">
          <Globe className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-sm mb-2">Nenhuma venda registrada hoje ainda.</p>
          <p className="text-muted-foreground text-xs">Verifique se as contas ML estão configuradas na tabela ml_accounts do Supabase.</p>
        </div>
      )}

      {orders.length > 0 && (
        <>
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Vendas por Hora */}
            <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
              <h3 className="text-foreground font-semibold mb-4">🕐 Vendas por Hora</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={vendasPorHora.filter(h => h.pedidos > 0 || parseInt(h.hora) <= new Date().getHours())}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number, name: string) => name === 'faturamento' ? formatBRL(v) : v} />
                  <Legend />
                  <Bar dataKey="faturamento" fill="#6366f1" name="Faturamento" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pedidos" fill="#22c55e" name="Pedidos" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Faturamento por Conta (Pie) */}
            {vendasPorConta.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
                <h3 className="text-foreground font-semibold mb-4">🏬 Faturamento por Conta</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={vendasPorConta} dataKey="value" nameKey="conta" cx="50%" cy="50%" outerRadius={90} label={({ conta, value }: any) => `${conta}: ${formatBRL(value)}`}>
                      {vendasPorConta.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatBRL(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Top SKUs */}
          {topSkus.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-6 mb-6 animate-fade-in">
              <h3 className="text-foreground font-semibold mb-4">🏆 Top Vendas do Dia (SKU)</h3>
              <ResponsiveContainer width="100%" height={Math.max(200, topSkus.length * 35)}>
                <BarChart data={topSkus} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="sku" type="category" tick={{ fontSize: 9 }} width={120} />
                  <Tooltip formatter={(v: number, name: string) => name === 'faturamento' ? formatBRL(v) : v} />
                  <Legend />
                  <Bar dataKey="vendas" fill="#22c55e" name="Qtd" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="faturamento" fill="#6366f1" name="Faturamento" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Últimos Pedidos */}
          <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
            <h3 className="text-foreground font-semibold mb-4">📋 Últimos Pedidos</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">Hora</th>
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">Conta</th>
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">Comprador</th>
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">Produto</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Qtd</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Valor</th>
                    <th className="text-center py-2 px-2 text-muted-foreground font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ultimosPedidos.map((o) => (
                    <tr key={o.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-2">{new Date(o.date_created).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="py-2 px-2 font-medium">{o.conta}</td>
                      <td className="py-2 px-2">{o.buyer}</td>
                      <td className="py-2 px-2 max-w-[200px] truncate" title={o.items.map(i => i.title).join(', ')}>
                        {o.items.map(i => i.sku || i.title?.slice(0, 30)).join(', ')}
                      </td>
                      <td className="py-2 px-2 text-right">{o.items.reduce((s, i) => s + i.quantity, 0)}</td>
                      <td className="py-2 px-2 text-right font-semibold text-[hsl(var(--vix-success))]">{formatBRL(o.total_amount)}</td>
                      <td className="py-2 px-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          o.status === 'paid' ? 'bg-green-500/10 text-green-500' :
                          o.status === 'cancelled' ? 'bg-red-500/10 text-red-500' :
                          'bg-yellow-500/10 text-yellow-500'
                        }`}>
                          {o.status === 'paid' ? 'Pago' : o.status === 'cancelled' ? 'Cancelado' : o.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
