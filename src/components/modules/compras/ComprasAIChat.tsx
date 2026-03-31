import { useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, Settings2, Loader2, Maximize, Download, Mail, ClipboardCopy, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

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
export function ComprasAIChat({ onOrderGenerated }: { onOrderGenerated?: (order: PurchaseOrder) => void }) {
  const { comprasItems } = useSheetsData();
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

  const handleAnalise = async () => {
    setLoading(true);
    setResult(null);
    setCurrentOrder(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const systemPrompt = `Você é um especialista em planejamento de demanda, S&OP e otimização de compras com restrição logística (CBM).

Você possui três grandes objetivos que precisamos de um output:
1) Definir a quantidade ótima de compra por SKU maximizando o lucro total esperado, respeitando a limitação de espaço (CBM) disponível.
2) Criar uma visão auditável da demanda estimada do período
3) Criticar/complementar o exercício que o usuário mesmo criou baseado nas premissas dele para a compra do período, comparando com a sua sugestão com análises objetivas da diferença entre um e outro.

---
0. Parâmetros do Problema
Considere:
- Capacidade total disponível: [Máximo de ${cbmLimit} CBMs]
- Horizonte de planejamento: [a compra prevista é para ${daysHorizon} dias de vendas]

1. Coleta de Dados
Para cada SKU, analise os dados enviados no JSON.

2. Tratamento dos Dados
Identifique tendência, sazonalidade e outliers se possível.

3. Cálculo da Demanda
Média de venda diária e Demanda projetada no período.

4. Cálculo de Métricas de Otimização
Lucro Unitário = Receita (ou CustoProduto * (Margem/100))
Lucro por CBM = Lucro Unitário / CBM por unidade
Classifique os SKUs do maior para o menor lucro por CBM.

5. Restrições Operacionais
Garanta que SKUs com risco de ruptura tenham reposição mínima (Estoque Mínimo).

6. Otimização da Compra (Core do Problema)
Distribua o espaço disponível (CBM) da seguinte forma:
1. Reserve CBM para reposição mínima dos SKUs críticos (ruptura < ${daysHorizon} dias).
2. Com o restante, priorize SKUs com maior lucro por CBM (algoritmo tipo "knapsack problem").
3. REGRA OBRIGATÓRIA: SE a soma dos CBMs dos itens selecionados for MENOR que ${cbmLimit} CBMs, AUMENTE as quantidades dos SKUs mais lucrativos (maior lucro por CBM) até preencher TODO o espaço. O container DEVE ser utilizado a pelo menos 95% da capacidade (${Math.round(cbmLimit * 0.95)} CBMs mínimo).

7. Output Final
Apresente a tabela final de recomendação e consolidação (CBM utilizado, Lucro esperado, Top SKUs por eficiência, SKUs que ficaram de fora).

A tabela de "Plano Otimizado Recomendado" DEVE conter a coluna SKU com o código exato (ex: FC-138, FC-71, etc.) e QTD recomendada.

REGRA FUNDAMENTAL: O total de CBM do plano otimizado NÃO PODE ultrapassar ${cbmLimit} CBMs, mas DEVE utilizar pelo menos 95% (${Math.round(cbmLimit * 0.95)} CBMs). Se sobrar espaço, adicione mais unidades dos produtos com maior lucro/CBM.

8. Camada Estratégica
Onde há trade-offs, riscos e sugestões.

9. OBRIGATÓRIO — Bloco JSON para Pedido de Compra
NO FINAL DO RELATÓRIO, você DEVE incluir um bloco de código JSON (entre \`\`\`json e \`\`\`) com EXATAMENTE os SKUs recomendados para compra. Este bloco é CRÍTICO — o sistema lê este JSON para gerar automaticamente o Purchase Order. Se você não incluir este bloco, o pedido não será gerado.

Formato OBRIGATÓRIO:
\`\`\`json
{"purchase_order": [
  {"sku": "FC-138", "qty": 2700, "description": "Torneira", "price": 1.63, "cbm": 7.65},
  {"sku": "FC-02", "qty": 1140, "description": "Torneira", "price": 2.46, "cbm": 1.48}
]}
\`\`\`
Use os dados reais do contexto. O campo "price" é o custo unitário em USD. O campo "cbm" é o CBM total para aquela quantidade. Inclua APENAS os SKUs que entraram no plano otimizado. A soma dos CBMs DEVE estar entre ${Math.round(cbmLimit * 0.95)} e ${cbmLimit} CBMs.

GERE SEU OUTPUT COMPLETAMENTE EM MARKDOWN FORMATADO, COM TABELAS (usando |) E NEGRITO ONDE APLICÁVEL. Formate como um relatório executivo requintado.`;

      const context_data = {
        compras: comprasItems?.map(d => ({
          sku: d.sku,
          cat: d.categoria,
          custo: d.custoProduto,
          vmd: d.mediaVendaDiaria,
          estoque: d.onHand,
          dias_rupu: d.diasParaRuptura,
          pedido_user: d.pedidoSugerido,
          cbm_tot_user: d.cbmTotal,
          lucro_cbm: d.lucroPorCBM,
          custo_tot_user: d.custoTotalPedido,
          jan: d.tendenciaMeses?.jan,
          fev: d.tendenciaMeses?.fev
        })) || [],
      };

      const { data, error } = await supabase.functions.invoke('ai-analyst', {
        body: {
          mode: 'sop_knapsack',
          question: 'Execute a otimização Knapsack com base no meu json atual de compras.',
          context_data,
          system_prompt: systemPrompt
        },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });

      if (error) throw new Error(error.message);

      const answer = data?.answer || 'Sem reposta do assistente.';
      setResult(answer);

      // Build purchase order algorithmically (Knapsack) from comprasItems data
      const order = buildPurchaseOrder(comprasItems || [], cbmLimit, daysHorizon, answer);
      setCurrentOrder(order);

      // Fetch photos for each SKU in the PO (in parallel)
      if (order.lines.length > 0) {
        toast.info('Buscando fotos dos produtos...');
        try {
          const photoPromises = order.lines.map(async (line) => {
            try {
              const { data: photoData } = await supabase.functions.invoke('drive-photos', {
                body: { sku: line.sku, account_name: '', fetch_dimensions: false },
                headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
              });
              if (photoData?.photos?.found && photoData.photos.urls?.length > 0) {
                line.photoUrl = photoData.photos.urls[0];
              }
            } catch { /* skip photo for this SKU */ }
          });
          await Promise.allSettled(photoPromises);
          const photosFound = order.lines.filter(l => l.photoUrl).length;
          if (photosFound > 0) toast.success(`${photosFound} fotos encontradas!`);
          // Update state with photos
          setCurrentOrder({ ...order });
        } catch { /* photo fetch failed silently */ }
      }

      if (onOrderGenerated) onOrderGenerated(order);

    } catch (err: any) {
      setResult('Erro ao conectar com a IA: ' + err.message);
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
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Brain className="w-4 h-4 mr-2" />}
            {loading ? 'Calculando Knapsack...' : 'Montar Container'}
          </Button>
        </div>
      </div>

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

          {/* Report content */}
          <div className="prose prose-sm md:prose-base max-w-none
            bg-white dark:bg-slate-900/60 rounded-xl p-6 border border-indigo-200/60 dark:border-slate-700/50 shadow-sm
            prose-headings:text-indigo-700 dark:prose-headings:text-indigo-300
            prose-a:text-indigo-600 dark:prose-a:text-indigo-400
            prose-strong:text-foreground
            prose-th:bg-indigo-50 dark:prose-th:bg-indigo-950/50 prose-th:p-2.5 prose-th:text-xs prose-th:font-bold prose-th:text-indigo-800 dark:prose-th:text-indigo-200
            prose-td:p-2.5 prose-td:text-sm
            prose-tr:border-indigo-100 dark:prose-tr:border-slate-700
            prose-table:border prose-table:border-indigo-200 dark:prose-table:border-slate-700 prose-table:rounded-lg prose-table:overflow-hidden">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {result}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </Card>
  );
}
