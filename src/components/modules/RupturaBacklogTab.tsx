import { useMemo, useState, useEffect } from 'react';
import { Package, AlertTriangle, TrendingDown, DollarSign, Activity, History } from 'lucide-react';
import { KpiCard } from '@/components/shared/KpiCard';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import { formatNumber } from '@/lib/utils-vix';
import { supabase } from '@/integrations/supabase/client';
import { ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, AreaChart, Area, Legend } from 'recharts';

type Snap = {
  sku: string;
  conta: string;
  data_ref: string;
  quantidade: number;
  vmd_calculado: number;
  tiny_quantidade: number | null;
  em_transferencia: number;
  entrada_pendente: number;
  dias_ruptura_30d: number;
};

const LUCRO_PCT = 0.30; // margem média estimada de lucro

export function RupturaBacklogTab() {
  const { estoqueFullItems, estoqueTinyItems } = useSheetsData();
  const [snapshots, setSnapshots] = useState<Snap[]>([]);
  const [precoMedioSku, setPrecoMedioSku] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        // 1) Snapshots históricos (últimos 30d)
        const snapsResp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/read-external-snapshots`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({}),
          }
        );
        const snapsData = await snapsResp.json();
        if (snapsResp.ok && Array.isArray(snapsData?.snapshots)) {
          setSnapshots(snapsData.snapshots);
        }

        // 2) Preço médio real por SKU (últimos 30 dias de vendas)
        const date30 = new Date();
        date30.setDate(date30.getDate() - 30);
        const dateIni = date30.toISOString().split('T')[0];

        const { data: vendas } = await supabase
          .from('vendas_items')
          .select('sku, preco_unitario, valor_total, quantidade, data')
          .gte('data', dateIni)
          .limit(50000);

        const acc: Record<string, { val: number; qtd: number }> = {};
        for (const v of vendas || []) {
          const sku = String((v as any).sku || '').trim().toUpperCase();
          if (!sku) continue;
          const qtd = Number((v as any).quantidade) || 0;
          const preco =
            Number((v as any).preco_unitario) ||
            (qtd > 0 ? Number((v as any).valor_total) / qtd : 0);
          if (preco <= 0) continue;
          if (!acc[sku]) acc[sku] = { val: 0, qtd: 0 };
          acc[sku].val += preco * (qtd || 1);
          acc[sku].qtd += qtd || 1;
        }
        const map: Record<string, number> = {};
        for (const [sku, { val, qtd }] of Object.entries(acc)) {
          map[sku] = qtd > 0 ? val / qtd : 0;
        }
        setPrecoMedioSku(map);
      } catch (e) {
        console.error('[RupturaBacklog] erro:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  const precoDe = (sku: string) => {
    const k = sku.trim().toUpperCase();
    return precoMedioSku[k] || 0;
  };

  const analysis = useMemo(() => {
    // 1. Ineficiência operacional (Local > 0 e Full = 0)
    const ineficiencia = (estoqueFullItems || []).filter(full => {
      const sku = full.sku.trim().toUpperCase();
      const local = (estoqueTinyItems || []).find(t => t.sku.trim().toUpperCase() === sku);
      return Number(full.aptasParaVenda) <= 0 && Number(local?.quantidade) > 0;
    });

    // 2. Snapshot mais recente -> perda do dia
    const ultimoDia = snapshots.length
      ? snapshots.reduce((max, s) => (s.data_ref > max ? s.data_ref : max), snapshots[0].data_ref)
      : null;

    const snapsHoje = ultimoDia ? snapshots.filter(s => s.data_ref === ultimoDia) : [];
    const currentLoss = snapsHoje.reduce((acc, s) => {
      if (Number(s.quantidade) <= 0) {
        const vmd = Number(s.vmd_calculado) || 0;
        const preco = precoDe(s.sku);
        return acc + vmd * preco;
      }
      return acc;
    }, 0);

    // 3. Histórico diário: receita perdida real e contagem de rupturas
    const byDay = new Map<string, { receitaPerdida: number; rupturas: number }>();
    for (const s of snapshots) {
      const day = s.data_ref;
      const cur = byDay.get(day) || { receitaPerdida: 0, rupturas: 0 };
      if (Number(s.quantidade) <= 0) {
        cur.rupturas += 1;
        const vmd = Number(s.vmd_calculado) || 0;
        cur.receitaPerdida += vmd * precoDe(s.sku);
      }
      byDay.set(day, cur);
    }
    const chartData = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, v]) => ({
        name: name.slice(5), // MM-DD
        receitaPerdida: Math.round(v.receitaPerdida),
        lucroPerdido: Math.round(v.receitaPerdida * LUCRO_PCT),
        rupturas: v.rupturas,
      }));

    // 4. SKUs em ruptura no snapshot mais recente (com perda estimada)
    const rupturasHoje = snapsHoje
      .filter(s => Number(s.quantidade) <= 0)
      .map(s => ({
        sku: s.sku,
        conta: s.conta,
        vmd: Number(s.vmd_calculado) || 0,
        preco: precoDe(s.sku),
        perdaDia: (Number(s.vmd_calculado) || 0) * precoDe(s.sku),
        diasRuptura: Number(s.dias_ruptura_30d) || 0,
        entradaPendente: Number(s.entrada_pendente) || 0,
      }))
      .sort((a, b) => b.perdaDia - a.perdaDia);

    return { ineficiencia, currentLoss, chartData, rupturasHoje, ultimoDia };
  }, [estoqueFullItems, estoqueTinyItems, snapshots, precoMedioSku]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard
          title="Receita Perdida (Hoje)"
          value={`R$ ${formatNumber(analysis.currentLoss)}`}
          icon={DollarSign}
          subtitle={analysis.ultimoDia ? `Snap: ${analysis.ultimoDia}` : 'Sem snapshot'}
          valueColor="text-[hsl(var(--vix-danger))]"
          delay={0}
        />
        <KpiCard
          title="Lucro Perdido (Hoje)"
          value={`R$ ${formatNumber(analysis.currentLoss * LUCRO_PCT)}`}
          icon={TrendingDown}
          subtitle={`Estimativa ${Math.round(LUCRO_PCT * 100)}% margem`}
          valueColor="text-[hsl(var(--vix-danger))]"
          delay={100}
        />
        <KpiCard
          title="Ineficiência Operacional"
          value={String(analysis.ineficiencia.length)}
          icon={Activity}
          subtitle="Tem local, mas acabou no Full"
          valueColor="text-[hsl(var(--vix-warning))]"
          delay={200}
        />
        <KpiCard
          title="Status do Histórico"
          value={loading ? 'Carregando...' : snapshots.length > 0 ? `${snapshots.length} snaps` : 'Aguardando 1º Snap'}
          icon={History}
          subtitle={`Preços de ${Object.keys(precoMedioSku).length} SKUs`}
          delay={300}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Histórico de Receita Não Realizada */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-[hsl(var(--vix-danger))]" />
            Histórico de Receita Não Realizada (Ruptura)
          </h3>
          <div className="h-[250px]">
            {analysis.chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analysis.chartData}>
                  <defs>
                    <linearGradient id="colorLoss" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--vix-danger))" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(var(--vix-danger))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${v}`} />
                  <Tooltip
                    formatter={(v: any, n: any) =>
                      n === 'rupturas' ? [`${v} SKUs`, 'Rupturas'] : [`R$ ${formatNumber(Number(v))}`, n]
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Area
                    type="monotone"
                    name="Receita Perdida"
                    dataKey="receitaPerdida"
                    stroke="hsl(var(--vix-danger))"
                    fillOpacity={1}
                    fill="url(#colorLoss)"
                  />
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

        {/* Top SKUs em ruptura (último snap) */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[hsl(var(--vix-danger))]" />
            Top SKUs em Ruptura (último snap)
          </h3>
          <div className="space-y-2 max-h-[250px] overflow-y-auto pr-2">
            {analysis.rupturasHoje.length > 0 ? (
              analysis.rupturasHoje.slice(0, 30).map((r, i) => (
                <div
                  key={`${r.sku}-${r.conta}-${i}`}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border"
                >
                  <div>
                    <p className="text-xs font-mono font-bold text-primary">{r.sku}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {r.conta} · vMD {r.vmd.toFixed(1)} · R$ {formatNumber(r.preco)}
                      {r.entradaPendente > 0 && ` · Pendente ${r.entradaPendente}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-[hsl(var(--vix-danger))]">
                      -R$ {formatNumber(r.perdaDia)}/d
                    </p>
                    <p className="text-[10px] text-muted-foreground">{r.diasRuptura}d em ruptura</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-xs text-muted-foreground">Nenhum SKU em ruptura no último snapshot.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ineficiência Operacional (estoque local imobilizado) */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[hsl(var(--vix-warning))]" />
          Ineficiência Operacional (Estoque Local Imobilizado)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-2">
          {analysis.ineficiencia.length > 0 ? (
            analysis.ineficiencia.map(item => (
              <div
                key={`${item.sku}-${item.conta}`}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border"
              >
                <div>
                  <p className="text-xs font-mono font-bold text-primary">{item.sku}</p>
                  <p className="text-[10px] text-muted-foreground">{item.conta}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-[hsl(var(--vix-danger))]">Full: 0</p>
                  <p className="text-[10px] text-[hsl(var(--vix-success))]">
                    Local: {estoqueTinyItems?.find(t => t.sku === item.sku)?.quantidade || '?'}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full text-center py-8">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-xs text-muted-foreground">
                Parabéns! Não há imobilização de estoque local detectada.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
