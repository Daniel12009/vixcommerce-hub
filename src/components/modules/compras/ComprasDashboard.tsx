import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { AlertTriangle, TrendingUp, PackageSearch, DollarSign, Box, Target, Combine, BarChart3 } from 'lucide-react';
import type { EstimativaCompraItem } from '@/lib/types';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, 
  CartesianGrid, XAxis, YAxis, BarChart, Bar, Legend,
  ScatterChart, Scatter, ZAxis, AreaChart, Area 
} from 'recharts';

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

  // Pegar os itens mais críticos: Curva A/B e com ruptura próxima
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

  // NOVOS DADOS PARA GRÁFICOS AVANÇADOS

  // 1. Rentabilidade por Categoria (Top 8)
  const dadosCategoria = useMemo(() => {
    const map = new Map<string, { categoria: string; investimento: number; lucroEsperado: number; cbm: number }>();
    data.forEach(d => {
      const cat = d.categoria?.trim() || 'Sem Categoria';
      const inv = d.custoTotalPedido || 0;
      const lucro = (d.cbmTotal || 0) * (d.lucroPorCBM || 0);
      const cb = d.cbmTotal || 0;
      
      if (!map.has(cat)) map.set(cat, { categoria: cat, investimento: 0, lucroEsperado: 0, cbm: 0 });
      const old = map.get(cat)!;
      old.investimento += inv;
      old.lucroEsperado += lucro;
      old.cbm += cb;
    });
    return Array.from(map.values())
      .sort((a,b) => b.investimento - a.investimento)
      .slice(0, 8);
  }, [data]);

  // 2. Scatter CBM Eficiência (Top 50 por investimento)
  const dadosScatterCBM = useMemo(() => {
    return data
      .filter(d => d.cbmTotal > 0 && d.custoTotalPedido > 0)
      .map(d => ({
        sku: d.sku,
        cbmTotal: Number(d.cbmTotal.toFixed(2)),
        lucroCBM: Number((d.lucroPorCBM || 0).toFixed(2)),
        investimento: Math.round(d.custoTotalPedido),
        categoria: d.categoria
      }))
      .sort((a,b) => b.investimento - a.investimento)
      .slice(0, 50);
  }, [data]);

  // 3. Demanda S&OP (Jan-Abr)
  const dadosProjecaoSOP = useMemo(() => {
    let jan = 0, fev = 0, mar = 0, abr = 0;
    data.forEach(d => {
      jan += typeof d.janSOP === 'number' ? d.janSOP : 0;
      fev += typeof d.fevSOP === 'number' ? d.fevSOP : 0;
      mar += typeof d.marSOP === 'number' ? d.marSOP : 0;
      abr += typeof d.abrSOP === 'number' ? d.abrSOP : 0;
    });
    return [
      { mes: 'Janeiro', demanda: jan },
      { mes: 'Fevereiro', demanda: fev },
      { mes: 'Março', demanda: mar },
      { mes: 'Abril', demanda: abr },
    ];
  }, [data]);


  return (
    <div className="space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Premium KPIs - Gradient & Shadow effects */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <Card className="relative overflow-hidden group hover:shadow-lg transition-all border-none bg-gradient-to-br from-indigo-500/10 via-background to-background">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
          <div className="p-5 flex items-start justify-between relative z-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Cenário Analisado</p>
              <h3 className="text-3xl font-black text-foreground tracking-tight">{metrics.totalSKUs} <span className="text-sm font-medium text-muted-foreground">SKUs</span></h3>
              <p className="text-xs text-indigo-500 font-medium mt-2 flex items-center gap-1">
                Base atual de dados S&OP
              </p>
            </div>
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl shadow-lg shadow-indigo-500/20 text-white">
              <Box className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card className="relative overflow-hidden group hover:shadow-lg transition-all border-none bg-gradient-to-br from-emerald-500/10 via-background to-background">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
          <div className="p-5 flex items-start justify-between relative z-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Investimento Projetado</p>
              <h3 className="text-3xl font-black text-foreground tracking-tight">{formatter.format(metrics.totalInvestimentoProposto).split(',')[0]}<span className="text-lg text-muted-foreground">,{formatter.format(metrics.totalInvestimentoProposto).split(',')[1]}</span></h3>
              <p className="text-xs text-emerald-500 font-medium mt-2 flex items-center gap-1">
                Sugestão de Pedido Final
              </p>
            </div>
            <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg shadow-emerald-500/20 text-white">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card className="relative overflow-hidden group hover:shadow-lg transition-all border-none bg-gradient-to-br from-amber-500/10 via-background to-background">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
          <div className="p-5 flex items-start justify-between relative z-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Volume de Importação</p>
              <h3 className="text-3xl font-black text-foreground tracking-tight">{metrics.cbmGeral.toFixed(1)} <span className="text-sm font-medium text-muted-foreground">m³ (CBM)</span></h3>
              <p className="text-xs text-amber-500 font-medium mt-2 flex items-center gap-1">
                Espaço projetado em Containers
              </p>
            </div>
            <div className="p-3 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl shadow-lg shadow-amber-500/20 text-white">
              <PackageSearch className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card className="relative overflow-hidden group hover:shadow-lg transition-all border-none bg-gradient-to-br from-rose-500/10 via-background to-background">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
          <div className="p-5 flex items-start justify-between relative z-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Alerta de Ruptura</p>
              <h3 className="text-3xl font-black text-rose-500 tracking-tight">{metrics.itensBaixosEmOnHand} <span className="text-sm font-medium text-rose-500/70">SKUs</span></h3>
              <p className="text-xs text-rose-600 font-medium mt-2 flex items-center gap-1">
                Abaixo de 30 un. (Estoque)
              </p>
            </div>
            <div className="p-3 bg-gradient-to-br from-rose-500 to-red-600 rounded-xl shadow-lg shadow-rose-500/20 text-white animate-pulse">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* DASHBOARD MEIO: Tabela de Críticos e Gráfico ABC */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        <div className="xl:col-span-1 flex flex-col gap-6">
          <Card className="p-6 flex-1 border-none shadow-md bg-card/50 backdrop-blur-sm">
            <h3 className="text-sm font-bold text-foreground mb-1 outline-none uppercase tracking-wider">Investimento Inteligente</h3>
            <p className="text-xs text-muted-foreground mb-6">Distribuição Financeira por Curva ABC</p>
            <div className="h-[220px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Curva A', value: data.filter(d => d.curvaABC === 'A').reduce((acc, curr) => acc + curr.custoTotalPedido, 0) },
                      { name: 'Curva B', value: data.filter(d => d.curvaABC === 'B').reduce((acc, curr) => acc + curr.custoTotalPedido, 0) },
                      { name: 'Curva C', value: data.filter(d => d.curvaABC === 'C' || !d.curvaABC).reduce((acc, curr) => acc + curr.custoTotalPedido, 0) },
                    ]}
                    cx="50%" cy="50%" innerRadius={70} outerRadius={90} paddingAngle={2} dataKey="value" stroke="none"
                  >
                    <Cell fill="#10B981" className="drop-shadow-sm hover:opacity-80 transition-opacity" />
                    <Cell fill="#3B82F6" className="drop-shadow-sm hover:opacity-80 transition-opacity" />
                    <Cell fill="#64748B" className="drop-shadow-sm hover:opacity-80 transition-opacity" />
                  </Pie>
                  <RechartsTooltip 
                    formatter={(value: number) => formatter.format(value)}
                    contentStyle={{ backgroundColor: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                    itemStyle={{ color: '#fff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-5 mt-4 text-xs font-semibold text-muted-foreground">
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div> Curva A</div>
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"></div> Curva B</div>
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-slate-500"></div> Curva C</div>
              </div>
            </div>
          </Card>
        </div>

        {/* Top 10 Tabela Premium */}
        <div className="xl:col-span-2 flex flex-col">
          <Card className="flex-1 p-0 overflow-hidden border-none shadow-md bg-card/50 backdrop-blur-sm">
            <div className="p-6 pb-4 border-b border-border/50 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-foreground mb-1 outline-none uppercase tracking-wider flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-rose-500" /> Plantão de Ruptura (Curva A/B)
                </h3>
                <p className="text-xs text-muted-foreground">SKUs mais críticos com baixo Estoque de Segurança</p>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider bg-muted/20">
                  <tr>
                    <th className="px-6 py-4">Produto / SKU</th>
                    <th className="px-6 py-4 text-center">Curva</th>
                    <th className="px-6 py-4 text-right">Velocidade Venda</th>
                    <th className="px-6 py-4 text-right">Autonomia</th>
                    <th className="px-6 py-4 text-right">Ação Sugerida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {itensCriticos.map((item, i) => (
                    <tr key={i} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-foreground group-hover:text-primary transition-colors">{item.sku}</span>
                          <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">{item.categoria || 'Sem categoria'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          item.curvaABC === 'A' ? 'bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20' : 'bg-blue-500/10 text-blue-500 ring-1 ring-blue-500/20'
                        }`}>
                          Curva {item.curvaABC || 'C'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-semibold text-foreground">{item.mediaVendaDiaria?.toFixed(1) || '0'}</span>
                        <span className="text-[10px] text-muted-foreground ml-1 block">un/dia</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col items-end">
                          <span className={`font-bold tabular-nums ${
                            (typeof item.diasParaRuptura === 'number' && item.diasParaRuptura <= 15) ? 'text-rose-500' : 'text-amber-500'
                          }`}>
                            {typeof item.diasParaRuptura === 'number' ? Math.round(item.diasParaRuptura) : item.diasParaRuptura} dias
                          </span>
                          <span className="text-[10px] text-muted-foreground">Estoque: {item.onHand} un</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex flex-col items-end">
                          <span className="font-black tabular-nums text-emerald-500 flex items-center gap-1">
                            +{item.pedidoSugerido} <span className="text-[10px] text-emerald-500/70">unid.</span>
                          </span>
                          <span className="text-[10px] text-muted-foreground mt-0.5">
                            {formatter.format(item.custoTotalPedido || 0)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {itensCriticos.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-10">
                        <div className="inline-flex flex-col items-center justify-center text-muted-foreground">
                          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
                            <Box className="w-6 h-6 text-emerald-500" />
                          </div>
                          <p className="text-sm font-medium text-foreground">Estoque Saudável</p>
                          <p className="text-xs">Nenhum item da Curva A/B em risco de ruptura eminente.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

      </div>

      {/* DASHBOARD BOTTOM: NOVOS GRÁFICOS ANALÍTICOS */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
        
        {/* Gráfico de Rentabilidade por Categoria */}
        <Card className="p-6 border-none shadow-md bg-card/50 backdrop-blur-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground mb-1 outline-none uppercase tracking-wider flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-500" /> Investimento vs Lucro Projetado
              </h3>
              <p className="text-xs text-muted-foreground">Top Categorias (R$)</p>
            </div>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosCategoria} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="categoria" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(val) => `R$${(val/1000).toFixed(0)}k`} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <RechartsTooltip 
                  formatter={(value: number, name: string) => [formatter.format(value), name === 'investimento' ? 'Investimento' : 'Lucro Esperado']}
                  contentStyle={{ backgroundColor: 'rgba(15,23,42,0.9)', border: 'none', borderRadius: '8px', color: '#fff' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="investimento" name="Investimento" fill="#3B82F6" radius={[4,4,0,0]} barSize={20} />
                <Bar dataKey="lucroEsperado" name="Lucro Esperado" fill="#10B981" radius={[4,4,0,0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Gráfico Scatter de CBM */}
        <Card className="p-6 border-none shadow-md bg-card/50 backdrop-blur-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground mb-1 outline-none uppercase tracking-wider flex items-center gap-2">
                <Target className="w-4 h-4 text-amber-500" /> Eficiência de Importação (CBM)
              </h3>
              <p className="text-xs text-muted-foreground">Volume(m³) vs Rentabilidade(R$/m³) - Top 50 SKUs</p>
            </div>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis type="number" dataKey="cbmTotal" name="CBM" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}m³`} />
                <YAxis type="number" dataKey="lucroCBM" name="Lucro/CBM" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${v}`} />
                <ZAxis type="number" dataKey="investimento" range={[60, 400]} name="Investimento (R$)" />
                <RechartsTooltip 
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg shadow-xl text-xs space-y-1">
                          <p className="font-bold text-white mb-2">{d.sku}</p>
                          <p className="text-slate-300">Volume: <span className="font-semibold text-amber-400">{d.cbmTotal} m³</span></p>
                          <p className="text-slate-300">Lucratividade: <span className="font-semibold text-emerald-400">{formatter.format(d.lucroCBM)}/m³</span></p>
                          <p className="text-slate-300">Investimento: <span className="font-semibold text-blue-400">{formatter.format(d.investimento)}</span></p>
                        </div>
                      )
                    }
                    return null;
                  }}
                />
                <Scatter data={dadosScatterCBM} fill="#F59E0B" fillOpacity={0.6} stroke="#D97706" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>

      </div>

      <div className="grid grid-cols-1 mt-6">
        <Card className="p-6 border-none shadow-md bg-card/50 backdrop-blur-sm">
          <div className="mb-6">
            <h3 className="text-sm font-bold text-foreground mb-1 outline-none uppercase tracking-wider flex items-center gap-2">
              <Combine className="w-4 h-4 text-purple-500" /> Projeção de Demanda S&OP
            </h3>
            <p className="text-xs text-muted-foreground">Volume agregado de previsão estatística de vendas (Unidades)</p>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dadosProjecaoSOP} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorDemanda" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <RechartsTooltip 
                  formatter={(value: number) => [`${value} unidades`, 'Projeção S&OP']}
                  contentStyle={{ backgroundColor: 'rgba(15,23,42,0.9)', border: 'none', borderRadius: '8px', color: '#fff' }}
                />
                <Area type="monotone" dataKey="demanda" stroke="#8B5CF6" strokeWidth={3} fillOpacity={1} fill="url(#colorDemanda)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
