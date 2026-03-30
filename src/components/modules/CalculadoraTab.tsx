import { useState, useMemo } from 'react';
import { Calculator, Search, Loader2, TrendingUp, TrendingDown, Percent, Package, DollarSign, Truck } from 'lucide-react';
import { formatBRL } from '@/lib/utils-vix';
import { useSheetsData } from '@/contexts/SheetsDataContext';

// Marketplace channels with their default commission rates
const CHANNELS = [
  { id: 'ml_classico', name: 'ML Clássico', comissao: 14, frete: 0, icon: '🟡' },
  { id: 'ml_premium', name: 'ML Premium', comissao: 19, frete: 0, icon: '🟡' },
  { id: 'amazon_seller', name: 'Amazon Seller', comissao: 15, frete: 0, icon: '🟠' },
  { id: 'amazon_fba', name: 'Amazon FBA', comissao: 25, frete: 0, icon: '🟠' },
  { id: 'shopee', name: 'Shopee', comissao: 20, frete: 0, icon: '🔴' },
  { id: 'shein', name: 'Shein', comissao: 20, frete: 0, icon: '⚫' },
  { id: 'leroy', name: 'Leroy Merlin', comissao: 15, frete: 0, icon: '🟢' },
  { id: 'tiktok', name: 'Tik Tok Shop', comissao: 10, frete: 0, icon: '⬛' },
  { id: 'olist', name: 'Olist', comissao: 15, frete: 0, icon: '🟣' },
  { id: 'aliexpress', name: 'Ali Express', comissao: 12, frete: 0, icon: '🔶' },
  { id: 'temu', name: 'Temu', comissao: 15, frete: 0, icon: '🟧' },
];

interface ChannelRow {
  id: string;
  name: string;
  icon: string;
  precoVenda: number;
  comissao: number;
  frete: number;
}

function MargemBadge({ pct }: { pct: number }) {
  const color = pct >= 20 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    : pct >= 10 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    : pct >= 0 ? 'text-red-400 bg-red-500/10 border-red-500/20'
    : 'text-red-500 bg-red-500/20 border-red-500/30';
  return (
    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${color}`}>
      {pct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {pct.toFixed(1)}%
    </span>
  );
}

export function CalculadoraTab() {
  const sheetsData = useSheetsData();
  // SKU search
  const [skuInput, setSkuInput] = useState('');
  const [activeSku, setActiveSku] = useState('');
  const [cmvManual, setCmvManual] = useState<number>(0);
  const [cmvSource, setCmvSource] = useState<'auto' | 'manual'>('auto');
  const [loading, setLoading] = useState(false);

  // Global adjustable parameters
  const [adsPct, setAdsPct] = useState(5);
  const [devolucaoPct, setDevolucaoPct] = useState(2);
  const [impostosPct, setImpostosPct] = useState(11.97);
  const [embalagemFixo, setEmbalagemFixo] = useState(2.0);

  // Channel rows with editable prices and commissions
  const [channels, setChannels] = useState<ChannelRow[]>(
    CHANNELS.map(c => ({ ...c, precoVenda: 0, frete: 0 }))
  );

  // Try to find CMV from financeiroItems
  const cmvFromSheet = useMemo(() => {
    if (!activeSku || !sheetsData.financeiroItems) return null;
    const match = sheetsData.financeiroItems.find(
      f => f.skuPrincipal?.toLowerCase() === activeSku.toLowerCase()
    );
    return match?.custo ?? null;
  }, [activeSku, sheetsData.financeiroItems]);

  const cmv = cmvSource === 'auto' && cmvFromSheet !== null ? cmvFromSheet : cmvManual;

  // Search SKU
  function handleSearch() {
    if (!skuInput.trim()) return;
    setLoading(true);
    setActiveSku(skuInput.trim().toUpperCase());
    // Check if we found CMV from sheets
    setTimeout(() => {
      setLoading(false);
      if (cmvFromSheet !== null) {
        setCmvSource('auto');
      } else {
        setCmvSource('manual');
      }
    }, 300);
  }

  // Calculate margins for each channel
  const calculations = useMemo(() => {
    return channels.map(ch => {
      const preco = ch.precoVenda;
      if (preco <= 0) return { ...ch, liquidoBruto: 0, custoAds: 0, custoDev: 0, custoImp: 0, margemR: 0, margemPct: 0 };

      const comissaoR = preco * (ch.comissao / 100);
      const liquidoBruto = preco - comissaoR;
      const custoAds = preco * (adsPct / 100);
      const custoDev = preco * (devolucaoPct / 100);
      const custoImp = preco * (impostosPct / 100);
      const margemR = liquidoBruto - cmv - custoAds - custoDev - custoImp - embalagemFixo - ch.frete;
      const margemPct = preco > 0 ? (margemR / preco) * 100 : 0;

      return { ...ch, liquidoBruto, custoAds, custoDev, custoImp, margemR, margemPct };
    });
  }, [channels, cmv, adsPct, devolucaoPct, impostosPct, embalagemFixo]);

  function updateChannel(id: string, field: 'precoVenda' | 'comissao' | 'frete', value: number) {
    setChannels(prev => prev.map(ch => ch.id === id ? { ...ch, [field]: value } : ch));
  }

  // Apply same price to all channels
  function applyPriceToAll(price: number) {
    setChannels(prev => prev.map(ch => ({ ...ch, precoVenda: price })));
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header + SKU Search */}
      <div className="bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-pink-500/5 border border-border rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20">
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Calculadora de Precificação</h2>
            <p className="text-xs text-muted-foreground">Simule margens em todos os marketplaces em tempo real</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={skuInput}
              onChange={e => setSkuInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Digite o SKU do produto (ex: FC-53)"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !skuInput.trim()}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-2 shadow-lg shadow-indigo-500/20"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Buscar
          </button>
        </div>
      </div>

      {/* Product + CMV Card */}
      {activeSku && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-semibold text-foreground">Produto</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">SKU</span>
                <span className="text-sm font-mono font-semibold text-foreground">{activeSku}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">CMV (Custo)</span>
                <div className="flex items-center gap-2">
                  {cmvFromSheet !== null && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Planilha: {formatBRL(cmvFromSheet)}
                    </span>
                  )}
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={cmvSource === 'auto' && cmvFromSheet !== null ? cmvFromSheet : cmvManual}
                      onChange={e => { setCmvManual(Number(e.target.value)); setCmvSource('manual'); }}
                      className="w-24 pl-7 pr-2 py-1 rounded-lg bg-muted border border-border text-sm text-foreground text-right outline-none focus:border-indigo-500/50"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Global Sliders */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Percent className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold text-foreground">Parâmetros Globais</h3>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">% ADS</label>
                  <span className="text-xs font-semibold text-indigo-400">{adsPct}%</span>
                </div>
                <input type="range" min={0} max={20} step={0.5} value={adsPct}
                  onChange={e => setAdsPct(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none bg-muted cursor-pointer accent-indigo-500"
                />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Devolução</label>
                  <span className="text-xs font-semibold text-amber-400">{devolucaoPct}%</span>
                </div>
                <input type="range" min={0} max={15} step={0.5} value={devolucaoPct}
                  onChange={e => setDevolucaoPct(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none bg-muted cursor-pointer accent-amber-500"
                />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Impostos</label>
                  <span className="text-xs font-semibold text-red-400">{impostosPct}%</span>
                </div>
                <input type="range" min={0} max={30} step={0.5} value={impostosPct}
                  onChange={e => setImpostosPct(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none bg-muted cursor-pointer accent-red-500"
                />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Embalagem</label>
                  <span className="text-xs font-semibold text-emerald-400">{formatBRL(embalagemFixo)}</span>
                </div>
                <input type="range" min={0} max={20} step={0.5} value={embalagemFixo}
                  onChange={e => setEmbalagemFixo(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none bg-muted cursor-pointer accent-emerald-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Channels Table */}
      {activeSku && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-foreground">Simulação por Canal</h3>
              <span className="text-[10px] text-muted-foreground ml-2">CMV: {formatBRL(cmv)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Preço base:</span>
              <input
                type="number"
                step="0.01"
                placeholder="R$ 0,00"
                onChange={e => {
                  const v = Number(e.target.value);
                  if (v > 0) applyPriceToAll(v);
                }}
                className="w-24 px-2 py-1 rounded-lg bg-muted border border-border text-xs text-foreground text-right outline-none focus:border-indigo-500/50"
              />
              <span className="text-[10px] text-muted-foreground">→ aplicar a todos</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium whitespace-nowrap">Canal</th>
                  <th className="text-right py-3 px-3 text-muted-foreground font-medium whitespace-nowrap">Preço Venda</th>
                  <th className="text-right py-3 px-3 text-muted-foreground font-medium whitespace-nowrap">Comissão %</th>
                  <th className="text-right py-3 px-3 text-muted-foreground font-medium whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1"><Truck className="w-3 h-3" /> Frete</div>
                  </th>
                  <th className="text-right py-3 px-3 text-muted-foreground font-medium whitespace-nowrap">Líquido</th>
                  <th className="text-right py-3 px-3 text-muted-foreground font-medium whitespace-nowrap">CMV</th>
                  <th className="text-right py-3 px-3 text-muted-foreground font-medium whitespace-nowrap">ADS</th>
                  <th className="text-right py-3 px-3 text-muted-foreground font-medium whitespace-nowrap">Devol.</th>
                  <th className="text-right py-3 px-3 text-muted-foreground font-medium whitespace-nowrap">Impostos</th>
                  <th className="text-right py-3 px-3 text-muted-foreground font-medium whitespace-nowrap">Embal.</th>
                  <th className="text-right py-3 px-3 text-foreground font-semibold whitespace-nowrap">Margem R$</th>
                  <th className="text-center py-3 px-3 text-foreground font-semibold whitespace-nowrap">Margem %</th>
                </tr>
              </thead>
              <tbody>
                {calculations.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`border-b border-border/30 hover:bg-muted/20 transition-colors ${i % 2 === 0 ? 'bg-card' : 'bg-muted/5'}`}
                  >
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span className="mr-1.5">{row.icon}</span>
                      <span className="font-medium text-foreground">{row.name}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="relative">
                        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={row.precoVenda || ''}
                          onChange={e => updateChannel(row.id, 'precoVenda', Number(e.target.value))}
                          className="w-20 pl-6 pr-1 py-1 rounded bg-muted/50 border border-border text-xs text-foreground text-right outline-none focus:border-indigo-500/50"
                          placeholder="0,00"
                        />
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="relative">
                        <input
                          type="number"
                          step="0.5"
                          value={row.comissao}
                          onChange={e => updateChannel(row.id, 'comissao', Number(e.target.value))}
                          className="w-14 pr-4 pl-1 py-1 rounded bg-muted/50 border border-border text-xs text-foreground text-right outline-none focus:border-indigo-500/50"
                        />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="relative">
                        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">R$</span>
                        <input
                          type="number"
                          step="0.5"
                          value={row.frete || ''}
                          onChange={e => updateChannel(row.id, 'frete', Number(e.target.value))}
                          className="w-16 pl-6 pr-1 py-1 rounded bg-muted/50 border border-border text-xs text-foreground text-right outline-none focus:border-indigo-500/50"
                          placeholder="0"
                        />
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-foreground whitespace-nowrap">
                      {row.precoVenda > 0 ? formatBRL(row.liquidoBruto) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right text-red-400 whitespace-nowrap">
                      {cmv > 0 ? `-${formatBRL(cmv)}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right text-amber-400 whitespace-nowrap">
                      {row.precoVenda > 0 ? `-${formatBRL(row.custoAds)}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right text-orange-400 whitespace-nowrap">
                      {row.precoVenda > 0 ? `-${formatBRL(row.custoDev)}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right text-red-300 whitespace-nowrap">
                      {row.precoVenda > 0 ? `-${formatBRL(row.custoImp)}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right text-muted-foreground whitespace-nowrap">
                      {embalagemFixo > 0 ? `-${formatBRL(embalagemFixo)}` : '—'}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-bold whitespace-nowrap ${
                      row.margemR > 0 ? 'text-emerald-400' : row.margemR < 0 ? 'text-red-400' : 'text-muted-foreground'
                    }`}>
                      {row.precoVenda > 0 ? formatBRL(row.margemR) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {row.precoVenda > 0 ? <MargemBadge pct={row.margemPct} /> : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary footer */}
          <div className="px-5 py-3 bg-muted/20 border-t border-border flex flex-wrap items-center gap-4 text-[10px] text-muted-foreground">
            <span>Fórmula: <strong className="text-foreground">Margem = Preço - Comissão - CMV - ADS - Devolução - Impostos - Embalagem - Frete</strong></span>
            <span className="ml-auto flex gap-3">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> ≥20%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> 10-20%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> &lt;10%</span>
            </span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!activeSku && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 mb-4">
            <Calculator className="w-10 h-10 text-indigo-400" />
          </div>
          <h3 className="text-foreground font-semibold mb-1">Busque um SKU para começar</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Digite o código do produto acima para calcular a margem em cada marketplace.
            O CMV é carregado automaticamente da planilha ou pode ser inserido manualmente.
          </p>
        </div>
      )}
    </div>
  );
}
