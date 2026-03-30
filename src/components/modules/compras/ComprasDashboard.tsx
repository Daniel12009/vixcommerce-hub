import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { AlertTriangle, TrendingUp, PackageSearch, DollarSign, Box } from 'lucide-react';
import type { EstimativaCompraItem } from '@/lib/types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, CartesianGrid, XAxis, YAxis, BarChart, Bar } from 'recharts';

interface ComprasDashboardProps {
  data: EstimativaCompraItem[];
}

export function ComprasDashboard({ data }: ComprasDashboardProps) {

  // Mapeamento e cálculos macro
  const metrics = useMemo(() => {
    let custoTotal = 0;
    let cbmGeral = 0;
    let lucroGeral = 0;
    let itensBaixosEmOnHand = 0;
    let totalInvestimentoProposto = 0;

    data.forEach(item => {
      custoTotal += item.custoProduto * item.onHand;
      if (item.onHand < 30) itensBaixosEmOnHand++;
      
      const pedidoReal = item.pedidoSugerido > 0 ? item.pedidoSugerido : 0;
      cbmGeral += item.cbmTotal;
      totalInvestimentoProposto += item.custoTotalPedido || 0;
    });

    return {
      custoTotal,
      cbmGeral,
      itensBaixosEmOnHand,
      totalInvestimentoProposto,
      totalSKUs: data.length
    };
  }, [data]);

  const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  // Pegar os itens mais críticos: Curva A e com ruptura próxima (ordem crescente de dias)
  const itensCriticos = useMemo(() => {
    return [...data]
      .filter(i => {
        const dias = typeof i.diasParaRuptura === 'number' ? i.diasParaRuptura : 999;
        return (i.curvaABC === 'A' || i.curvaABC === 'B') && dias < 60;
      })
      .sort((a, b) => {
        const diasA = typeof a.diasParaRuptura === 'number' ? a.diasParaRuptura : 999;
        const diasB = typeof b.diasParaRuptura === 'number' ? b.diasParaRuptura : 999;
        return diasA - diasB;
      })
      .slice(0, 10);
  }, [data]);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center gap-4 border-l-4 border-l-blue-500">
          <div className="p-3 bg-blue-500/10 rounded-lg text-blue-500">
            <Box className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">SKUs Analisados</p>
            <h3 className="text-2xl font-bold">{metrics.totalSKUs}</h3>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-4 border-l-4 border-l-emerald-500">
          <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-500">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Pedido Total Suposto</p>
            <h3 className="text-2xl font-bold">{formatter.format(metrics.totalInvestimentoProposto)}</h3>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-4 border-l-4 border-l-yellow-500">
          <div className="p-3 bg-yellow-500/10 rounded-lg text-yellow-500">
            <PackageSearch className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Volume CBM Global</p>
            <h3 className="text-2xl font-bold">{metrics.cbmGeral.toFixed(2)} m³</h3>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-4 border-l-4 border-l-red-500">
          <div className="p-3 bg-red-500/10 rounded-lg text-red-500">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Baixo Estoque ({"<30"} un)</p>
            <h3 className="text-2xl font-bold text-red-500">{metrics.itensBaixosEmOnHand} SKUs</h3>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Gráficos e Distribuição */}
        <div className="xl:col-span-2 space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              TOP 10 Itens Críticos (Curva A/B c/ Baixa de Dias)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 rounded-tl-lg">SKU / Categoria</th>
                    <th className="px-4 py-3">ABC</th>
                    <th className="px-4 py-3 text-right">Média Dia</th>
                    <th className="px-4 py-3 text-right">OnHand</th>
                    <th className="px-4 py-3 text-right">Dias p/ Ruptura</th>
                    <th className="px-4 py-3 text-right rounded-tr-lg">Pedido Sugerido</th>
                  </tr>
                </thead>
                <tbody>
                  {itensCriticos.map((item, i) => (
                    <tr key={i} className="border-b last:border-0 border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 max-w-[200px] truncate font-medium" title={item.categoria}>
                        {item.sku}
                        <br/><span className="text-xs text-muted-foreground font-normal">{item.categoria}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          item.curvaABC === 'A' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'
                        }`}>
                          {item.curvaABC || 'C'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{item.mediaVendaDiaria.toFixed(1)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{item.onHand}</td>
                      <td className="px-4 py-3 text-right font-medium text-red-400">
                        {typeof item.diasParaRuptura === 'number' ? Math.round(item.diasParaRuptura) : item.diasParaRuptura} d
                      </td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums text-emerald-400">
                        {item.pedidoSugerido}
                      </td>
                    </tr>
                  ))}
                  {itensCriticos.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-6 text-muted-foreground">
                        Nenhum item crítico A/B próximo a ruptura. Uhull 🎉
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Resumo Lateral */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-bold mb-4">Investimento por Curva ABC</h3>
            <div className="h-[250px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Curva A', value: data.filter(d => d.curvaABC === 'A').reduce((acc, curr) => acc + curr.custoTotalPedido, 0) },
                      { name: 'Curva B', value: data.filter(d => d.curvaABC === 'B').reduce((acc, curr) => acc + curr.custoTotalPedido, 0) },
                      { name: 'Curva C', value: data.filter(d => d.curvaABC === 'C' || !d.curvaABC).reduce((acc, curr) => acc + curr.custoTotalPedido, 0) },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    <Cell fill="#10B981" />
                    <Cell fill="#3B82F6" />
                    <Cell fill="#64748B" />
                  </Pie>
                  <RechartsTooltip 
                    formatter={(value: number) => formatter.format(value)}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-emerald-500"></div> Curva A</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-blue-500"></div> Curva B</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-slate-500"></div> Curva C</div>
              </div>
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}
