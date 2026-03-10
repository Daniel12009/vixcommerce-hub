import { useState } from 'react';
import { RefreshCw, Wifi, WifiOff, ShoppingCart, TrendingUp, DollarSign, Package, ChevronDown, ChevronUp, Clock, CheckCircle2, XCircle, Truck, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { KpiCard } from '@/components/shared/KpiCard';
import { mockMarketplaceAccounts, mockOrders, mockAdsCampaigns, mockSalesByDay, mockRevenueByMarketplace } from '@/lib/mock-marketplace';
import { formatBRL } from '@/lib/utils-vix';
import type { MarketplaceAccount, MarketplaceId } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, PieChart, Pie, Cell, Area, AreaChart } from 'recharts';

const statusConfig: Record<string, { icon: React.ElementType; label: string; class: string }> = {
  pendente: { icon: Clock, label: 'Pendente', class: 'text-[hsl(var(--vix-warning))] bg-[hsl(var(--vix-warning)/0.1)]' },
  pago: { icon: CheckCircle2, label: 'Pago', class: 'text-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)]' },
  enviado: { icon: Truck, label: 'Enviado', class: 'text-[hsl(var(--vix-info))] bg-[hsl(var(--vix-info)/0.1)]' },
  entregue: { icon: CheckCircle2, label: 'Entregue', class: 'text-[hsl(var(--vix-success))] bg-[hsl(var(--vix-success)/0.1)]' },
  cancelado: { icon: XCircle, label: 'Cancelado', class: 'text-[hsl(var(--vix-danger))] bg-[hsl(var(--vix-danger)/0.1)]' },
};

const campaignStatusColors: Record<string, string> = {
  ativo: 'text-[hsl(var(--vix-success))] bg-[hsl(var(--vix-success)/0.1)]',
  pausado: 'text-[hsl(var(--muted-foreground))] bg-muted',
  ajustar: 'text-[hsl(var(--vix-danger))] bg-[hsl(var(--vix-danger)/0.1)]',
};

const plataformaOptions = ['Mercado Livre', 'Tiny', 'Shopee', 'Amazon', 'Magalu', 'Americanas', 'Shein'];

export function AtualizarDadosPage() {
  const [accounts, setAccounts] = useState<MarketplaceAccount[]>([...mockMarketplaceAccounts]);
  const [syncingAccounts, setSyncingAccounts] = useState<Set<string>>(new Set());
  const [filterMarketplace, setFilterMarketplace] = useState<string>('all');
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newAccount, setNewAccount] = useState({ nome: '', plataforma: '', loja: '' });

  const handleAddAccount = () => {
    if (!newAccount.nome || !newAccount.plataforma || !newAccount.loja) return;
    const id = `custom_${Date.now()}` as MarketplaceId;
    setAccounts(prev => [...prev, {
      id,
      nome: newAccount.nome,
      plataforma: newAccount.plataforma,
      loja: newAccount.loja.toUpperCase().replace(/\s+/g, '_'),
      status: 'disconnected' as const,
      totalPedidos: 0,
      faturamento: 0,
    }]);
    setNewAccount({ nome: '', plataforma: '', loja: '' });
    setDialogOpen(false);
  };

  const handleRemoveAccount = (id: MarketplaceId) => {
    setAccounts(prev => prev.filter(a => a.id !== id));
  };
  const totalFaturamento = accounts.reduce((s, a) => s + (a.faturamento || 0), 0);
  const totalPedidos = accounts.reduce((s, a) => s + (a.totalPedidos || 0), 0);
  const connectedCount = accounts.filter(a => a.status === 'connected').length;

  const filteredOrders = filterMarketplace === 'all'
    ? mockOrders
    : mockOrders.filter(o => o.marketplace === filterMarketplace);

  const handleSync = (id: MarketplaceId) => {
    setSyncingAccounts(prev => new Set(prev).add(id));
    setTimeout(() => {
      setSyncingAccounts(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 2500);
  };

  const handleSyncAll = () => {
    accounts.filter(a => a.status === 'connected').forEach(a => handleSync(a.id));
  };

  return (
    <div>
      <PageHeader title="Atualizar Dados" subtitle="Sincronização de vendas e gestão de marketplaces" />

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <KpiCard title="Faturamento Total" value={formatBRL(totalFaturamento)} icon={DollarSign} delay={0} />
        <KpiCard title="Total Pedidos" value={totalPedidos.toLocaleString('pt-BR')} icon={ShoppingCart} delay={50} />
        <KpiCard title="Contas Conectadas" value={`${connectedCount}/${accounts.length}`} icon={Wifi} delay={100} />
        <KpiCard title="Marketplaces" value={new Set(accounts.map(a => a.plataforma)).size.toString()} icon={Package} delay={150} />
      </div>

      <Tabs defaultValue="contas" className="space-y-6">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="contas">Contas & Sync</TabsTrigger>
          <TabsTrigger value="pedidos">Vendas / Pedidos</TabsTrigger>
          <TabsTrigger value="ads">Performance Ads</TabsTrigger>
          <TabsTrigger value="graficos">Gráficos</TabsTrigger>
        </TabsList>

        {/* Tab: Contas */}
        <TabsContent value="contas">
          <div className="flex justify-end gap-3 mb-4">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-foreground text-sm font-medium hover:bg-muted transition-colors">
                  <Plus className="w-4 h-4" />
                  Adicionar Conta
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Adicionar Nova Conta</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>Nome da Conta</Label>
                    <Input placeholder="Ex: VixStore Premium" value={newAccount.nome} onChange={e => setNewAccount(p => ({ ...p, nome: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Plataforma</Label>
                    <Select value={newAccount.plataforma} onValueChange={v => setNewAccount(p => ({ ...p, plataforma: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione a plataforma" /></SelectTrigger>
                      <SelectContent>
                        {plataformaOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>ID da Loja</Label>
                    <Input placeholder="Ex: VIXSTORE_PREM" value={newAccount.loja} onChange={e => setNewAccount(p => ({ ...p, loja: e.target.value }))} />
                  </div>
                  <button onClick={handleAddAccount} disabled={!newAccount.nome || !newAccount.plataforma || !newAccount.loja} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                    <Plus className="w-4 h-4" />
                    Adicionar
                  </button>
                </div>
              </DialogContent>
            </Dialog>
            <button onClick={handleSyncAll} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
              <RefreshCw className="w-4 h-4" />
              Sincronizar Tudo
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {accounts.map((account) => {
              const isSyncing = syncingAccounts.has(account.id);
              return (
                <div key={account.id} className="bg-card border border-border rounded-xl p-5 vix-card-hover animate-fade-in">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-foreground font-semibold text-sm">{account.nome}</h3>
                      <p className="text-muted-foreground text-xs">{account.plataforma} — {account.loja}</p>
                    </div>
                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                      account.status === 'connected' ? 'text-[hsl(var(--vix-success))] bg-[hsl(var(--vix-success)/0.1)]' :
                      account.status === 'syncing' ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)]' :
                      'text-[hsl(var(--vix-danger))] bg-[hsl(var(--vix-danger)/0.1)]'
                    }`}>
                      {account.status === 'connected' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                      {account.status === 'connected' ? 'Conectado' : account.status === 'syncing' ? 'Sincronizando...' : 'Desconectado'}
                    </div>
                  </div>

                  {account.status === 'connected' && (
                    <>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <p className="text-muted-foreground text-xs">Pedidos</p>
                          <p className="text-foreground font-semibold">{account.totalPedidos?.toLocaleString('pt-BR')}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Faturamento</p>
                          <p className="text-foreground font-semibold text-sm">{formatBRL(account.faturamento || 0)}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-muted-foreground text-xs">Última sync: {account.ultimaSync}</p>
                        <button
                          onClick={() => handleSync(account.id)}
                          disabled={isSyncing}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                          {isSyncing ? 'Sincronizando...' : 'Sync'}
                        </button>
                      </div>
                    </>
                  )}

                  {account.status === 'disconnected' && (
                    <button className="w-full mt-2 px-3 py-2 rounded-lg border border-border text-foreground text-xs font-medium hover:bg-muted transition-colors">
                      Conectar Conta
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab: Pedidos */}
        <TabsContent value="pedidos">
          <div className="flex items-center gap-3 mb-4">
            <label className="text-sm text-muted-foreground">Filtrar:</label>
            <select
              value={filterMarketplace}
              onChange={(e) => setFilterMarketplace(e.target.value as MarketplaceId | 'all')}
              className="px-3 py-1.5 rounded-lg bg-card border border-border text-foreground text-sm"
            >
              <option value="all">Todos os Marketplaces</option>
              {accounts.filter(a => a.status === 'connected').map(a => (
                <option key={a.id} value={a.id}>{a.nome}</option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground ml-auto">{filteredOrders.length} pedidos</span>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Pedido</th>
                    <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Data</th>
                    <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Marketplace</th>
                    <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Comprador</th>
                    <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Produto</th>
                    <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Qtd</th>
                    <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Total</th>
                    <th className="text-center py-3 px-4 font-semibold text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => {
                    const account = accounts.find(a => a.id === order.marketplace);
                    const st = statusConfig[order.statusPedido];
                    const StIcon = st.icon;
                    return (
                      <tr key={order.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs text-foreground">{order.numeroPedido}</td>
                        <td className="py-3 px-4 text-muted-foreground">{order.data}</td>
                        <td className="py-3 px-4 text-muted-foreground text-xs">{account?.nome || order.marketplace}</td>
                        <td className="py-3 px-4 text-foreground">{order.comprador}</td>
                        <td className="py-3 px-4 text-foreground text-xs">{order.produto}</td>
                        <td className="py-3 px-4 text-right text-foreground">{order.quantidade}</td>
                        <td className="py-3 px-4 text-right font-semibold text-foreground">{formatBRL(order.valorTotal)}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.class}`}>
                            <StIcon className="w-3 h-3" />
                            {st.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Tab: Performance Ads */}
        <TabsContent value="ads">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <KpiCard title="Investimento Total (7d)" value={formatBRL(mockAdsCampaigns.reduce((s, c) => s + c.investimento, 0))} icon={DollarSign} delay={0} />
            <KpiCard title="Receita de Ads (7d)" value={formatBRL(mockAdsCampaigns.reduce((s, c) => s + c.receita, 0))} icon={TrendingUp} delay={50} />
            <KpiCard
              title="ROAS Geral (7d)"
              value={(() => {
                const inv = mockAdsCampaigns.reduce((s, c) => s + c.investimento, 0);
                const rec = mockAdsCampaigns.reduce((s, c) => s + c.receita, 0);
                return inv > 0 ? (rec / inv).toFixed(2) + 'x' : '0x';
              })()}
              icon={TrendingUp}
              delay={100}
            />
          </div>

          <div className="space-y-3">
            {mockAdsCampaigns.map((campaign) => {
              const isExpanded = expandedCampaign === campaign.campanha;
              const roasRatio = campaign.roasObjetivo > 0 ? campaign.roasRealizado / campaign.roasObjetivo : 0;
              const roasColor = roasRatio >= 0.8 ? 'text-[hsl(var(--vix-success))]' : roasRatio >= 0.5 ? 'text-[hsl(var(--vix-warning))]' : 'text-[hsl(var(--vix-danger))]';

              return (
                <div key={campaign.campanha} className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in">
                  <button
                    onClick={() => setExpandedCampaign(isExpanded ? null : campaign.campanha)}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${campaignStatusColors[campaign.status]}`}>
                        {campaign.status === 'ativo' ? 'Ativo' : campaign.status === 'pausado' ? 'Pausado' : 'Ajustar'}
                      </span>
                      <span className="text-foreground font-medium text-sm">{campaign.campanha}</span>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Investimento</p>
                        <p className="text-sm font-semibold text-foreground">{formatBRL(campaign.investimento)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Receita</p>
                        <p className="text-sm font-semibold text-foreground">{formatBRL(campaign.receita)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">ROAS</p>
                        <p className={`text-sm font-bold ${roasColor}`}>{campaign.roasRealizado.toFixed(2)}x / {campaign.roasObjetivo}x</p>
                      </div>
                      {/* Progress bar */}
                      <div className="w-24 hidden lg:block">
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${roasRatio >= 0.8 ? 'bg-[hsl(var(--vix-success))]' : roasRatio >= 0.5 ? 'bg-[hsl(var(--vix-warning))]' : 'bg-[hsl(var(--vix-danger))]'}`}
                            style={{ width: `${Math.min(100, roasRatio * 100)}%` }}
                          />
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-border pt-3">
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
                        <AlertTriangle className="w-4 h-4 text-[hsl(var(--vix-warning))] mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-foreground mb-1">Recomendação IA</p>
                          <p className="text-sm text-muted-foreground">{campaign.recomendacao}</p>
                          <p className="text-xs text-muted-foreground mt-2">Orçamento diário: {formatBRL(campaign.orcamentoDiario)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab: Gráficos */}
        <TabsContent value="graficos">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Vendas por dia por marketplace */}
            <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
              <h3 className="text-foreground font-semibold mb-4">Vendas por Dia (7d)</h3>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={mockSalesByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="dia" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
                  <Legend />
                  <Area type="monotone" dataKey="ml1" name="VixStore" stackId="1" fill="hsl(var(--primary))" stroke="hsl(var(--primary))" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="ml2" name="VixHome" stackId="1" fill="hsl(var(--accent))" stroke="hsl(var(--accent))" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="ml3" name="VixSport" stackId="1" fill="hsl(var(--vix-warning))" stroke="hsl(var(--vix-warning))" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="tiny" name="Tiny" stackId="1" fill="hsl(var(--vix-info))" stroke="hsl(var(--vix-info))" fillOpacity={0.4} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Faturamento por marketplace (Pie) */}
            <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
              <h3 className="text-foreground font-semibold mb-4">Faturamento por Marketplace</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={mockRevenueByMarketplace}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }) => `${name.split(' - ')[1] || name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {mockRevenueByMarketplace.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [formatBRL(value), 'Faturamento']} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* ROAS por campanha (Bar) */}
            <div className="bg-card border border-border rounded-xl p-6 animate-fade-in lg:col-span-2">
              <h3 className="text-foreground font-semibold mb-4">ROAS Realizado vs Objetivo por Campanha</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={mockAdsCampaigns.filter(c => c.investimento > 0)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="campanha" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} angle={-15} textAnchor="end" height={60} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickFormatter={(v) => `${v}x`} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} formatter={(value: number) => [`${value.toFixed(2)}x`]} />
                  <Legend />
                  <Bar dataKey="roasRealizado" name="ROAS Realizado" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="roasObjetivo" name="ROAS Objetivo" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.4} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
