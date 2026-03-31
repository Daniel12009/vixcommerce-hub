import { useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, Settings2, Loader2, Maximize, Download, Mail, ClipboardCopy, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import { KnapsackReport } from './KnapsackReport';
import { SopChat } from './SopChat';
import { toast } from 'sonner';
import type { VendaItem } from '@/lib/types';

/* ───────── Types ───────── */
export interface PurchaseOrderLine {
  no: number;
  sku: string;
  description: string;
  photoUrl?: string;
  packing: number;
  qty: number;
  price: number;
  ctn: number;
  cbmCtn: number;
  cbm: number;
  amount: number;
}

export interface PurchaseOrder {
  id: string;
  date: string;
  lines: PurchaseOrderLine[];
  totalQty: number;
  totalCbm: number;
  totalAmount: number;
  cbmLimit: number;
  daysHorizon: number;
  markdownReport: string;
}

/* ───────── XML generator ───────── */
function generateExcelXML(order: PurchaseOrder): string {
  const d = order.date;
  const rows = order.lines.map(l => `
   <Row>
    <Cell><Data ss:Type="Number">${l.no}</Data></Cell>
    <Cell><Data ss:Type="String">${l.sku}</Data></Cell>
    <Cell><Data ss:Type="String">${l.photoUrl ? '=HYPERLINK("' + l.photoUrl + '","📷 Ver Foto")' : ''}</Data></Cell>
    <Cell><Data ss:Type="String">${l.description}</Data></Cell>
    <Cell><Data ss:Type="Number">${l.packing}</Data></Cell>
    <Cell><Data ss:Type="Number">${l.qty}</Data></Cell>
    <Cell><Data ss:Type="Number">${l.price}</Data></Cell>
    <Cell><Data ss:Type="Number">${l.ctn}</Data></Cell>
    <Cell><Data ss:Type="Number">${l.cbmCtn}</Data></Cell>
    <Cell><Data ss:Type="Number">${l.cbm}</Data></Cell>
    <Cell><Data ss:Type="Number">${l.amount}</Data></Cell>
   </Row>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="header">
   <Font ss:Bold="1" ss:Size="11" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#008000" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
  </Style>
  <Style ss:ID="title">
   <Font ss:Bold="1" ss:Size="14"/>
   <Alignment ss:Horizontal="Center"/>
  </Style>
  <Style ss:ID="currency">
   <NumberFormat ss:Format="$ #,##0.00"/>
  </Style>
  <Style ss:ID="totalRow">
   <Font ss:Bold="1" ss:Size="11"/>
   <Interior ss:Color="#D9EAD3" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Purchase Order">
  <Table>
   <Column ss:Width="40"/>
   <Column ss:Width="80"/>
   <Column ss:Width="100"/>
   <Column ss:Width="140"/>
   <Column ss:Width="80"/>
   <Column ss:Width="80"/>
   <Column ss:Width="80"/>
   <Column ss:Width="60"/>
   <Column ss:Width="80"/>
   <Column ss:Width="80"/>
   <Column ss:Width="100"/>

   <Row ss:StyleID="title">
    <Cell ss:MergeAcross="10"><Data ss:Type="String">PURCHASE ORDER — NEXUSIQ</Data></Cell>
   </Row>
   <Row>
    <Cell ss:MergeAcross="5"><Data ss:Type="String">BUYER: J.SCHRUBER COMERCIAL-UTILIDADES LTDA</Data></Cell>
    <Cell ss:MergeAcross="4"><Data ss:Type="String">Data: ${d}</Data></Cell>
   </Row>
   <Row>
    <Cell ss:MergeAcross="10"><Data ss:Type="String">Attn: Rua Chile, 1389 - Padro Velho Curitiba - Paraná - Brazil</Data></Cell>
   </Row>
   <Row/>

   <Row ss:StyleID="header">
    <Cell><Data ss:Type="String">Nº</Data></Cell>
    <Cell><Data ss:Type="String">SKU</Data></Cell>
    <Cell><Data ss:Type="String">Picture</Data></Cell>
    <Cell><Data ss:Type="String">Descrição</Data></Cell>
    <Cell><Data ss:Type="String">Packing</Data></Cell>
    <Cell><Data ss:Type="String">QTY (pcs)</Data></Cell>
    <Cell><Data ss:Type="String">Price (USD)</Data></Cell>
    <Cell><Data ss:Type="String">CTN</Data></Cell>
    <Cell><Data ss:Type="String">CBM/CTN</Data></Cell>
    <Cell><Data ss:Type="String">CBM</Data></Cell>
    <Cell><Data ss:Type="String">AMOUNT</Data></Cell>
   </Row>
   ${rows}

   <Row ss:StyleID="totalRow">
    <Cell><Data ss:Type="String">TOTAL</Data></Cell>
    <Cell/>
    <Cell/>
    <Cell/>
    <Cell/>
    <Cell><Data ss:Type="Number">${order.totalQty}</Data></Cell>
    <Cell/>
    <Cell/>
    <Cell/>
    <Cell><Data ss:Type="Number">${order.totalCbm.toFixed(2)}</Data></Cell>
    <Cell ss:StyleID="currency"><Data ss:Type="Number">${order.totalAmount.toFixed(2)}</Data></Cell>
   </Row>

   <Row/>
   <Row>
    <Cell ss:MergeAcross="10"><Data ss:Type="String">Lead Time: 30-45 days (10 days prevent emergencies)</Data></Cell>
   </Row>
   <Row>
    <Cell ss:MergeAcross="10"><Data ss:Type="String">FOB XIAMEN</Data></Cell>
   </Row>
  </Table>
 </Worksheet>
</Workbook>`;
}

function downloadXML(order: PurchaseOrder) {
  const xml = generateExcelXML(order);
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `PO_VixCommerce_${order.date.replace(/\//g, '-')}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ───────── Build PO from AI recommendation or fallback to Knapsack ───────── */
function buildPurchaseOrder(
  comprasItems: any[],
  cbmLimit: number,
  daysHorizon: number,
  markdownReport: string
): PurchaseOrder {
  if (!comprasItems?.length) {
    return emptyOrder(cbmLimit, daysHorizon, markdownReport);
  }

  // Helper: get CBM per unit from comprasItems
  const getCbmPerUnit = (sku: string) => {
    const item = comprasItems.find(c => c.sku?.toUpperCase() === sku.toUpperCase());
    if (!item || !item.cbmTotal || !item.pedidoSugerido || item.pedidoSugerido <= 0) return 0;
    return item.cbmTotal / item.pedidoSugerido;
  };
  const getItem = (sku: string) => comprasItems.find(c => c.sku?.toUpperCase() === sku.toUpperCase());

  let lines: PurchaseOrderLine[] = [];

  // ═══════ Strategy 1: Parse JSON block from AI response ═══════
  // The AI is instructed to include ```json {"purchase_order": [...]} ```
  const jsonMatch = markdownReport.match(/```json\s*\n?([\s\S]*?)```/i);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      const poItems = parsed.purchase_order || parsed.purchaseOrder || parsed.items || [];
      if (Array.isArray(poItems) && poItems.length > 0) {
        let no = 1;
        for (const item of poItems) {
          const sku = (item.sku || item.SKU || '').toUpperCase();
          if (!sku) continue;
          const compraItem = getItem(sku);
          const qty = item.qty || item.quantity || item.qtd || 0;
          const price = item.price || item.custo || compraItem?.custoProduto || 0;
          const cbmPerUnit = getCbmPerUnit(sku);
          const cbm = item.cbm || qty * cbmPerUnit;

          lines.push({
            no: no++,
            sku,
            description: item.description || item.descricao || compraItem?.categoria || '',
            packing: 1,
            qty,
            price: Math.round(price * 100) / 100,
            ctn: qty,
            cbmCtn: Math.round(cbmPerUnit * 10000) / 10000,
            cbm: Math.round(cbm * 100) / 100,
            amount: Math.round(qty * price * 100) / 100,
          });
        }
        console.log(`[NexusIQ] PO from JSON: ${lines.length} SKUs parsed`);
      }
    } catch (e) {
      console.error('[NexusIQ] JSON parse failed:', e);
    }
  }

  // ═══════ Strategy 2: Regex on markdown tables (fallback) ═══════
  if (lines.length === 0) {
    const planPatterns = [
      /(?:Plano\s+Final[^\n]*)\n([\s\S]*?)(?:\n[|\s]*TOTAL|\n#{1,4}\s|\n\*{2,}\s*\d+\.|$)/i,
      /(?:Plano\s+Otimizado[^\n]*)\n([\s\S]*?)(?:\n[|\s]*TOTAL|\n#{1,4}\s|\n\*{2,}\s*\d+\.|$)/i,
      /(?:QTD\s*Recomendad[ao][^\n]*)\n([\s\S]*?)(?:\n[|\s]*TOTAL|\n#{1,4}\s|\n\*{2,}\s*\d+\.|$)/i,
    ];

    let planText: string | null = null;
    for (const pat of planPatterns) {
      const m = markdownReport.match(pat);
      if (m && m[1]) { planText = m[1]; break; }
    }

    if (planText) {
      const skuLinePattern = /^[|\s]*(?:\d+[º°]?\s+)?(FC-\d+\w*|KIT-?\w+|BA-\w+|BT\w+|BS\w+|LU\w+|E\d+|\d{10,})\s+/gim;
      const processedSkus = new Set<string>();
      let no = 1;
      for (const match of planText.matchAll(skuLinePattern)) {
        const sku = match[1].toUpperCase();
        if (processedSkus.has(sku)) continue;
        processedSkus.add(sku);
        const lineStart = match.index!;
        const lineEnd = planText.indexOf('\n', lineStart);
        const fullLine = planText.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
        const afterSku = fullLine.slice(match[0].length);
        const numbers: number[] = [];
        for (const nm of afterSku.matchAll(/[\d]+[.,]?\d*/g)) {
          const n = parseFloat(nm[0].replace(/\./g, '').replace(',', '.'));
          if (!isNaN(n) && n > 0) numbers.push(n);
        }
        const qty = numbers.find(n => n >= 10 && n <= 100000) || 0;
        if (qty <= 0) continue;
        const compraItem = getItem(sku);
        const price = compraItem?.custoProduto || 0;
        const cbmPerUnit = getCbmPerUnit(sku);
        lines.push({
          no: no++, sku, description: compraItem?.categoria || '', packing: 1, qty,
          price: Math.round(price * 100) / 100, ctn: qty,
          cbmCtn: Math.round(cbmPerUnit * 10000) / 10000,
          cbm: Math.round(qty * cbmPerUnit * 100) / 100,
          amount: Math.round(qty * price * 100) / 100,
        });
      }
      console.log(`[NexusIQ] PO from regex: ${lines.length} SKUs parsed`);
    }
  }

  // ═══════ Strategy 3: Fallback — algorithmic Knapsack ═══════
  if (lines.length === 0) {
    const allItems = comprasItems
      .filter(d => d.sku && d.cbmTotal && d.pedidoSugerido && d.pedidoSugerido > 0)
      .map(d => {
        const cbmPerUnit = d.cbmTotal / d.pedidoSugerido;
        const demanda = Math.ceil((d.mediaVendaDiaria || 0) * daysHorizon);
        const diasRuptura = typeof d.diasParaRuptura === 'number' ? d.diasParaRuptura : 999;
        const isCritical = diasRuptura < daysHorizon;
        const lucroCBM = d.lucroPorCBM || 0;
        return { ...d, cbmPerUnit, demanda, diasRuptura, isCritical, lucroCBM,
          qtyNeeded: Math.max(demanda - (d.onHand || 0), 0) };
      })
      .filter(d => d.cbmPerUnit > 0 && d.qtyNeeded > 0)
      .sort((a, b) => {
        if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1;
        return b.lucroCBM - a.lucroCBM;
      });

    let runningCbm = 0;
    for (const item of allItems) {
      let qty = item.qtyNeeded;
      let cbm = qty * item.cbmPerUnit;
      if (runningCbm + cbm > cbmLimit) {
        qty = Math.floor((cbmLimit - runningCbm) / item.cbmPerUnit);
        if (qty <= 0) continue;
        cbm = qty * item.cbmPerUnit;
      }
      runningCbm += cbm;
      lines.push({
        no: lines.length + 1, sku: item.sku, description: item.categoria || '',
        packing: 1, qty,
        price: Math.round((item.custoProduto || 0) * 100) / 100,
        ctn: qty,
        cbmCtn: Math.round(item.cbmPerUnit * 10000) / 10000,
        cbm: Math.round(cbm * 100) / 100,
        amount: Math.round(qty * (item.custoProduto || 0) * 100) / 100,
      });
      if (runningCbm >= cbmLimit - 0.01) break;
    }
  }

  // Enforce CBM limit
  let runCbm = 0;
  const capped: PurchaseOrderLine[] = [];
  for (const line of lines) {
    if (runCbm + line.cbm <= cbmLimit + 0.5) {
      runCbm += line.cbm;
      line.no = capped.length + 1;
      capped.push(line);
    }
  }
  lines = capped;

  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const totalCbm = lines.reduce((s, l) => s + l.cbm, 0);
  const totalAmount = lines.reduce((s, l) => s + l.amount, 0);

  const now = new Date();
  const date = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;

  return {
    id: crypto.randomUUID(),
    date,
    lines,
    totalQty,
    totalCbm,
    totalAmount,
    cbmLimit,
    daysHorizon,
    markdownReport,
  };
}

function emptyOrder(cbmLimit: number, daysHorizon: number, report: string): PurchaseOrder {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    date: `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`,
    lines: [],
    totalQty: 0,
    totalCbm: 0,
    totalAmount: 0,
    cbmLimit,
    daysHorizon,
    markdownReport: report,
  };
}

/* ───────── Component ───────── */
// ─── Calcula VMD e histórico real a partir da planilha de Vendas ───
function calcVMDFromVendas(
  sku: string,
  vendas: VendaItem[] | null
): { vmd_real: number; historico_mensal: Record<string, number>; total_180d: number } {
  if (!vendas?.length) return { vmd_real: 0, historico_mensal: {}, total_180d: 0 };

  const hoje = new Date();
  const limite = new Date(hoje);
  limite.setDate(hoje.getDate() - 180);

  const skuUpper = sku.toUpperCase();

  // Filtrar vendas do SKU nos últimos 180 dias, excluindo canceladas
  const linhas = vendas.filter(v => {
    if (v.sku?.toUpperCase() !== skuUpper) return false;
    if (v.statusPedido?.toLowerCase().includes('cancelad')) return false;
    const d = new Date(v.data);
    return !isNaN(d.getTime()) && d >= limite;
  });

  // Agrupar por mês
  const historico_mensal: Record<string, number> = {};
  let total = 0;
  for (const v of linhas) {
    const d = new Date(v.data);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    historico_mensal[chave] = (historico_mensal[chave] || 0) + (v.quantidade || 0);
    total += v.quantidade || 0;
  }

  // Dias reais com vendas no período
  const diasComDados = Object.keys(historico_mensal).length * 30; // aproximação por mês
  const diasEfetivos = Math.max(diasComDados, 30); // mínimo 30 dias

  return {
    vmd_real: total / Math.min(180, diasEfetivos),
    historico_mensal,
    total_180d: total,
  };
}

export function ComprasAIChat({ onOrderGenerated }: { onOrderGenerated?: (order: PurchaseOrder) => void }) {
  const { comprasItems, vendasItems } = useSheetsData();
  const [cbmLimit, setCbmLimit] = useState(69);
  const [daysHorizon, setDaysHorizon] = useState(30);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [currentOrder, setCurrentOrder] = useState<PurchaseOrder | null>(null);
  const [copied, setCopied] = useState(false);

  // Email state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('ATENDIMENTO@VIAFLIX.COM.BR');
  const [sendingEmail, setSendingEmail] = useState(false);

  // Multi-Agent states
  const [agentSteps, setAgentSteps] = useState<{id: string; label: string; status: 'pending'|'running'|'done'|'error'}[]>([]);

  // SopChat data — saved after successful analysis
  const [sopData, setSopData] = useState<{
    knapsack: any;
    demandas: any[];
    metricas: any[];
    skusPayload: any[];
  } | null>(null);
  
  const AGENT_STEPS = [
    { id: 'agent1', label: 'Filtros & Exclusões' },
    { id: 'agent2', label: 'Cálculo de Demanda' },
    { id: 'agent3', label: 'CBM por Unidade' },
    { id: 'agent4', label: 'Métricas de Otimização' },
    { id: 'agent5', label: 'Knapsack — Alocação' },
    { id: 'agent6', label: 'Relatório & Estratégia' },
  ];

  const handleAnalise = async () => {
    setLoading(true);
    setResult(null);
    setCurrentOrder(null);
    setAgentSteps(AGENT_STEPS.map(s => ({ ...s, status: 'pending' })));

    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Preparar dados dos SKUs para enviar
      const skusPayload = comprasItems?.map(d => {
        // Cruzar com dados reais de vendas
        const { vmd_real, historico_mensal, total_180d } = calcVMDFromVendas(d.sku, vendasItems);

        // Usar VMD real se disponível, senão usar da planilha de compras
        const vmd_final = vmd_real > 0 ? vmd_real : d.mediaVendaDiaria;
        const vmd_recente_final = (d as any).vmdRecente > 0 ? (d as any).vmdRecente : vmd_real;

        return {
          sku: d.sku,
          cat: d.categoria,
          abc: d.curvaABC,
          custo: d.custoProduto,
          margem: (d as any).margemJanFev || d.margemAtual || 0,
          taxa_dev: (d as any).taxaDevolucao || 0,
          vmd: vmd_final,                         // VMD calculada das vendas reais
          vmd_planilha: d.mediaVendaDiaria,       // VMD original da planilha (referência)
          vmd_recente: vmd_recente_final,
          historico_mensal,                        // ex: {"2025-10": 320, "2025-11": 290, ...}
          total_180d,                              // total vendido nos últimos 180 dias
          bias: (d as any).bias || 1,
          estoque: d.onHand,
          dias_rupu: d.diasParaRuptura,
          parar: (d as any).pararDeTrazer || '',
          check: (d as any).checkDemanda || '',
          transito_bm: (d as any).containerBM || 0,
          pedido_user: d.pedidoSugerido,
          cbm_unit: d.cbmTotal > 0 && d.pedidoSugerido > 0
            ? d.cbmTotal / d.pedidoSugerido
            : 0,
          cbm_tot_user: d.cbmTotal,
          lucro_cbm: d.lucroPorCBM,
          status: d.statusProjecao,
          abr_sop: d.tendenciaMeses?.abr || 0,
          dias_seg: 15,
        };
      }) || [];

      // Atualizar agentes visualmente conforme logs chegam
      const updateStep = (stepId: string, status: 'running'|'done'|'error') => {
        setAgentSteps(prev => prev.map(s => s.id === stepId ? { ...s, status } : s));
      };

      // Simulação Visual Autêntica (Já que Agentes 1 a 4 são Nativos e rodam em 0s)
      setTimeout(() => {
        setAgentSteps(AGENT_STEPS.map((s, i) => {
          if (i < 4) return { ...s, status: 'done' }; // 1 a 4 instantâneos
          if (i === 4) return { ...s, status: 'running' }; // Knapsack processando
          return { ...s, status: 'pending' };
        }));
      }, 1000);

      // Após ~35s, o Knapsack (Agent 5) termina e o Claude começa o Relatório (Agent 6)
      const agent6Timer = setTimeout(() => {
        setAgentSteps(prev => prev.map((s, i) => {
          if (i === 4) return { ...s, status: 'done' };
          if (i === 5) return { ...s, status: 'running' };
          return s;
        }));
      }, 35000);
      
      const { data, error } = await supabase.functions.invoke('sop-optimizer', {
        body: {
          skus: skusPayload,
          cbm_limit: cbmLimit,
          days_horizon: daysHorizon,
        },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });

      clearTimeout(agent6Timer);

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      // Marcar todos como done
      setAgentSteps(AGENT_STEPS.map(s => ({ ...s, status: 'done' })));

      const answer = data?.answer || '';
      setResult(answer);

      // Save raw data for the SopChat review panel
      setSopData({
        knapsack: data.knapsack,
        demandas: data.demandas || [],
        metricas: data.metricas || [],
        skusPayload,
      });

      // Construir purchase order a partir do JSON retornado pela Edge Function
      if (data?.purchase_order?.length > 0) {
        const lines = data.purchase_order.map((item: any, idx: number) => ({
          no: idx + 1,
          sku: item.sku,
          description: item.description || '',
          packing: 1,
          qty: item.qty,
          price: Math.round(item.price * 100) / 100,
          ctn: item.qty,
          cbmCtn: item.cbm_unit || 0,
          cbm: item.cbm,
          amount: Math.round(item.qty * item.price * 100) / 100,
        }));

        const now = new Date();
        const order: PurchaseOrder = {
          id: crypto.randomUUID(),
          date: `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()}`,
          lines,
          totalQty: lines.reduce((s: number, l: any) => s + l.qty, 0),
          totalCbm: lines.reduce((s: number, l: any) => s + l.cbm, 0),
          totalAmount: lines.reduce((s: number, l: any) => s + l.amount, 0),
          cbmLimit,
          daysHorizon,
          markdownReport: answer,
        };
        setCurrentOrder(order);
        if (onOrderGenerated) onOrderGenerated(order);
      }

    } catch (err: any) {
      setAgentSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error' } : s));
      setResult('❌ Erro: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── handleRerun: re-roda o knapsack nativo com parâmetros do chat ────────
  const handleRerun = async (params: any) => {
    if (!sopData?.skusPayload) return;
    setLoading(true);
    setAgentSteps(AGENT_STEPS.map(s => ({ ...s, status: 'pending' })));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const filtros = params.filtros_extras || {};
      let skusParaEnviar = [...sopData.skusPayload];

      if (filtros.skus_forcar_excluir?.length > 0) {
        const excluir = filtros.skus_forcar_excluir.map((s: string) => s.toUpperCase());
        skusParaEnviar = skusParaEnviar.map(s =>
          excluir.includes(s.sku.toUpperCase()) ? { ...s, parar: 'Não vou mais trazer' } : s
        );
      }
      if (filtros.skus_forcar_incluir?.length > 0) {
        const incluir = filtros.skus_forcar_incluir.map((s: string) => s.toUpperCase());
        skusParaEnviar = skusParaEnviar.map(s =>
          incluir.includes(s.sku.toUpperCase()) ? { ...s, check: '', parar: '', forcar_incluir: true } : s
        );
      }
      if (filtros.apenas_criticos) {
        const criticos = new Set(sopData.demandas.filter((d: any) => d.status === 'critico').map((d: any) => d.sku));
        skusParaEnviar = skusParaEnviar.map(s =>
          !criticos.has(s.sku) ? { ...s, check: 'Não comprar' } : s
        );
      }
      if (filtros.abc_excluir?.length > 0) {
        const abcEx = filtros.abc_excluir.map((s: string) => s.toUpperCase());
        skusParaEnviar = skusParaEnviar.map(s =>
          abcEx.includes((s.abc || '').toUpperCase()) ? { ...s, parar: 'Não vou mais trazer' } : s
        );
      }

      setTimeout(() => {
        setAgentSteps(AGENT_STEPS.map((s, i) => ({
          ...s, status: i < 4 ? 'done' : i === 4 ? 'running' : 'pending',
        })));
      }, 800);
      const agent6Timer = setTimeout(() => {
        setAgentSteps(prev => prev.map((s, i) => ({
          ...s, status: i === 4 ? 'done' : i === 5 ? 'running' : s.status,
        })));
      }, 3000);

      const { data, error } = await supabase.functions.invoke('sop-optimizer', {
        body: { skus: skusParaEnviar, cbm_limit: params.cbm_limit || cbmLimit, days_horizon: params.days_horizon || daysHorizon },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      clearTimeout(agent6Timer);
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setAgentSteps(AGENT_STEPS.map(s => ({ ...s, status: 'done' })));
      setResult(data.answer || '');
      setSopData(prev => prev ? { ...prev, knapsack: data.knapsack, demandas: data.demandas || [], metricas: data.metricas || [] } : null);

      if (data?.purchase_order?.length > 0) {
        const lines = data.purchase_order.map((item: any, idx: number) => ({
          no: idx + 1, sku: item.sku, description: item.description || '',
          packing: 1, qty: item.qty, price: Math.round(item.price * 100) / 100,
          ctn: item.qty, cbmCtn: item.cbm_unit || 0, cbm: item.cbm,
          amount: Math.round(item.qty * item.price * 100) / 100,
        }));
        const now = new Date();
        const order: PurchaseOrder = {
          id: crypto.randomUUID(),
          date: `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()}`,
          lines, totalQty: lines.reduce((s: number, l: any) => s + l.qty, 0),
          totalCbm: lines.reduce((s: number, l: any) => s + l.cbm, 0),
          totalAmount: lines.reduce((s: number, l: any) => s + l.amount, 0),
          cbmLimit: params.cbm_limit || cbmLimit, daysHorizon: params.days_horizon || daysHorizon, markdownReport: data.answer || '',
        };
        setCurrentOrder(order);
        if (onOrderGenerated) onOrderGenerated(order);
      }
      toast.success('Novo pedido gerado com sucesso!');
    } catch (err: any) {
      toast.error('Erro ao re-gerar pedido: ' + err.message);
      setAgentSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error' } : s));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result);
    setCopied(true);
    toast.success('Relatório copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadXML = () => {
    if (!currentOrder) return;
    downloadXML(currentOrder);
    toast.success('Arquivo XML baixado!');
  };

  const handleSendEmail = async () => {
    if (!currentOrder || !emailTo.trim()) return;
    setSendingEmail(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const xml = generateExcelXML(currentOrder);

      const { error } = await supabase.functions.invoke('send-purchase-order', {
        body: {
          to: emailTo.trim(),
          subject: `Purchase Order — NEXUSIQ — ${currentOrder.date}`,
          xml_content: xml,
          filename: `PO_VixCommerce_${currentOrder.date.replace(/\//g, '-')}.xls`,
          summary: `Total: ${currentOrder.lines.length} SKUs | ${currentOrder.totalQty} pcs | ${currentOrder.totalCbm.toFixed(2)} CBM | $${currentOrder.totalAmount.toFixed(2)}`,
        },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });

      if (error) throw new Error(error.message);
      toast.success(`Pedido enviado para ${emailTo}!`);
      setShowEmailModal(false);
    } catch (err: any) {
      toast.error('Erro ao enviar: ' + err.message);
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <Card className="p-6 border-none shadow-xl bg-gradient-to-br from-indigo-900/40 via-background to-background relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20"></div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10 mb-6 border-b border-border/50 pb-6">
        <div>
          <h2 className="text-xl font-black text-foreground flex items-center gap-2 tracking-tight">
            <Brain className="w-6 h-6 text-indigo-400" />
            Otimizador S&amp;OP Avançado
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            A IA analisará todos os seus SKUs, calculará a lucratividade por m³ e encontrará
            a montagem perfeita do container (Algoritmo Knapsack) para maximizar seu lucro sem estourar o espaço.
          </p>
        </div>

        <div className="flex bg-card/50 backdrop-blur-sm p-4 rounded-xl border border-border/50 gap-6 items-center flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
              <Maximize className="w-3 h-3" /> Capacidade CBM
            </label>
            <div className="relative">
              <input
                type="number"
                value={cbmLimit}
                onChange={e => setCbmLimit(Number(e.target.value))}
                className="w-24 bg-background border border-input rounded-md px-3 py-1.5 text-sm font-semibold"
              />
              <span className="absolute right-3 top-1.5 text-xs text-muted-foreground font-medium">m³</span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
              <Settings2 className="w-3 h-3" /> Horizonte
            </label>
            <div className="relative">
              <input
                type="number"
                value={daysHorizon}
                onChange={e => setDaysHorizon(Number(e.target.value))}
                className="w-24 bg-background border border-input rounded-md px-3 py-1.5 text-sm font-semibold"
              />
              <span className="absolute right-3 top-1.5 text-xs text-muted-foreground font-medium">dias</span>
            </div>
          </div>

          <Button
            onClick={handleAnalise}
            disabled={loading || !comprasItems?.length}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 mt-5 md:mt-0"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Otimizando...</>
              : <><Brain className="w-4 h-4 mr-2" />Montar Container</>
            }
          </Button>
        </div>
      </div>

      {/* Progresso dos agentes */}
      {agentSteps.length > 0 && (
        <div className="relative z-10 mt-4 mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            {agentSteps.map((step, idx) => (
              <div key={step.id} className="flex items-center gap-1.5">
                {idx > 0 && <div className="w-4 h-px bg-border hidden sm:block" />}
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  step.status === 'done'    ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/20' :
                  step.status === 'running' ? 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-500/30 animate-pulse' :
                  step.status === 'error'   ? 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-500/20' :
                  'bg-muted/50 text-muted-foreground border border-border'
                }`}>
                  {step.status === 'done'    && <span>✓</span>}
                  {step.status === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
                  {step.status === 'error'   && <span>✗</span>}
                  {step.status === 'pending' && <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />}
                  {step.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div className="relative z-10 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 items-center">
            <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2">
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <ClipboardCopy className="w-4 h-4" />}
              {copied ? 'Copiado!' : 'Copiar Relatório'}
            </Button>

            {currentOrder && (
              <>
                <Button variant="outline" size="sm" onClick={handleDownloadXML} disabled={currentOrder.lines.length === 0} className="gap-2 border-emerald-500/50 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
                  <Download className="w-4 h-4" />
                  Baixar XML {currentOrder.lines.length > 0 ? `(${currentOrder.lines.length} SKUs)` : ''}
                </Button>

                <Button
                  variant="outline" size="sm"
                  onClick={() => setShowEmailModal(true)}
                  disabled={currentOrder.lines.length === 0}
                  className="gap-2 border-blue-500/50 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                >
                  <Mail className="w-4 h-4" />
                  Enviar por E-mail
                </Button>

                <span className="text-xs text-muted-foreground ml-auto">
                  {currentOrder.totalCbm.toFixed(2)} CBM · ${currentOrder.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </>
            )}
          </div>

          {/* Email modal */}
          {showEmailModal && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-lg">
              <h3 className="font-bold text-sm">📧 Enviar Pedido por E-mail</h3>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground font-medium">E-mail do Fornecedor</label>
                  <input
                    type="email"
                    value={emailTo}
                    onChange={e => setEmailTo(e.target.value)}
                    placeholder="fornecedor@email.com"
                    className="w-full mt-1 bg-background border border-input rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex gap-2 items-end">
                  <Button size="sm" onClick={handleSendEmail} disabled={sendingEmail} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                    {sendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    {sendingEmail ? 'Enviando...' : 'Enviar'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowEmailModal(false)}>Cancelar</Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">O arquivo XML do pedido será anexado ao e-mail automaticamente.</p>
            </div>
          )}

          {/* Report content — structured sections */}
          <KnapsackReport markdown={result} order={currentOrder} />

          {/* SopChat — chat de revisão com re-run automático */}
          {sopData && (
            <SopChat
              knapsack={sopData.knapsack}
              demandas={sopData.demandas}
              metricas={sopData.metricas}
              cbmLimit={cbmLimit}
              daysHorizon={daysHorizon}
              onRerun={handleRerun}
            />
          )}
        </div>
      )}
    </Card>
  );
}
