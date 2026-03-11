import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { StockItem, FinancialItem } from '@/lib/types';
import { parseBRL } from '@/lib/utils-vix';

interface SheetsData {
  estoqueItems: StockItem[] | null;
  financeiroItems: FinancialItem[] | null;
  setEstoqueFromSheet: (rows: Record<string, string>[]) => void;
  setFinanceiroFromSheet: (rows: Record<string, string>[]) => void;
  clearEstoque: () => void;
  clearFinanceiro: () => void;
}

const SheetsDataContext = createContext<SheetsData | null>(null);

function calcStockStatus(diasCobertura: number): 'green' | 'yellow' | 'red' {
  if (diasCobertura >= 30) return 'green';
  if (diasCobertura >= 15) return 'yellow';
  return 'red';
}

function num(v: string | undefined): number {
  if (!v) return 0;
  // Try BRL parse first, then plain number
  const cleaned = v.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

export function SheetsDataProvider({ children }: { children: ReactNode }) {
  const [estoqueItems, setEstoqueItems] = useState<StockItem[] | null>(null);
  const [financeiroItems, setFinanceiroItems] = useState<FinancialItem[] | null>(null);

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
        return {
          skuPrincipal: r.skuPrincipal,
          nome: r.nome || r.skuPrincipal,
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
        return {
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
      });
    setFinanceiroItems(items);
  }, []);

  return (
    <SheetsDataContext.Provider value={{
      estoqueItems,
      financeiroItems,
      setEstoqueFromSheet,
      setFinanceiroFromSheet,
      clearEstoque: () => setEstoqueItems(null),
      clearFinanceiro: () => setFinanceiroItems(null),
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
