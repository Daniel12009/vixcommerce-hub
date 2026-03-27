import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { StockItem, EstoqueFullItem, EstoqueTinyItem, FinancialItem, VendaItem, PerformanceItem, AdsImportItem, DevolucaoItem } from '@/lib/types';
import { loadFromCloud, saveToCloud, syncVendasIncremental } from '@/lib/persistence';
import type { ModuloDestino } from '@/lib/sheets-store';

interface SheetsData {
  estoqueItems: StockItem[] | null;
  estoqueFullItems: EstoqueFullItem[] | null;
  estoqueTinyItems: EstoqueTinyItem[] | null;
  financeiroItems: FinancialItem[] | null;
  vendasItems: VendaItem[] | null;
  performanceItems: PerformanceItem[] | null;
  adsItems: AdsImportItem[] | null;
  devolucaoItems: DevolucaoItem[] | null;
  isLoaded: boolean;
  setEstoqueFromSheet: (rows: Record<string, string>[]) => void;
  setEstoqueFullFromSheet: (rows: Record<string, string>[]) => void;
  setEstoqueTinyFromSheet: (rows: Record<string, string>[]) => void;
  setFinanceiroFromSheet: (rows: Record<string, string>[]) => void;
  setVendasFromSheet: (rows: Record<string, string>[]) => void;
  setPerformanceFromSheet: (rows: Record<string, string>[], contaOverride?: string) => void;
  setAdsFromSheet: (rows: Record<string, string>[]) => void;
  setDevolucaoFromSheet: (rows: Record<string, string>[]) => void;
  clearEstoque: () => void;
  clearEstoqueFull: () => void;
  clearEstoqueTiny: () => void;
  clearFinanceiro: () => void;
  clearVendas: () => void;
  clearPerformance: () => void;
  clearAds: () => void;
  clearDevolucao: () => void;
  refreshModule: (modulo: ModuloDestino) => Promise<number>;
  refreshingModule: string | null;
}

const SheetsDataContext = createContext<SheetsData | null>(null);

function calcStockStatus(diasCobertura: number): 'green' | 'yellow' | 'red' {
  if (diasCobertura >= 30) return 'green';
  if (diasCobertura >= 15) return 'yellow';
  return 'red';
}

function num(v: string | undefined): number {
  if (!v) return 0;
  const cleaned = v.replace(/[R$\s%]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

export function SheetsDataProvider({ children }: { children: ReactNode }) {
  const [estoqueItems, setEstoqueItems] = useState<StockItem[] | null>(null);
  const [estoqueFullItems, setEstoqueFullItems] = useState<EstoqueFullItem[] | null>(null);
  const [estoqueTinyItems, setEstoqueTinyItems] = useState<EstoqueTinyItem[] | null>(null);
  const [financeiroItems, setFinanceiroItems] = useState<FinancialItem[] | null>(null);
  const [vendasItems, setVendasItems] = useState<VendaItem[] | null>(null);
  const [performanceItems, setPerformanceItems] = useState<PerformanceItem[] | null>(null);
  const [adsItems, setAdsItems] = useState<AdsImportItem[] | null>(null);
  const [devolucaoItems, setDevolucaoItems] = useState<DevolucaoItem[] | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [refreshingModule, setRefreshingModule] = useState<string | null>(null);

  const setEstoqueFromSheet = useCallback((rows: Record<string, string>[]) => {
    const items: StockItem[] = rows
      .filter(r => r.skuPrincipal)
      .map(r => {
        const estoqueAtual = num(r.estoqueAtual);
        const vmd = num(r.vmd) || Math.max(1, Math.round(Math.random() * 10 + 3));
        const diasCobertura = estoqueAtual > 0 && vmd > 0 ? Math.round(estoqueAtual / vmd) : 0;
        const leadTime = num(r.leadTime) || 15;
        const emTransito = num(r.emTransito);
        const emTransferencia = num(r.emTransferencia);
        const estoqueMinimo = num(r.estoqueMinimo) || 0;
        const necessidade = (vmd * (30 + leadTime)) - (estoqueAtual + emTransito + emTransferencia);
        const baseItem = {
          skuPrincipal: r.skuPrincipal,
          nome: r.nome || r.skuPrincipal,
          conta: r.conta || '',
          estoqueAtual,
          estoqueMinimo,
          vmd,
          diasCobertura,
          leadTime,
          emTransito,
          emTransferencia,
          necessidadeReposicao: Math.max(0, necessidade),
          statusCobertura: calcStockStatus(diasCobertura),
        };
        return Object.assign({}, r, baseItem);
      });
    setEstoqueItems(items);
  }, []);

  const setEstoqueFullFromSheet = useCallback((rows: Record<string, string>[]) => {
    const items: EstoqueFullItem[] = rows
      .filter(r => r.sku)
      .map(r => ({
        data: r.data || '',
        conta: r.conta || '',
        sku: r.sku || '',
        tamanho: r.tamanho || '',
        statusAnuncio: r.statusAnuncio || '',
        entradaPendente: num(r.entradaPendente),
        emTransferencia: num(r.emTransferencia),
        devolvidasComprador: num(r.devolvidasComprador),
        aptasParaVenda: num(r.aptasParaVenda),
        unidadesOcupamEspaco: num(r.unidadesOcupamEspaco),
      }));
    setEstoqueFullItems(items);
  }, []);

  const setEstoqueTinyFromSheet = useCallback((rows: Record<string, string>[]) => {
    const items: EstoqueTinyItem[] = rows
      .filter(r => r.sku)
      .map(r => ({
        sku: r.sku || '',
        quantidade: num(r.quantidade),
      }));
    setEstoqueTinyItems(items);
  }, []);

  const setFinanceiroFromSheet = useCallback((rows: Record<string, string>[]) => {
    const items: FinancialItem[] = rows
      .filter(r => r.skuPrincipal)
      .map(r => {
        const receita = num(r.receita);
        const impostos = num(r.impostos);
        const taxas = num(r.taxas);
        const custo = num(r.custo);
        const frete = num(r.frete);
        const unidadesVendidas = num(r.unidadesVendidas) || 0;
        const margemReal = receita - impostos - taxas - custo - frete;
        const margemPercent = receita > 0 ? (margemReal / receita) * 100 : 0;
        const baseItem = {
          skuPrincipal: r.skuPrincipal,
          nome: r.nome || r.skuPrincipal,
          receita,
          impostos,
          taxas,
          custo,
          frete,
          margemReal,
          margemPercent,
          unidadesVendidas,
        };
        return Object.assign({}, r, baseItem);
      });
    setFinanceiroItems(items);
  }, []);

  const setVendasFromSheet = useCallback((rows: Record<string, string>[]) => {
    const items: VendaItem[] = rows
      .filter(r => r.numeroPedido || r.sku)
      .map(r => {
        let conta = r.conta || '';
        const origem = r.origem || '';
        if (!conta && origem.includes('|')) {
          conta = origem.split('|')[1]?.trim() || '';
        }

        const baseItem = {
          numeroPedido: r.numeroPedido || '',
          data: r.data || '',
          conta,
          contaMae: r.contaMae || conta || '',
          comprador: r.comprador || '',
          sku: r.sku || '',
          skuProduto: r.skuProduto || r.sku || '',
          produto: r.produto || r.sku || '',
          quantidade: num(r.quantidade) || 1,
          valorTotal: num(r.valorTotal) || num(r.precoUnitario) || 0,
          statusPedido: r.statusPedido || 'pago',
          frete: num(r.frete),
          origem,
          pedidoOrigem: r.pedidoOrigem || '',
          precoUnitario: num(r.precoUnitario),
          impostos: num(r.impostos),
          comissao: num(r.comissao),
          custoEnvio: num(r.custoEnvio),
          ads: num(r.ads),
          cmv: num(r.cmv),
          margem: r.margem || '',
          liquido: num(r.liquido),
          devolucao: r.devolucao || '',
        };
        return Object.assign({}, r, baseItem);
      });
    setVendasItems(items);
  }, []);

  const setPerformanceFromSheet = useCallback((rows: Record<string, string>[], contaOverride?: string) => {
    const items: PerformanceItem[] = rows
      .filter(r => r.idAnuncio || r.sku)
      .map(r => ({
        plataforma: r.plataforma || '',
        idAnuncio: r.idAnuncio || '',
        sku: r.sku || '',
        titulo: r.titulo || '',
        preco: num(r.preco),
        visitas: num(r.visitas),
        vendas: num(r.vendas),
        canceladas: num(r.canceladas),
        conversao: num(r.conversao),
        link: r.link || '',
        conta: contaOverride || r.conta || '',
        dataRef: r.dataRef || '',
      }));
    const conta = contaOverride || items[0]?.conta || '';
    // Replace items from the same conta (dedup), keep items from other contas
    setPerformanceItems(prev => {
      const kept = prev ? prev.filter(p => p.conta !== conta) : [];
      return [...kept, ...items];
    });
  }, []);

  const setAdsFromSheet = useCallback((rows: Record<string, string>[]) => {
    const items: AdsImportItem[] = rows
      .filter(r => r.idAnuncio || r.investimento)
      .map(r => ({
        tipo: r.tipo || '',
        dataRef: r.dataRef || '',
        conta: r.conta || '',
        campanha: r.campanha || '',
        idCampanha: r.idCampanha || '',
        idAnuncio: r.idAnuncio || '',
        titulo: r.titulo || '',
        investimento: num(r.investimento),
        receita: num(r.receita),
        vendasQtd: num(r.vendasQtd),
        acos: num(r.acos),
        roas: num(r.roas),
        cliques: num(r.cliques),
        impressoes: num(r.impressoes),
        ultAtualizacao: r.ultAtualizacao || '',
      }));
    setAdsItems(items);
  }, []);

  const setDevolucaoFromSheet = useCallback((rows: Record<string, string>[]) => {
    const items: DevolucaoItem[] = rows
      .filter(r => r.pedido || r.skuProduto)
      .map(r => ({
        dataPlanilha: r.dataPlanilha || '',
        plataforma: r.plataforma || '',
        dataAprovacao: r.dataAprovacao || '',
        valorReembolso: num(r.valorReembolso),
        pedido: r.pedido || '',
        anuncio: r.anuncio || '',
        skuProduto: r.skuProduto || '',
        statusDevolucao: r.statusDevolucao || '',
        acaoAposDevolucao: r.acaoAposDevolucao || '',
        devolucaoGeradaPor: r.devolucaoGeradaPor || '',
        rastreioCorreios: r.rastreioCorreios || '',
        motivo: r.motivo || '',
        detalhesMotivo: r.detalhesMotivo || '',
        novoMotivo: r.novoMotivo || '',
        detalhe: r.detalhe || '',
        setor: r.setor || '',
        custoDevolucao: num(r.custoDevolucao),
        comissaoNaoDevolvida: num(r.comissaoNaoDevolvida),
        custo: num(r.custo),
        quantidade: num(r.quantidade) || 1,
        situacaoMercadoria: r.situacaoMercadoria || '',
        totalCustoMercadoria: num(r.totalCustoMercadoria),
        formaReembolso: r.formaReembolso || '',
        dataReembolso: r.dataReembolso || '',
        depositoDevolucao: r.depositoDevolucao || '',
        notaFiscalDevolucao: r.notaFiscalDevolucao || '',
        colaborador: r.colaborador || '',
        retornoDevolucao: r.retornoDevolucao || '',
      }));
    setDevolucaoItems(items);
  }, []);
  useEffect(() => {
    // ━━━ PHASE 0: Instant load from localStorage (synchronous) ━━━
    const KEYS_MAP: [string, (d: any) => void][] = [
      ['vendas_data', setVendasFromSheet],
      ['performance_data', setPerformanceFromSheet],
      ['estoque_full_data', setEstoqueFullFromSheet],
      ['estoque_tiny_data', setEstoqueTinyFromSheet],
      ['ads_data', setAdsFromSheet],
      ['devolucao_data', setDevolucaoFromSheet],
    ];

    let hasLocalData = false;
    for (const [key, setter] of KEYS_MAP) {
      try {
        const raw = localStorage.getItem(`vix_${key}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setter(parsed);
            hasLocalData = true;
          }
        }
      } catch {}
    }

    // If localStorage had data, skip loading screen immediately
    if (hasLocalData) {
      setIsLoaded(true);
    }

    // ━━━ PHASE 1: Refresh from Supabase cloud cache ━━━
    const backgroundRefresh = async () => {
      try {
        const timeout = (ms: number) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
        const [vendas, perf, full, tiny, ads, devol] = await Promise.allSettled([
          Promise.race([loadFromCloud<any[]>('vendas_data'), timeout(6000)]),
          Promise.race([loadFromCloud<any[]>('performance_data'), timeout(6000)]),
          Promise.race([loadFromCloud<any[]>('estoque_full_data'), timeout(6000)]),
          Promise.race([loadFromCloud<any[]>('estoque_tiny_data'), timeout(6000)]),
          Promise.race([loadFromCloud<any[]>('ads_data'), timeout(6000)]),
          Promise.race([loadFromCloud<any[]>('devolucao_data'), timeout(6000)]),
        ]) as PromiseSettledResult<any[]>[];

        if (vendas.status === 'fulfilled' && vendas.value) setVendasFromSheet(vendas.value);
        if (perf.status === 'fulfilled' && perf.value) setPerformanceFromSheet(perf.value);
        if (full.status === 'fulfilled' && full.value) setEstoqueFullFromSheet(full.value);
        if (tiny.status === 'fulfilled' && tiny.value) setEstoqueTinyFromSheet(tiny.value);
        if (ads.status === 'fulfilled' && ads.value) setAdsFromSheet(ads.value);
        if (devol.status === 'fulfilled' && devol.value) setDevolucaoFromSheet(devol.value);
      } catch (err) {
        console.warn('[Preload] Supabase refresh failed:', err);
      } finally {
        // If localStorage had no data, NOW mark as loaded (Supabase finished)
        if (!hasLocalData) setIsLoaded(true);
      }

      // ━━━ PHASE 2: Auto-import fresh data from Google Sheets (background) ━━━
      try {
        const { autoImportAllSheets } = await import('@/lib/sheets-store');
        const { results } = await autoImportAllSheets();
        console.log(`[AutoImport] Imported ${results.length} sheets`);
        for (const { parsed, config } of results) {
          if (!parsed || parsed.length === 0) continue;
          const mod = config.moduloDestino;
          if (mod === 'vendas') { setVendasFromSheet(parsed); syncVendasIncremental(parsed).catch(console.warn); }
          else if (mod === 'estoque-full') { setEstoqueFullFromSheet(parsed); saveToCloud('estoque_full_data', parsed); }
          else if (mod === 'estoque-tiny') { setEstoqueTinyFromSheet(parsed); saveToCloud('estoque_tiny_data', parsed); }
          else if (mod === 'financeiro') { setFinanceiroFromSheet(parsed); saveToCloud('financeiro_data', parsed); }
          else if (mod === 'performance') {
            setPerformanceFromSheet(parsed, config.abaNome);
            saveToCloud('performance_data', parsed);
          }
          else if (mod === 'ads') { setAdsFromSheet(parsed); saveToCloud('ads_data', parsed); }
          else if (mod === 'devolucao') { setDevolucaoFromSheet(parsed); saveToCloud('devolucao_data', parsed); }
        }
      } catch (err) {
        console.warn('[AutoImport] Background sheets import failed:', err);
      }
    };
    backgroundRefresh();
  }, [setVendasFromSheet, setPerformanceFromSheet, setEstoqueFullFromSheet, setEstoqueTinyFromSheet, setAdsFromSheet, setDevolucaoFromSheet]);

  return (
    <SheetsDataContext.Provider value={{
      estoqueItems,
      estoqueFullItems,
      estoqueTinyItems,
      financeiroItems,
      vendasItems,
      performanceItems,
      adsItems,
      devolucaoItems,
      isLoaded,
      setEstoqueFromSheet,
      setEstoqueFullFromSheet,
      setEstoqueTinyFromSheet,
      setFinanceiroFromSheet,
      setVendasFromSheet,
      setPerformanceFromSheet,
      setAdsFromSheet,
      setDevolucaoFromSheet,
      clearEstoque: () => setEstoqueItems(null),
      clearEstoqueFull: () => setEstoqueFullItems(null),
      clearEstoqueTiny: () => setEstoqueTinyItems(null),
      clearFinanceiro: () => setFinanceiroItems(null),
      clearVendas: () => setVendasItems(null),
      clearPerformance: () => setPerformanceItems(null),
      clearAds: () => setAdsItems(null),
      clearDevolucao: () => setDevolucaoItems(null),
      refreshModule: async (modulo: ModuloDestino) => {
        setRefreshingModule(modulo);
        try {
          const { importModuleSheets } = await import('@/lib/sheets-store');
          const { results } = await importModuleSheets(modulo);
          let totalImported = 0;
          for (const { parsed, config } of results) {
            if (parsed.length === 0) continue;
            totalImported += parsed.length;
            const mod = config.moduloDestino;
            if (mod === 'estoque') { setEstoqueFromSheet(parsed); saveToCloud('estoque_data', parsed); }
            else if (mod === 'estoque-full') { setEstoqueFullFromSheet(parsed); saveToCloud('estoque_full_data', parsed); }
            else if (mod === 'estoque-tiny') { setEstoqueTinyFromSheet(parsed); saveToCloud('estoque_tiny_data', parsed); }
            else if (mod === 'financeiro') { setFinanceiroFromSheet(parsed); saveToCloud('financeiro_data', parsed); }
            else if (mod === 'vendas') { setVendasFromSheet(parsed); syncVendasIncremental(parsed).catch(console.warn); }
            else if (mod === 'performance') {
              setPerformanceFromSheet(parsed, config.abaNome);
              const existing = await loadFromCloud<any[]>('performance_data') || [];
              const merged = [...existing.filter((p: any) => p.conta !== config.abaNome), ...parsed.map(p => ({ ...p, conta: config.abaNome }))];
              saveToCloud('performance_data', merged);
            }
            else if (mod === 'ads') { setAdsFromSheet(parsed); saveToCloud('ads_data', parsed); }
            else if (mod === 'devolucao') { setDevolucaoFromSheet(parsed); saveToCloud('devolucao_data', parsed); }
          }
          return totalImported;
        } catch (err) {
          console.error(`[RefreshModule] Error refreshing ${modulo}:`, err);
          return 0;
        } finally {
          setRefreshingModule(null);
        }
      },
      refreshingModule,
    }}>
      {children}
    </SheetsDataContext.Provider>
  );
}

export function useSheetsData() {
  const ctx = useContext(SheetsDataContext);
  if (!ctx) throw new Error('useSheetsData must be inside SheetsDataProvider');
  return ctx;
}

