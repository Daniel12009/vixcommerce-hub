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
  items?: { sku?: string; title?: string; quantity: number }[];
  error?: string;
}

const PROPRIO_BUYERS = ['MONACO METAIS', 'GONTAREK'];


// Module-level cache to survive tab changes within the same page session
let cachedShipments: Shipment[] | null = null;
let lastSyncTime: Date | null = null;
let isFetchingShipments = false;
let fetchPromise: Promise<void> | null = null;

function getShippingDeadline(dateStr: string, plataforma: string, logisticType: string): Date {
  const d = new Date(dateStr);
  const dayOfWeek = d.getDay(); // 0 is Sunday
  const hour = d.getHours();
  
  let cutoffHour = 11;
  if (plataforma === 'shopee') {
    const logStr = (logisticType || '').toLowerCase();
    if (logStr.includes('diret')) { // e.g. "shopee direta"
      cutoffHour = 12;
    }
  }

  const isBeforeCutoff = hour < cutoffHour;

  const deadline = new Date(d);
  deadline.setHours(23, 59, 59, 999);

  let daysToAdd = 0;
  if (dayOfWeek === 0) { // Sunday
    daysToAdd = 2; // Limit: Tuesday
  } else if (dayOfWeek === 1) { // Monday
    daysToAdd = 1; // Limit: Tuesday
  } else if (dayOfWeek === 2) { // Tuesday
    daysToAdd = isBeforeCutoff ? 0 : 1; // < cutoff: Tuesday, > cutoff: Wednesday
  } else if (dayOfWeek === 3) { // Wednesday
    daysToAdd = isBeforeCutoff ? 0 : 1;
  } else if (dayOfWeek === 4) { // Thursday
    daysToAdd = isBeforeCutoff ? 0 : 1;
  } else if (dayOfWeek === 5) { // Friday
    daysToAdd = isBeforeCutoff ? 0 : 3; // > cutoff Limit: Monday
  } else if (dayOfWeek === 6) { // Saturday
    daysToAdd = 2; // Limit: Monday
  }

  deadline.setDate(deadline.getDate() + daysToAdd);
  return deadline;
}

export function ExpedicaoTab() {
  const [loading, setLoading] = useState(false);
  const [shipments, setShipments] = useState<Shipment[]>(cachedShipments || []);
  const [lastSync, setLastSync] = useState<Date | null>(lastSyncTime);

  const fetchPendingShipments = async (force = false) => {
    if (!force && cachedShipments && lastSyncTime && (new Date().getTime() - lastSyncTime.getTime() < 5 * 60 * 1000)) {
      // Use cached if less than 5 mins old
      setShipments(cachedShipments);
      setLastSync(lastSyncTime);
      return;
    }

    if (isFetchingShipments && fetchPromise) {
      setLoading(true);
      await fetchPromise;
      setShipments(cachedShipments || []);
      setLastSync(lastSyncTime);
      setLoading(false);
      return;
    }

    isFetchingShipments = true;
    setLoading(true);

    fetchPromise = (async () => {
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

        cachedShipments = all;
        lastSyncTime = new Date();
        setShipments(all);
        setLastSync(lastSyncTime);

        if (force) {
          if (errors.length > 0) {
            toast.error(`Falha ao buscar: ${errors.join(', ')}`);
          } else {
            toast.success(`Carregados ${all.length} pedidos.`);
          }
        }
      } catch (err: any) {
        if (force) toast.error('Erro ao buscar expedições: ' + err.message);
      } finally {
        isFetchingShipments = false;
        fetchPromise = null;
        setLoading(false);
      }
    })();
  };

  useEffect(() => {
    if (!cachedShipments) {
      fetchPendingShipments(false);
    }
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
      drop: [] as Shipment[],
      atrasados: [] as Shipment[],
      flex: [] as Shipment[],
      coletaMl: [] as Shipment[],
      shopee: [] as Shipment[],
      outros: [] as Shipment[] // shein, amazon, tiny manual, etc
    };

    let dropCount = 0;

    shipments.forEach(s => {
      // Ignora registros de erro devolvidos pelas functions
      if (s.error) return;

      const deadline = getShippingDeadline(s.dateCreated, s.plataforma, s.logisticType);
      const isLate = todayStart > deadline;

      const lowerConta = (s.conta || '').toLowerCase();
      const buyerName = (s.buyer || '').toUpperCase();
      const isOwnBuyer = PROPRIO_BUYERS.some(b => buyerName.includes(b));
      
      let isDrop = false;
      // Only apply Dropshipping logic to Tiny / Non-standard Marketplaces
      if (s.plataforma !== 'ml' && s.plataforma !== 'shopee') {
        if (lowerConta.includes('thiago') || lowerConta.includes('via flix') || lowerConta.includes('viaflix')) {
          isDrop = true;
        } else if (buyerName.length > 0 && !isOwnBuyer) {
          isDrop = true;
        }
      }

      if (isDrop) {
        dropCount++;
        grupos.drop.push(s);
        return; // Drop orders have their own dedicated box
      }

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

    return { flexPendentes, atrasados, coletaNormal, outrosMarketplaces, dropCount, grupos, total: shipments.length - shipments.filter(s=>s.error).length };
  }, [shipments, todayStart]);

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
    } catch { return iso; }
  };

  const renderPlatformBadge = (plataforma: string) => {
    const p = (plataforma || '').toLowerCase();
    if (p === 'ml') return <span className="px-2 py-1 rounded bg-[#FFE600]/20 text-[#B3A100] dark:text-[#FFE600] font-bold text-[10px] uppercase tracking-wider border border-[#FFE600]/30 flex w-fit items-center gap-1"><Package className="w-3 h-3"/> Mercado Livre</span>;
    if (p === 'shopee') return <span className="px-2 py-1 rounded bg-[#EE4D2D]/10 text-[#EE4D2D] font-bold text-[10px] uppercase tracking-wider border border-[#EE4D2D]/20 flex w-fit items-center gap-1"><Package className="w-3 h-3"/> Shopee</span>;
    if (p === 'tiny') return <span className="px-2 py-1 rounded bg-[#0055FF]/10 text-[#0055FF] font-bold text-[10px] uppercase tracking-wider border border-[#0055FF]/20 flex w-fit items-center gap-1"><Layers className="w-3 h-3"/> Tiny Vendas</span>;
    if (p === 'shein') return <span className="px-2 py-1 rounded bg-black/10 dark:bg-white/10 text-black dark:text-white font-bold text-[10px] uppercase tracking-wider border border-black/20 dark:border-white/20 flex w-fit items-center gap-1">Shein</span>;
    if (p === 'tiktok') return <span className="px-2 py-1 rounded bg-[#00F2FE]/10 text-[#008C9E] dark:text-[#00F2FE] font-bold text-[10px] uppercase tracking-wider border border-[#00F2FE]/20 flex w-fit items-center gap-1">TikTok</span>;
    
    return <span className="px-2 py-1 rounded bg-muted text-muted-foreground font-bold text-[10px] uppercase tracking-wider border border-border flex w-fit items-center gap-1">{p}</span>;
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
                <th className="px-4 py-2 text-left font-medium text-muted-foreground w-32">Origem</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground w-40">Conta</th>
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
                    <p className="text-xs text-muted-foreground truncate max-w-[200px]" title={(s.items || []).map(i => `${i.quantity}x ${i.sku || i.title}`).join(', ')}>
                      {(s.items || []).length} item(s) • {(s.items || []).map(i => i.sku || 'N/A').join(', ')}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {renderPlatformBadge(s.plataforma)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-muted text-foreground border border-border">
                      {s.plataforma === 'shopee' && s.conta.toLowerCase().includes('via flix') ? 'Mônaco Metais' : s.conta.replace('Tiny | ', '').replace('Shopee|', '')}
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
            onClick={() => fetchPendingShipments(true)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Buscando API...' : 'Atualizar Pedidos'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
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
            title="Atrasados (Fora do Prazo de Envio)" 
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

        {stats.grupos.drop.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mb-6 animate-fade-in">
            <div className={`px-4 py-3 border-b border-border flex items-center justify-between bg-amber-500/10 text-amber-500 border-amber-500/20`}>
              <h3 className="font-semibold text-sm flex items-center gap-2">
                🎯 Dropshipping (Pendente) ({stats.grupos.drop.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground w-32">Horário</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground w-32">Nº do Pedido</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground w-32">Origem</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground w-48">Conta (Comprador)</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Produtos</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground w-32">Valor Total</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.grupos.drop.map((s: Shipment) => (
                    <tr key={s.orderId} className="border-b border-border hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-foreground tracking-tight">{formatDate(s.dateCreated)}</td>
                      <td className="px-4 py-3 font-semibold text-primary font-mono text-xs">{s.orderId}</td>
                      <td className="px-4 py-3">{renderPlatformBadge(s.plataforma)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground truncate max-w-[200px]" title={s.buyer}>{s.buyer}</p>
                        <p className="text-[10px] text-muted-foreground tracking-wider uppercase mt-0.5">{s.conta}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-muted-foreground line-clamp-2" title={s.items.map(i => `${i.quantity}x ${i.sku || i.title}`).join(', ')}>
                          {s.items.map(i => i.sku || 'N/A').join(', ')} <span className="font-semibold text-foreground">({s.items.length} itens)</span>
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">{formatBRL(s.totalAmount || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
