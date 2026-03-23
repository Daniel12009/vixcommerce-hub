import { useState, useMemo, useEffect } from 'react';
import { Package, AlertTriangle, TrendingDown, Truck, ArrowUpDown, ArrowUp, ArrowDown, Pencil, Check, FileSpreadsheet, Search, Loader2, RefreshCw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KpiCard } from '@/components/shared/KpiCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatNumber } from '@/lib/utils-vix';
import { useSheetsData } from '@/contexts/SheetsDataContext';

interface MergedStockRow {
...
  // Fetch pending shipments
  const fetchPendingShipments = async () => {
    setLoadingShipments(true);
    setShipmentsError('');

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mercado-livre`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ action: 'get_pending_shipments' }),
      });

      const responseText = await response.text();
      let data: any = {};

      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch {
          throw new Error(`Resposta inválida da Edge Function (${response.status})`);
        }
      }

      if (!response.ok) {
        throw new Error(data?.error || `Edge Function retornou status ${response.status}`);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setPendingShipments(data?.shipments || []);
    } catch (err: any) {
      console.error('Shipments fetch error:', err);
      setShipmentsError(err.message || 'Erro ao buscar envios pendentes');
    } finally {
      setLoadingShipments(false);
    }
  };

  // Shipments filtered
  const filteredShipments = useMemo(() => {
    if (shipmentsFilterConta === 'all') return pendingShipments.filter(s => !s.error);
    return pendingShipments.filter(s => !s.error && s.conta === shipmentsFilterConta);
  }, [pendingShipments, shipmentsFilterConta]);

  const shipmentContas = useMemo(() => {
    const set = new Set<string>();
    pendingShipments.forEach(s => { if (s.conta && !s.error) set.add(s.conta); });
    return Array.from(set).sort();
  }, [pendingShipments]);

  // Transfer items from Full_Estoque
  const transferItems = useMemo(() => {
    if (!estoqueFullItems) return [];
    return estoqueFullItems
      .filter(i => i.emTransferencia > 0 || i.entradaPendente > 0)
      .map(i => ({ ...i, sku: i.sku.trim().toUpperCase() }))
      .sort((a, b) => (b.emTransferencia + b.entradaPendente) - (a.emTransferencia + a.entradaPendente));
  }, [estoqueFullItems]);

  return (
    <div>
      <PageHeader title="Estoque Full & Local" subtitle="Gestão logística com alertas de ruptura e controle de envios" />

      {/* Data source badges */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {hasFullData && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[hsl(var(--vix-info)/0.1)] border border-[hsl(var(--vix-info)/0.2)] text-xs text-[hsl(var(--vix-info))]">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Full ML: {estoqueFullItems!.length} registros
          </div>
        )}
        {hasTinyData && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[hsl(200,80%,50%,0.1)] border border-[hsl(200,80%,50%,0.2)] text-xs text-[hsl(200,80%,50%)]">
            <Package className="w-3.5 h-3.5" /> Tiny Local: {estoqueTinyItems!.length} SKUs
          </div>
        )}
      </div>

      <Tabs defaultValue="visao-geral" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="visao-geral">📊 Visão Geral</TabsTrigger>
          <TabsTrigger value="envios">🚚 Envios & Coletas</TabsTrigger>
          <TabsTrigger value="transferencias">🔄 Transferências</TabsTrigger>
        </TabsList>

        {/* ===== ABA 1: VISÃO GERAL ===== */}
        <TabsContent value="visao-geral">
          {!hasAnyData ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center animate-fade-in">
              <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
              <h3 className="text-lg font-semibold mb-2">Nenhum dado de estoque importado</h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                Vá em <strong>Performance → Planilhas Google</strong>, adicione <strong>Estoque Full (ML)</strong> e/ou <strong>Estoque Tiny (Local)</strong>.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                <KpiCard title="Total SKUs" value={String(totalSkus)} icon={Package} delay={0} />
                <KpiCard title="Em Ruptura" value={String(skusRuptura)} icon={TrendingDown} delay={50} />
                <KpiCard title="Críticos" value={String(skusCriticos)} icon={AlertTriangle} delay={100} />
                <KpiCard title="Entrada Pendente" value={String(skusEntradaPendente)} icon={Truck} delay={150} />
                <KpiCard title="Em Transferência" value={String(skusEmTransferencia)} icon={ArrowUpDown} delay={200} />
              </div>

              {/* Controls */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
                  <span className="text-xs text-muted-foreground font-medium">Cobertura Alvo:</span>
                  {editingCobertura ? (
                    <div className="flex items-center gap-1">
                      <input type="number" min={1} max={90} value={tempCobertura} onChange={e => setTempCobertura(e.target.value)}
                        className="w-14 h-7 text-center text-sm bg-muted border border-border rounded px-1" autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') { const v = parseInt(tempCobertura); if (v > 0) setDiasCoberturaAlvo(v); setEditingCobertura(false); } }} />
                      <span className="text-xs text-muted-foreground">dias</span>
                      <button onClick={() => { const v = parseInt(tempCobertura); if (v > 0) setDiasCoberturaAlvo(v); setEditingCobertura(false); }} className="p-1 rounded hover:bg-muted transition-colors">
                        <Check className="w-3.5 h-3.5 text-[hsl(var(--vix-success))]" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { setTempCobertura(String(diasCoberturaAlvo)); setEditingCobertura(true); }} className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                      {diasCoberturaAlvo} dias <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {contasUnicas.length > 0 && (
                  <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
                    <span className="text-xs text-muted-foreground font-medium">Conta:</span>
                    <select value={filterConta} onChange={e => setFilterConta(e.target.value)} className="text-sm bg-transparent border-none outline-none font-semibold text-primary cursor-pointer">
                      <option value="all">Todas</option>
                      {contasUnicas.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}

                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input type="text" placeholder="Buscar SKU..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-2 h-9 text-sm bg-card border border-border rounded-lg focus:ring-1 focus:ring-primary outline-none" />
                </div>

                <div className="flex items-center gap-1">
                  {(['all', 'ruptura', 'critico', 'ok'] as const).map(s => (
                    <button key={s} onClick={() => setFilterStatus(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === s ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                      {{ all: 'Todos', ruptura: '🔴 Ruptura', critico: '🟡 Crítico', ok: '🟢 OK' }[s]}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground ml-auto">{displayData.length} de {totalSkus} SKUs</span>
              </div>

              {/* Table */}
              <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('sku')}>SKU{sortIcon('sku')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('venSemanal')}>Ven. Sem.{sortIcon('venSemanal')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('vmd')}>VMD{sortIcon('vmd')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('tinyLocal')}>Tiny{sortIcon('tinyLocal')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('fullML')}>Full{sortIcon('fullML')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('entradaPendente')}>Entrada{sortIcon('entradaPendente')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('emTransferencia')}>Transf.{sortIcon('emTransferencia')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('sugestaoEnvio')}>Sugestão{sortIcon('sugestaoEnvio')}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('coberturaDias')}>Cobert.{sortIcon('coberturaDias')}</th>
                        <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayData.map(row => (
                        <tr key={row.sku} className={`border-b border-border hover:bg-muted/30 transition-colors ${row.status === 'ruptura' ? 'bg-[hsl(var(--vix-danger)/0.03)]' : row.status === 'critico' ? 'bg-[hsl(var(--vix-warning)/0.03)]' : ''}`}>
                          <td className="px-3 py-2.5 font-mono text-xs font-semibold text-primary">{row.sku}</td>
                          <td className="px-3 py-2.5 text-right text-foreground">{row.venSemanal}</td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground">{row.vmd.toFixed(1)}</td>
                          <td className="px-3 py-2.5 text-right text-foreground font-medium">{row.tinyLocal || '—'}</td>
                          <td className={`px-3 py-2.5 text-right font-medium ${row.fullML <= 0 ? 'text-[hsl(var(--vix-danger))]' : 'text-foreground'}`}>{row.fullML}</td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground">{row.entradaPendente || '—'}</td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground">{row.emTransferencia || '—'}</td>
                          <td className={`px-3 py-2.5 text-right font-semibold ${row.sugestaoEnvio > 0 ? 'text-[hsl(var(--vix-danger))]' : 'text-[hsl(var(--vix-success))]'}`}>{row.sugestaoEnvio > 0 ? `-${row.sugestaoEnvio}` : '0'}</td>
                          <td className={`px-3 py-2.5 text-right font-medium ${row.coberturaDias <= 0 ? 'text-[hsl(var(--vix-danger))]' : row.coberturaDias < diasCoberturaAlvo ? 'text-[hsl(var(--vix-warning))]' : 'text-[hsl(var(--vix-success))]'}`}>{row.coberturaDias >= 999 ? '∞' : `${row.coberturaDias}d`}</td>
                          <td className="px-3 py-2.5 text-center">{statusBadge(row.status)}</td>
                        </tr>
                      ))}
                      {displayData.length === 0 && (
                        <tr><td colSpan={10} className="py-8 text-center text-muted-foreground text-sm">{searchTerm || filterStatus !== 'all' ? 'Nenhum SKU encontrado com os filtros aplicados' : 'Nenhum dado disponível'}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* ===== ABA 2: ENVIOS & COLETAS ===== */}
        <TabsContent value="envios">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={fetchPendingShipments} disabled={loadingShipments}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {loadingShipments ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {loadingShipments ? 'Buscando...' : 'Buscar Envios Pendentes'}
              </button>

              {shipmentContas.length > 0 && (
                <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
                  <span className="text-xs text-muted-foreground font-medium">Conta:</span>
                  <select value={shipmentsFilterConta} onChange={e => setShipmentsFilterConta(e.target.value)} className="text-sm bg-transparent border-none outline-none font-semibold text-primary cursor-pointer">
                    <option value="all">Todas</option>
                    {shipmentContas.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}

              {pendingShipments.length > 0 && (
                <span className="text-xs text-muted-foreground">{filteredShipments.length} envios pendentes</span>
              )}
            </div>

            {shipmentsError && (
              <div className="p-3 rounded-lg bg-[hsl(var(--vix-danger)/0.1)] border border-[hsl(var(--vix-danger)/0.2)] text-sm text-[hsl(var(--vix-danger))]">
                {shipmentsError}
              </div>
            )}

            {pendingShipments.length === 0 && !loadingShipments ? (
              <div className="bg-card border border-border rounded-xl p-12 text-center animate-fade-in">
                <Truck className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
                <h3 className="text-lg font-semibold mb-2">Envios Pendentes</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                  Clique em <strong>"Buscar Envios Pendentes"</strong> para ver os pedidos com status <code>ready_to_ship</code> de todas as contas ML.
                </p>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Conta</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Pedido</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">SKU</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Produto</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Qtd</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Valor</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Tipo Envio</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredShipments.map((s, idx) => (
                        s.items?.map((item: any, iIdx: number) => (
                          <tr key={`${s.orderId}-${iIdx}`} className="border-b border-border hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">{s.conta}</td>
                            <td className="px-3 py-2.5 font-mono text-xs text-primary">{s.orderId}</td>
                            <td className="px-3 py-2.5 font-mono text-xs font-semibold">{item.sku || '—'}</td>
                            <td className="px-3 py-2.5 text-xs text-foreground max-w-[300px] truncate">{item.title}</td>
                            <td className="px-3 py-2.5 text-right text-foreground font-medium">{item.quantity}</td>
                            <td className="px-3 py-2.5 text-right text-foreground">R$ {(item.unitPrice || 0).toFixed(2)}</td>
                            <td className="px-3 py-2.5">
                              {s.shipment?.logisticType && (
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  s.shipment.logisticType === 'fulfillment' ? 'bg-[hsl(var(--vix-info)/0.15)] text-[hsl(var(--vix-info))]' :
                                  s.shipment.logisticType === 'cross_docking' ? 'bg-[hsl(var(--vix-warning)/0.15)] text-[hsl(var(--vix-warning))]' :
                                  'bg-muted text-muted-foreground'
                                }`}>{s.shipment.logisticType === 'fulfillment' ? 'Full' : s.shipment.logisticType === 'cross_docking' ? 'Coleta' : s.shipment.logisticType}</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">{s.dateCreated ? new Date(s.dateCreated).toLocaleDateString('pt-BR') : '—'}</td>
                          </tr>
                        ))
                      ))}
                      {filteredShipments.length === 0 && !loadingShipments && pendingShipments.length > 0 && (
                        <tr><td colSpan={8} className="py-8 text-center text-muted-foreground text-sm">Nenhum envio encontrado para esta conta</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ===== ABA 3: TRANSFERÊNCIAS ===== */}
        <TabsContent value="transferencias">
          {!hasFullData ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center animate-fade-in">
              <ArrowUpDown className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
              <h3 className="text-lg font-semibold mb-2">Dados de transferência não disponíveis</h3>
              <p className="text-muted-foreground text-sm">Importe a aba <strong>Full_Estoque</strong> para ver itens em transferência e entrada pendente.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                <KpiCard title="SKUs em Transferência" value={String(transferItems.filter(i => i.emTransferencia > 0).length)} icon={ArrowUpDown} delay={0} />
                <KpiCard title="SKUs com Entrada Pendente" value={String(transferItems.filter(i => i.entradaPendente > 0).length)} icon={Truck} delay={50} />
                <KpiCard title="Total Itens em Movimento" value={formatNumber(transferItems.reduce((s, i) => s + i.emTransferencia + i.entradaPendente, 0))} icon={Package} delay={100} />
              </div>

              <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Conta</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">SKU</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Aptas p/ Venda</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Em Transferência</th>
                        <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Entrada Pendente</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Status Anúncio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transferItems.map((item, idx) => (
                        <tr key={`${item.sku}-${item.conta}-${idx}`} className="border-b border-border hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">{item.conta}</td>
                          <td className="px-3 py-2.5 font-mono text-xs font-semibold text-primary">{item.sku}</td>
                          <td className="px-3 py-2.5 text-right text-foreground">{item.aptasParaVenda}</td>
                          <td className={`px-3 py-2.5 text-right font-medium ${item.emTransferencia > 0 ? 'text-[hsl(var(--vix-warning))]' : 'text-muted-foreground'}`}>{item.emTransferencia || '—'}</td>
                          <td className={`px-3 py-2.5 text-right font-medium ${item.entradaPendente > 0 ? 'text-[hsl(var(--vix-info))]' : 'text-muted-foreground'}`}>{item.entradaPendente || '—'}</td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">{item.statusAnuncio || '—'}</td>
                        </tr>
                      ))}
                      {transferItems.length === 0 && (
                        <tr><td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">Nenhum item em transferência ou com entrada pendente</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
