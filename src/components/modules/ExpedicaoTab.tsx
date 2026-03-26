import { useState, useEffect, useMemo } from 'react';
import { Package, Truck, Clock, AlertTriangle, Loader2, RefreshCw, Layers } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { KpiCard } from '@/components/shared/KpiCard';
import { formatBRL } from '@/lib/utils-vix';

export interface Shipment {
  orderId: string;
  status: string;
  shippingStatus: string;
  logisticType: string;
  dateCreated: string;
  totalAmount: number;
  buyer: string;
  conta: string;
  accountId: string;
  plataforma: string;
  items: { title: string; sku: string; quantity: number; unitPrice: number }[];
  error?: string;
}

export function ExpedicaoTab() {
  const [loading, setLoading] = useState(false);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const fetchPendingShipments = async () => {
    setLoading(true);
    try {
      // Fetch from all 3 platforms in parallel
      const [mlRes, shopeeRes, tinyRes] = await Promise.allSettled([
        supabase.functions.invoke('mercado-livre', { body: { action: 'get_pending_shipments' } }),
        supabase.functions.invoke('shopee', { body: { action: 'get_pending_shipments' } }),
        supabase.functions.invoke('tiny', { body: { action: 'get_pending_shipments' } })
      ]);

      let all: Shipment[] = [];
      let errors = [];

      if (mlRes.status === 'fulfilled' && !mlRes.value.error) {
        const data = mlRes.value.data?.shipments || [];
        all = [...all, ...data.map((s: any) => ({ ...s, plataforma: 'ml' }))];
      } else {
        errors.push('Mercado Livre');
      }

      if (shopeeRes.status === 'fulfilled' && !shopeeRes.value.error) {
        const data = shopeeRes.value.data?.shipments || [];
        all = [...all, ...data.map((s: any) => ({ ...s, plataforma: 'shopee' }))];
      } else {
        errors.push('Shopee');
      }

      if (tinyRes.status === 'fulfilled' && !tinyRes.value.error) {
        const data = tinyRes.value.data?.shipments || [];
        all = [...all, ...data.map((s: any) => ({ ...s, plataforma: s.plataforma || 'tiny' }))];
      } else {
        errors.push('Tiny ERP');
      }

      setShipments(all);
      setLastSync(new Date());

      if (errors.length > 0) {
        toast.error(`Falha ao buscar algumas plataformas: ${errors.join(', ')}`);
      } else {
        toast.success(`Carregados ${all.length} pedidos pendentes.`);
      }
    } catch (err: any) {
      toast.error('Erro geral ao buscar expedições: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingShipments();
  }, []);

  // KPIs & Agrupamentos
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const stats = useMemo(() => {
    let flexPendentes = 0;
    let atrasados = 0;
    let coletaNormal = 0;
    let outrosMarketplaces = 0;

    const grupos = {
      atrasados: [] as Shipment[],
      flex: [] as Shipment[],
      coletaMl: [] as Shipment[],
      shopee: [] as Shipment[],
      outros: [] as Shipment[] // shein, amazon, tiny manual, etc
    };

    shipments.forEach(s => {
      // Ignora registros de erro devolvidos pelas functions
      if (s.error) return;

      const date = new Date(s.dateCreated);
      const isLate = date < todayStart;

      if (isLate) {
        atrasados++;
        grupos.atrasados.push(s);
        return; // se atrasado, entra na fila de prioridade máxima
      }

      if (s.plataforma === 'ml') {
        if (s.logisticType === 'cross_docking' || s.logisticType === 'custom') {
          flexPendentes++;
          grupos.flex.push(s);
        } else {
          coletaNormal++;
          grupos.coletaMl.push(s);
        }
      } else if (s.plataforma === 'shopee') {
        outrosMarketplaces++;
        grupos.shopee.push(s);
      } else {
        // Tiny, Shein, TikTok, etc
        outrosMarketplaces++;
        grupos.outros.push(s);
      }
    });

    return { flexPendentes, atrasados, coletaNormal, outrosMarketplaces, grupos, total: shipments.length - shipments.filter(s=>s.error).length };
  }, [shipments, todayStart]);

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
    } catch { return iso; }
  };

  const ShipmentTable = ({ title, icon: Icon, data, colorClass, emptyMsg }: any) => (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mb-6 animate-fade-in">
      <div className={`px-4 py-3 border-b border-border flex items-center justify-between ${colorClass}`}>
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Icon className="w-4 h-4" /> {title} ({data.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        {data.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{emptyMsg}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground w-32">Data / Hora</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground w-32">Pedido</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Comprador</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground w-48">Conta</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground w-40">Logística</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground w-32">Valor Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s: Shipment) => (
                <tr key={s.orderId} className="border-b border-border hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-foreground tracking-tight">{formatDate(s.dateCreated)}</td>
                  <td className="px-4 py-3 font-semibold text-primary font-mono text-xs">{s.orderId}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground truncate max-w-[200px]">{s.buyer}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[200px]" title={s.items.map(i => `${i.quantity}x ${i.sku || i.title}`).join(', ')}>
                      {s.items.length} item(s) • {s.items.map(i => i.sku || 'N/A').join(', ')}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-muted text-foreground border border-border">
                      {s.conta.replace('Tiny | ', '')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground capitalize">
                    {s.logisticType.replace(/_/g, ' ')}
                    {s.shippingStatus && s.shippingStatus !== 'pending' && s.shippingStatus !== 'aberto' && s.shippingStatus !== 'READY_TO_SHIP' && (
                      <span className="ml-1 text-[10px] opacity-60">({s.shippingStatus})</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">{formatBRL(s.totalAmount || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Painel de Expedição Central</h2>
          <p className="text-sm text-muted-foreground">Monitoramento em tempo real de pedidos aguardando faturamento e envio.</p>
        </div>
        <div className="flex items-center gap-4">
          {lastSync && (
            <span className="text-xs text-muted-foreground hidden md:inline-block">
              Atualizado às {lastSync.toLocaleTimeString()}
            </span>
          )}
          <button 
            onClick={fetchPendingShipments}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Buscando API...' : 'Atualizar Pedidos'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard title="Total Pendente" value={stats.total.toString()} icon={Layers} delay={0} />
        <KpiCard title="Atrasados" value={stats.atrasados.toString()} icon={AlertTriangle} delay={50} valueColor="text-[hsl(var(--vix-danger))]" />
        <KpiCard title="ML Flex (Hoje)" value={stats.flexPendentes.toString()} icon={Clock} delay={100} valueColor="text-[hsl(var(--vix-warning))]" />
        <KpiCard title="ML Coleta/Correios" value={stats.coletaNormal.toString()} icon={Truck} delay={150} />
        <KpiCard title="Outros (Shopee/Tiny)" value={stats.outrosMarketplaces.toString()} icon={Package} delay={200} />
      </div>

      {/* Tabelas de Agrupamento */}
      <div className="mt-6 space-y-6">
        {stats.grupos.atrasados.length > 0 && (
          <ShipmentTable 
            title="Atrasados (Criados ontem ou antes)" 
            icon={AlertTriangle} 
            data={stats.grupos.atrasados} 
            colorClass="bg-[hsl(var(--vix-danger)/0.1)] text-[hsl(var(--vix-danger))] border-[hsl(var(--vix-danger)/0.2)]"
            emptyMsg="Ótimo! Nenhum pedido atrasado."
          />
        )}

        <ShipmentTable 
          title="Mercado Livre Flex / Same Day" 
          icon={Clock} 
          data={stats.grupos.flex} 
          colorClass="bg-[hsl(45,100%,50%,0.1)] text-[#b38600] dark:text-[#fbbc04] border-[hsl(45,100%,50%,0.2)]"
          emptyMsg="Nenhuma entrega Flex para hoje pendente."
        />

        <div className="grid lg:grid-cols-2 gap-6">
          <ShipmentTable 
            title="Mercado Livre Coleta (Normal)" 
            icon={Truck} 
            data={stats.grupos.coletaMl} 
            colorClass="bg-muted text-foreground"
            emptyMsg="Nenhum pacote normal aguardando coleta ML."
          />
          <ShipmentTable 
            title="Shopee" 
            icon={Package} 
            data={stats.grupos.shopee} 
            colorClass="bg-[hsl(16,100%,60%,0.1)] text-[hsl(16,100%,50%)] border-[hsl(16,100%,60%,0.2)]"
            emptyMsg="Nenhum pedido da Shopee pronto para envio."
          />
        </div>

        {stats.grupos.outros.length > 0 && (
          <ShipmentTable 
            title="Outros Canais (Tiny, Shein, TikTok, Americanas)" 
            icon={Layers} 
            data={stats.grupos.outros} 
            colorClass="bg-[hsl(200,100%,50%,0.1)] text-[hsl(200,80%,50%)] border-[hsl(200,100%,50%,0.2)]"
            emptyMsg="Nenhum pedido pendente de outros canais via Tiny."
          />
        )}
      </div>
    </div>
  );
}
