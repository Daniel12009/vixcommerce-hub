import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Mail, Loader2, FileSpreadsheet, Calendar, Package, DollarSign, Box, Eye, EyeOff, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PurchaseOrder } from './ComprasAIChat';

const STORAGE_KEY = 'vix_purchase_orders';

function loadOrders(): PurchaseOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveOrders(orders: PurchaseOrder[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

export function addOrderToHistory(order: PurchaseOrder) {
  const orders = loadOrders();
  orders.unshift(order);
  saveOrders(orders);
}

/* ───────── XML generator (duplicated for standalone use) ───────── */
function generateExcelXML(order: PurchaseOrder): string {
  const d = order.date;
  const rows = order.lines.map(l => `
   <Row>
    <Cell><Data ss:Type="Number">${l.no}</Data></Cell>
    <Cell><Data ss:Type="String">${l.sku}</Data></Cell>
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
  <Style ss:ID="header"><Font ss:Bold="1" ss:Size="11" ss:Color="#FFFFFF"/><Interior ss:Color="#008000" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>
  <Style ss:ID="title"><Font ss:Bold="1" ss:Size="14"/><Alignment ss:Horizontal="Center"/></Style>
  <Style ss:ID="currency"><NumberFormat ss:Format="$ #,##0.00"/></Style>
  <Style ss:ID="totalRow"><Font ss:Bold="1" ss:Size="11"/><Interior ss:Color="#D9EAD3" ss:Pattern="Solid"/></Style>
 </Styles>
 <Worksheet ss:Name="Purchase Order">
  <Table>
   <Column ss:Width="40"/><Column ss:Width="80"/><Column ss:Width="160"/><Column ss:Width="80"/><Column ss:Width="80"/><Column ss:Width="80"/><Column ss:Width="60"/><Column ss:Width="80"/><Column ss:Width="80"/><Column ss:Width="100"/>
   <Row ss:StyleID="title"><Cell ss:MergeAcross="9"><Data ss:Type="String">PURCHASE ORDER — NEXUSIQ</Data></Cell></Row>
   <Row><Cell ss:MergeAcross="4"><Data ss:Type="String">BUYER: J.SCHRUBER COMERCIAL-UTILIDADES LTDA</Data></Cell><Cell ss:MergeAcross="4"><Data ss:Type="String">Data: ${d}</Data></Cell></Row>
   <Row><Cell ss:MergeAcross="9"><Data ss:Type="String">Attn: Rua Chile, 1389 - Padro Velho Curitiba - Paraná - Brazil</Data></Cell></Row>
   <Row/>
   <Row ss:StyleID="header">
    <Cell><Data ss:Type="String">Nº</Data></Cell><Cell><Data ss:Type="String">SKU</Data></Cell><Cell><Data ss:Type="String">Descrição</Data></Cell>
    <Cell><Data ss:Type="String">Packing</Data></Cell><Cell><Data ss:Type="String">QTY</Data></Cell><Cell><Data ss:Type="String">Price</Data></Cell>
    <Cell><Data ss:Type="String">CTN</Data></Cell><Cell><Data ss:Type="String">CBM/CTN</Data></Cell><Cell><Data ss:Type="String">CBM</Data></Cell><Cell><Data ss:Type="String">AMOUNT</Data></Cell>
   </Row>
   ${rows}
   <Row ss:StyleID="totalRow">
    <Cell><Data ss:Type="String">TOTAL</Data></Cell><Cell/><Cell/><Cell/>
    <Cell><Data ss:Type="Number">${order.totalQty}</Data></Cell><Cell/><Cell/><Cell/>
    <Cell><Data ss:Type="Number">${order.totalCbm.toFixed(2)}</Data></Cell>
    <Cell ss:StyleID="currency"><Data ss:Type="Number">${order.totalAmount.toFixed(2)}</Data></Cell>
   </Row>
   <Row/><Row><Cell ss:MergeAcross="9"><Data ss:Type="String">Lead Time: 30-45 days</Data></Cell></Row>
   <Row><Cell ss:MergeAcross="9"><Data ss:Type="String">FOB XIAMEN</Data></Cell></Row>
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

/* ───────── Component ───────── */
export function ComprasPedidos() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setOrders(loadOrders());
  }, []);

  const handleDelete = (id: string) => {
    const updated = orders.filter(o => o.id !== id);
    saveOrders(updated);
    setOrders(updated);
    toast.success('Pedido removido do histórico');
  };

  if (orders.length === 0) {
    return (
      <Card className="p-12 flex flex-col items-center justify-center text-center border-dashed">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <FileSpreadsheet className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold mb-2">Nenhum pedido gerado</h2>
        <p className="text-muted-foreground max-w-md">
          Use o Dashboard e o Otimizador S&OP para gerar um pedido de compra. Ele aparecerá aqui automaticamente.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-indigo-500" />
          Histórico de Pedidos ({orders.length})
        </h2>
      </div>

      {orders.map(order => (
        <Card key={order.id} className="overflow-hidden border-border/60 hover:border-indigo-300/50 transition-colors">
          <div className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Order summary row */}
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="font-semibold">{order.date}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Package className="w-4 h-4 text-blue-500" />
                  <span>{order.lines.length} SKUs</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Box className="w-4 h-4 text-amber-500" />
                  <span>{order.totalCbm.toFixed(2)} CBM</span>
                  <span className="text-xs text-muted-foreground">/ {order.cbmLimit} max</span>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                  <DollarSign className="w-4 h-4" />
                  <span>${order.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadXML(order)} className="gap-2 text-emerald-600 border-emerald-200 hover:bg-emerald-50">
                  <Download className="w-3.5 h-3.5" />
                  XML
                </Button>
                <Button
                  variant="outline" size="sm"
                  onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                  className="gap-2"
                >
                  {expandedId === order.id ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {expandedId === order.id ? 'Ocultar' : 'Detalhes'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(order.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Expanded details */}
            {expandedId === order.id && (
              <div className="mt-4 border-t pt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                {/* Lines table */}
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="px-3 py-2 text-left font-bold">Nº</th>
                        <th className="px-3 py-2 text-left font-bold">SKU</th>
                        <th className="px-3 py-2 text-left font-bold">Descrição</th>
                        <th className="px-3 py-2 text-right font-bold">QTY</th>
                        <th className="px-3 py-2 text-right font-bold">Price</th>
                        <th className="px-3 py-2 text-right font-bold">CBM</th>
                        <th className="px-3 py-2 text-right font-bold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.lines.map(line => (
                        <tr key={line.no} className="border-t border-border/50 hover:bg-muted/30">
                          <td className="px-3 py-2">{line.no}</td>
                          <td className="px-3 py-2 font-mono font-semibold">{line.sku}</td>
                          <td className="px-3 py-2 text-muted-foreground">{line.description}</td>
                          <td className="px-3 py-2 text-right">{line.qty.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">${line.price.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{line.cbm.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-semibold">${line.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/30 font-bold">
                        <td className="px-3 py-2" colSpan={3}>TOTAL</td>
                        <td className="px-3 py-2 text-right">{order.totalQty.toLocaleString()}</td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-right">{order.totalCbm.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">${order.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
