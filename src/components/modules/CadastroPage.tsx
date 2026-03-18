import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { mockProducts } from '@/lib/mock-data';
import { GESTOR_PADRAO } from '@/lib/utils-vix';
import type { Product } from '@/lib/types';
import { CheckCircle, Circle, FileText } from 'lucide-react';

export function CadastroPage() {
  const [selectedSku, setSelectedSku] = useState<string>(mockProducts[0].skuPrincipal);
  const product = mockProducts.find(p => p.skuPrincipal === selectedSku)!;

  const TabStatus = ({ complete }: { complete?: boolean }) => (
    complete ? <CheckCircle className="w-4 h-4 text-vix-success" /> : <Circle className="w-4 h-4 text-muted-foreground" />
  );

  return (
    <div>
      <PageHeader title="Ficha Técnica" subtitle={`Gestor responsável: ${GESTOR_PADRAO}`} />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* SKU List */}
        <div className="bg-card border border-border rounded-xl p-4 animate-fade-in">
          <h3 className="text-foreground font-semibold mb-3 text-sm">Produtos</h3>
          <div className="space-y-1">
            {mockProducts.map(p => (
              <button
                key={p.skuPrincipal}
                onClick={() => setSelectedSku(p.skuPrincipal)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  selectedSku === p.skuPrincipal
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-foreground'
                }`}
              >
                <span className="font-mono text-xs opacity-70">{p.skuPrincipal}</span>
                <p className="truncate font-medium">{p.nome}</p>
                <div className="mt-1"><StatusBadge status={p.status} /></div>
              </button>
            ))}
          </div>
        </div>

        {/* Product Detail */}
        <div className="lg:col-span-3 bg-card border border-border rounded-xl p-6 animate-fade-in" style={{ animationDelay: '100ms' }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-bold text-foreground">{product.nome}</h3>
              </div>
              <p className="text-muted-foreground text-sm mt-1">SKU: {product.skuPrincipal}</p>
            </div>
            <StatusBadge status={product.status} />
          </div>

          <div className="mb-4 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
            Um SKU só fica <strong className="text-foreground">Ativo</strong> se as 3 abas estiverem preenchidas:
            <span className="ml-2 inline-flex items-center gap-1"><TabStatus complete={product.geralCompleto} /> Geral</span>
            <span className="ml-2 inline-flex items-center gap-1"><TabStatus complete={product.logisticaCompleta} /> Logística</span>
            <span className="ml-2 inline-flex items-center gap-1"><TabStatus complete={product.financeiroCompleto} /> Financeiro</span>
          </div>

          <Tabs defaultValue="geral">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="geral" className="gap-1"><TabStatus complete={product.geralCompleto} /> Geral</TabsTrigger>
              <TabsTrigger value="logistica" className="gap-1"><TabStatus complete={product.logisticaCompleta} /> Logística</TabsTrigger>
              <TabsTrigger value="financeiro" className="gap-1"><TabStatus complete={product.financeiroCompleto} /> Financeiro</TabsTrigger>
            </TabsList>

            <TabsContent value="geral">
              <FieldGrid>
                <Field label="Marca" value={product.marca} />
                <Field label="EAN" value={product.ean} />
                <Field label="Categoria" value={product.categoria} />
                <Field label="Descrição" value={product.descricao} span={3} />
              </FieldGrid>
            </TabsContent>

            <TabsContent value="logistica">
              <FieldGrid>
                <Field label="Peso (kg)" value={product.peso?.toString()} />
                <Field label="Altura (cm)" value={product.altura?.toString()} />
                <Field label="Largura (cm)" value={product.largura?.toString()} />
                <Field label="Comprimento (cm)" value={product.comprimento?.toString()} />
                <Field label="Estoque Atual" value={product.estoqueAtual?.toString()} />
                <Field label="Estoque Mínimo" value={product.estoqueMinimo?.toString()} />
                <Field label="Lead Time (dias)" value={product.leadTime?.toString()} />
                <Field label="Em Trânsito" value={product.emTransito?.toString()} />
                <Field label="Em Transferência" value={product.emTransferencia?.toString()} />
              </FieldGrid>
            </TabsContent>

            <TabsContent value="financeiro">
              <FieldGrid>
                <Field label="Preço de Custo" value={product.precoCusto ? `R$ ${product.precoCusto.toFixed(2)}` : undefined} />
                <Field label="Preço de Venda" value={product.precoVenda ? `R$ ${product.precoVenda.toFixed(2)}` : undefined} />
                <Field label="Impostos (%)" value={product.impostos?.toString()} />
                <Field label="Taxa Marketplace (%)" value={product.taxaMarketplace?.toString()} />
                <Field label="Custo Frete" value={product.custoFrete ? `R$ ${product.custoFrete.toFixed(2)}` : undefined} />
              </FieldGrid>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{children}</div>;
}

function Field({ label, value, span }: { label: string; value?: string; span?: number }) {
  return (
    <div className={span ? `md:col-span-${span}` : ''}>
      <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</label>
      <div className="mt-1 px-3 py-2 bg-muted/50 rounded-lg text-sm text-foreground min-h-[36px]">
        {value || <span className="text-muted-foreground italic">Não preenchido</span>}
      </div>
    </div>
  );
}
