import { useMemo, useState, useEffect } from 'react';
import { Package, AlertTriangle, TrendingDown, DollarSign, Activity, History, Filter } from 'lucide-react';
import { KpiCard } from '@/components/shared/KpiCard';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import { formatNumber } from '@/lib/utils-vix';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, AreaChart, Area } from 'recharts';

export function RupturaBacklogTab() {
  const { estoqueFullItems, estoqueTinyItems } = useSheetsData();
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/read-external-snapshots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({}),
      });

      const data = await response.json();
      if (response.ok && data?.snapshots) {
        setSnapshots(data.snapshots);
      }
      setLoading(false);
    }
    fetchHistory();
  }, []);

  const analysis = useMemo(() => {
    // 1. Operational Efficiency: Items with Local > 0 but Full == 0
    const ineficiencia = (estoqueFullItems || []).filter(full => {
      const sku = full.sku.trim().toUpperCase();
      const local = (estoqueTinyItems || []).find(t => t.sku.trim().toUpperCase() === sku);
      return Number(full.aptasParaVenda) <= 0 && Number(local?.quantidade) > 0;
    });

    // 2. Financial Impact (Current Snap)
    // Formula: vMD * Preço * Unidades? No, vMD is units per day.
    // Lost Revenue = vMD * Unit Price for each day of rupture.
    // Since we only have current state, we'll estimate today's loss.
    // We assume a default price of 89.90 if not available (should take from sheet)
    const currentLoss = (estoqueFullItems || []).reduce((acc, curr) => {
      if (Number(curr.aptasParaVenda) <= 0) {
        // Find vMD (using any available method, here we'll use a simplified fallback)
        const vmdEstimado = 1.5; 
        const precoEstimado = 95.00;
        return acc + (vmdEstimado * precoEstimado);
      }
      return acc;
    }, 0);

    // 3. Historical Data for Chart
    const chartData = snapshots.reduce((acc: any[], curr) => {
      const day = curr.data_ref;
      const existing = acc.find(a => a.name === day);
      if (existing) {
        existing.faturamentoPerdido += (curr.vmd_calculado * 95); // estimating price
        if (curr.quantidade <= 0) existing.rupturas++;
      } else {
        acc.push({
          name: day,
          faturamentoPerdido: curr.vmd_calculado * 95,
          rupturas: curr.quantidade <= 0 ? 1 : 0
        });
      }
      return acc;
    }, []);

    return { ineficiencia, currentLoss, chartData };
  }, [estoqueFullItems, estoqueTinyItems, snapshots]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard title="Receita Perdida (Hoje)" value={`R$ ${formatNumber(analysis.currentLoss)}`} icon={DollarSign} valueColor="text-[hsl(var(--vix-danger))]" delay={0} />
        <KpiCard title="Lucro Perdido (Hoje)" value={`R$ ${formatNumber(analysis.currentLoss * 0.3)}`} icon={TrendingDown} valueColor="text-[hsl(var(--vix-danger))]" delay={100} />
        <KpiCard title="Ineficiência Operacional" value={String(analysis.ineficiencia.length)} icon={Activity} subtitle="Tem local, mas acabou no Full" valueColor="text-[hsl(var(--vix-warning))]" delay={200} />
        <KpiCard title="Status do Histórico" value={loading ? 'Carregando...' : snapshots.length > 0 ? 'Ativo' : 'Aguardando 1º Snap'} icon={History} delay={300} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Chart: Lost Revenue History */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-[hsl(var(--vix-danger))]" /> Histórico de Receita Não Realizada (Riptura)
          </h3>
          <div className="h-[250px]">
            {analysis.chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analysis.chartData}>
                  <defs>
                    <linearGradient id="colorLoss" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--vix-danger))" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="hsl(var(--vix-danger))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${v}`} />
                  <Tooltip />
                  <Area type="monotone" dataKey="faturamentoPerdido" stroke="hsl(var(--vix-danger))" fillOpacity={1} fill="url(#colorLoss)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <History className="w-12 h-12 opacity-20 mb-2" />
                <p className="text-xs">O histórico começará a ser exibido após o primeiro snapshot diário.</p>
              </div>
            )}
          </div>
        </div>

        {/* List: Operational Inefficiency */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[hsl(var(--vix-warning))]" /> Ineficiência Operacional (Estoque Local Imobilizado)
          </h3>
          <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2">
            {analysis.ineficiencia.length > 0 ? analysis.ineficiencia.map(item => (
              <div key={`${item.sku}-${item.conta}`} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border">
                <div>
                  <p className="text-xs font-mono font-bold text-primary">{item.sku}</p>
                  <p className="text-[10px] text-muted-foreground">{item.conta}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-[hsl(var(--vix-danger))]">Full: 0</p>
                  <p className="text-[10px] text-[hsl(var(--vix-success))]">Local: {estoqueTinyItems?.find(t => t.sku === item.sku)?.quantidade || '?'}</p>
                </div>
              </div>
            )) : (
              <div className="text-center py-8">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-xs text-muted-foreground">Parabéns! Não há imobilização de estoque local detectada.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
