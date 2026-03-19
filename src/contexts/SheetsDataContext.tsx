import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { StockItem, FinancialItem, VendaItem, PerformanceItem } from '@/lib/types';

interface SheetsData {
  estoqueItems: StockItem[] | null;
  financeiroItems: FinancialItem[] | null;
  vendasItems: VendaItem[] | null;
  performanceItems: PerformanceItem[] | null;
  setEstoqueFromSheet: (rows: Record<string, string>[]) => void;
  setFinanceiroFromSheet: (rows: Record<string, string>[]) => void;
  setVendasFromSheet: (rows: Record<string, string>[]) => void;
  setPerformanceFromSheet: (rows: Record<string, string>[], contaOverride?: string) => void;
  clearEstoque: () => void;
  clearFinanceiro: () => void;
  clearVendas: () => void;
  clearPerformance: () => void;
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
  const [financeiroItems, setFinanceiroItems] = useState<FinancialItem[] | null>(null);
  const [vendasItems, setVendasItems] = useState<VendaItem[] | null>(null);
  const [performanceItems, setPerformanceItems] = useState<PerformanceItem[] | null>(null);

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
    // Merge with existing items (from other sheets/contas)
    setPerformanceItems(prev => prev ? [...prev, ...items] : items);
  }, []);

  return (
    <SheetsDataContext.Provider value={{
      estoqueItems,
      financeiroItems,
      vendasItems,
      performanceItems,
      setEstoqueFromSheet,
      setFinanceiroFromSheet,
      setVendasFromSheet,
      setPerformanceFromSheet,
      clearEstoque: () => setEstoqueItems(null),
      clearFinanceiro: () => setFinanceiroItems(null),
      clearVendas: () => setVendasItems(null),
      clearPerformance: () => setPerformanceItems(null),
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
