import { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, ChevronUp, Package, TrendingUp, DollarSign, BarChart2, Shield, Layers, FileText, ShoppingCart } from 'lucide-react';
import type { PurchaseOrder } from './ComprasAIChat';

interface Section {
  id: number;
  title: string;
  icon: React.ReactNode;
  content: string;
  badge?: string;
  badgeColor?: string;
}

function parseOutputs(markdown: string): Section[] {
  // Split by OUTPUT headings
  const outputRegex = /^#{1,3}\s*(?:OUTPUT\s+(\d+)|(\d+)[º°\.]?\s+(?:OUTPUT|output))[:\s—–-]*([^\n]*)/gim;
  const matches = [...markdown.matchAll(outputRegex)];
  
  if (matches.length === 0) {
    // No OUTPUT headings found — return as single section
    return [{
      id: 1,
      title: 'Relatório Completo',
      icon: <FileText className="w-4 h-4" />,
      content: markdown,
    }];
  }

  const sections: Section[] = [];
  const icons = [
    <BarChart2 className="w-4 h-4" />,
    <TrendingUp className="w-4 h-4" />,
    <Layers className="w-4 h-4" />,
    <Package className="w-4 h-4" />,
    <Shield className="w-4 h-4" />,
    <FileText className="w-4 h-4" />,
    <ShoppingCart className="w-4 h-4" />,
  ];
  const badges = [
    'SKU a SKU',
    'Demanda',
    'Comparação',
    'Resumo',
    'Estratégia',
    'Consistência',
    'Pedido',
  ];
  const badgeColors = [
    'bg-blue-500/15 text-blue-400',
    'bg-teal-500/15 text-teal-400',
    'bg-amber-500/15 text-amber-400',
    'bg-purple-500/15 text-purple-400',
    'bg-rose-500/15 text-rose-400',
    'bg-gray-500/15 text-gray-400',
    'bg-emerald-500/15 text-emerald-400',
  ];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const rawNum = match[1] || match[2];
    const num = parseInt(rawNum) - 1;
    const title = match[3].trim() || `Output ${rawNum}`;
    const start = match.index! + match[0].length;
    const end = i < matches.length - 1 ? matches[i + 1].index! : markdown.length;
    const content = markdown.slice(start, end).trim();

    sections.push({
      id: parseInt(match[1]),
      title: `Output ${match[1]} — ${title}`,
      icon: icons[num] || <FileText className="w-4 h-4" />,
      content,
      badge: badges[num],
      badgeColor: badgeColors[num],
    });
  }

  return sections;
}

function extractKPIs(markdown: string, order: PurchaseOrder | null) {
  // Extract CBM from markdown
  const cbmMatch = markdown.match(/CBM\s+(?:alocado|utilizado)[^:]*:\s*([\d,.]+)\s*m/i);
  const lucrMatch = markdown.match(/[Ll]ucro\s+(?:total|esperado)[^:]*:\s*R\$\s*([\d.,]+)/i);
  const usageMatch = markdown.match(/[Uu]tiliza[çc][ãa]o[^:]*:\s*([\d,.]+)\s*%/i);

  return {
    cbm: order?.totalCbm ?? (cbmMatch ? parseFloat(cbmMatch[1].replace(',', '.')) : null),
    lucro: lucrMatch ? lucrMatch[1] : null,
    usage: usageMatch ? parseFloat(usageMatch[1].replace(',', '.')) : (order ? (order.totalCbm / order.cbmLimit) * 100 : null),
    skus: order?.lines.length ?? null,
    custo: order?.totalAmount ?? null,
  };
}

interface Props {
  markdown: string;
  order: PurchaseOrder | null;
}

export function KnapsackReport({ markdown, order }: Props) {
  const sections = useMemo(() => parseOutputs(markdown), [markdown]);
  const kpis = useMemo(() => extractKPIs(markdown, order), [markdown, order]);
  const [openSection, setOpenSection] = useState<number>(order?.lines.length ? 7 : 1);

  const toggle = (id: number) => setOpenSection(prev => prev === id ? 0 : id);

  const cbmPct = kpis.usage ?? 0;
  const cbmColor = cbmPct >= 95 ? 'bg-emerald-500' : cbmPct >= 80 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* CBM */}
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">CBM Alocado</p>
          <p className="text-2xl font-bold text-foreground">
            {kpis.cbm != null ? kpis.cbm.toFixed(1) : '—'}
            <span className="text-sm font-normal text-muted-foreground ml-1">/ {order?.cbmLimit ?? 69} m³</span>
          </p>
          {cbmPct > 0 && (
            <div className="mt-2 h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${cbmColor}`}
                style={{ width: `${Math.min(cbmPct, 100)}%` }}
              />
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">{cbmPct > 0 ? `${cbmPct.toFixed(0)}% utilizado` : ''}</p>
        </div>

        {/* SKUs */}
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">SKUs no Pedido</p>
          <p className="text-2xl font-bold text-foreground">{kpis.skus ?? '—'}</p>
          <p className="text-[10px] text-muted-foreground mt-1">produtos selecionados</p>
        </div>

        {/* Custo */}
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">Custo Total (USD)</p>
          <p className="text-2xl font-bold text-foreground">
            {kpis.custo != null
              ? `$${kpis.custo.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`
              : kpis.lucro ? `R$${kpis.lucro}` : '—'}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">valor de aquisição</p>
        </div>

        {/* Unidades */}
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">Total de Unidades</p>
          <p className="text-2xl font-bold text-foreground">
            {order?.totalQty != null
              ? order.totalQty.toLocaleString('pt-BR')
              : '—'}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">peças no container</p>
        </div>
      </div>

      {/* Sections accordion */}
      <div className="space-y-2">
        {sections.map(section => (
          <div
            key={section.id}
            className="border border-border rounded-xl overflow-hidden bg-card"
          >
            {/* Header */}
            <button
              onClick={() => toggle(section.id)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-muted text-muted-foreground">
                  {section.icon}
                </div>
                <span className="text-sm font-semibold text-foreground">{section.title}</span>
                {section.badge && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${section.badgeColor}`}>
                    {section.badge}
                  </span>
                )}
              </div>
              {openSection === section.id
                ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              }
            </button>

            {/* Content */}
            {openSection === section.id && (
              <div className="border-t border-border px-5 py-5">
                <div className="prose prose-sm max-w-none
                  dark:prose-invert
                  prose-headings:font-semibold prose-headings:text-foreground
                  prose-p:text-muted-foreground prose-p:leading-relaxed
                  prose-strong:text-foreground
                  prose-th:bg-muted/50 prose-th:text-xs prose-th:font-bold prose-th:p-2.5 prose-th:text-left
                  prose-td:p-2.5 prose-td:text-sm prose-td:border-border
                  prose-tr:border-border
                  prose-table:text-sm prose-table:w-full prose-table:border prose-table:border-border prose-table:rounded-lg
                  prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                  [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full
                  [&_blockquote]:border-l-4 [&_blockquote]:border-primary/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground
                ">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {section.content}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
