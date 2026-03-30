import { useState, useMemo } from 'react';
import { Calculator, Search, Loader2, TrendingUp, TrendingDown, Percent, Package, DollarSign, Truck, ChevronDown, ChevronUp, Info, Sparkles, Target } from 'lucide-react';
import { formatBRL } from '@/lib/utils-vix';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import { toast } from 'sonner';

// Marketplace channels
const CHANNELS = [
  { id: 'ml_classico', name: 'ML Clássico', comissao: 14, frete: 5.38, icon: '🟡', color: '#f59e0b' },
  { id: 'ml_premium', name: 'ML Premium', comissao: 19, frete: 6.25, icon: '🟡', color: '#eab308' },
  { id: 'amazon_seller', name: 'Amazon Seller', comissao: 15, frete: 6.00, icon: '🟠', color: '#f97316' },
  { id: 'amazon_fba', name: 'Amazon FBA', comissao: 25, frete: 22.95, icon: '🟠', color: '#ea580c' },
  { id: 'shopee', name: 'Shopee', comissao: 20, frete: 6.00, icon: '🔴', color: '#ef4444' },
  { id: 'shein', name: 'Shein', comissao: 20, frete: 0, icon: '⚫', color: '#71717a' },
  { id: 'leroy', name: 'Leroy Merlin', comissao: 15, frete: 5.35, icon: '🟢', color: '#22c55e' },
  { id: 'tiktok', name: 'Tik Tok Shop', comissao: 10, frete: 4.00, icon: '⬛', color: '#a855f7' },
  { id: 'olist', name: 'Olist', comissao: 15, frete: 0, icon: '🟣', color: '#8b5cf6' },
  { id: 'aliexpress', name: 'Ali Express', comissao: 12, frete: 0, icon: '🔶', color: '#f97316' },
  { id: 'temu', name: 'Temu', comissao: 15, frete: 0, icon: '🟧', color: '#fb923c' },
];

function MargemGauge({ pct, size = 'lg' }: { pct: number; size?: 'lg' | 'sm' }) {
  const color = pct >= 20 ? '#22c55e' : pct >= 10 ? '#f59e0b' : pct >= 0 ? '#ef4444' : '#dc2626';
  const label = pct >= 20 ? 'Excelente' : pct >= 10 ? 'Boa' : pct >= 0 ? 'Baixa' : 'Negativa';
  const isLg = size === 'lg';
  return (
    <div className="flex flex-col items-center">
      <div className={`relative ${isLg ? 'w-32 h-32' : 'w-20 h-20'}`}>
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--border))" strokeWidth="8" opacity={0.3} />
          <circle
            cx="50" cy="50" r="42" fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${Math.max(0, Math.min(100, pct)) * 2.64} 264`}
            style={{ transition: 'stroke-dasharray 0.6s ease, stroke 0.3s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-bold ${isLg ? 'text-2xl' : 'text-sm'}`} style={{ color }}>{pct.toFixed(1)}%</span>
          {isLg && <span className="text-[10px] text-muted-foreground mt-0.5">{label}</span>}
        </div>
      </div>
    </div>
  );
}

export function CalculadoraTab() {
  const sheetsData = useSheetsData();
  const [skuInput, setSkuInput] = useState('');
  const [activeSku, setActiveSku] = useState('');
  const [cmvManual, setCmvManual] = useState<number>(0);
  const [cmvFromSheet, setCmvFromSheet] = useState<number | null>(null);
  const [cmvSource, setCmvSource] = useState<'auto' | 'manual'>('auto');
  const [loading, setLoading] = useState(false);

  // Selected marketplace
  const [selectedChannel, setSelectedChannel] = useState(CHANNELS[0]);
  const [customComissao, setCustomComissao] = useState<number | null>(null);
  const [customFrete, setCustomFrete] = useState<number | null>(null);

  // Global parameters
  const [adsPct, setAdsPct] = useState(5);
  const [devolucaoPct, setDevolucaoPct] = useState(2);
  const [impostosPct, setImpostosPct] = useState(11.97);
  const [embalagemFixo, setEmbalagemFixo] = useState(2.0);

  // Price
  const [precoVenda, setPrecoVenda] = useState<number>(0);

  // Expanded breakdown
  const [showBreakdown, setShowBreakdown] = useState(false);

  // CMV
  const cmv = cmvSource === 'auto' && cmvFromSheet !== null ? cmvFromSheet : cmvManual;

  // Active comissao/frete (custom or default)
  const comissao = customComissao !== null ? customComissao : selectedChannel.comissao;
  const frete = customFrete !== null ? customFrete : selectedChannel.frete;

  // When selecting a new channel, reset custom values
  function selectChannel(ch: typeof CHANNELS[0]) {
    setSelectedChannel(ch);
    setCustomComissao(null);
    setCustomFrete(null);
  }

  // Search
  function handleSearch() {
    if (!skuInput.trim()) return;
    setLoading(true);
    const sku = skuInput.trim().toUpperCase();
    setActiveSku(sku);
    setCmvFromSheet(null);

    const cmvMatch = sheetsData.cmvItems?.find(r => r.sku === sku);
    if (cmvMatch && cmvMatch.cmv > 0) {
      setCmvFromSheet(cmvMatch.cmv);
      setCmvSource('auto');
      toast.success(`CMV encontrado: ${formatBRL(cmvMatch.cmv)}`);
      setLoading(false);
      return;
    }

    const finMatch = sheetsData.financeiroItems?.find(f => f.skuPrincipal?.toUpperCase() === sku);
    if (finMatch?.custo && finMatch.custo > 0) {
      setCmvFromSheet(finMatch.custo);
      setCmvSource('auto');
      toast.success(`CMV do financeiro: ${formatBRL(finMatch.custo)}`);
      setLoading(false);
      return;
    }

    setCmvSource('manual');
    if (!sheetsData.cmvItems || sheetsData.cmvItems.length === 0) {
      toast.info('Configure a planilha de Custos em Configurações → Planilhas → 🧮 Calculadora (CMV)');
    } else {
      toast.info(`SKU "${sku}" não encontrado — insira CMV manualmente`);
    }
    setLoading(false);
  }

  // Calculations
  const calc = useMemo(() => {
    if (precoVenda <= 0) return null;
    const comissaoR = precoVenda * (comissao / 100);
    const liquidoBruto = precoVenda - comissaoR;
    const custoAds = precoVenda * (adsPct / 100);
    const custoDev = precoVenda * (devolucaoPct / 100);
    const custoImp = precoVenda * (impostosPct / 100);
    const margemR = liquidoBruto - cmv - custoAds - custoDev - custoImp - embalagemFixo - frete;
    const margemPct = (margemR / precoVenda) * 100;

    return {
      comissaoR, liquidoBruto, custoAds, custoDev, custoImp, margemR, margemPct,
      // Waterfall data for breakdown
      steps: [
        { label: 'Preço de Venda', value: precoVenda, pct: 100, color: '#6366f1', icon: '💰' },
        { label: `Comissão (${comissao}%)`, value: -comissaoR, pct: -(comissao), color: '#ef4444', icon: '🏷️' },
        { label: 'CMV (Custo)', value: -cmv, pct: precoVenda > 0 ? -(cmv / precoVenda * 100) : 0, color: '#f97316', icon: '📦' },
        { label: `ADS (${adsPct}%)`, value: -custoAds, pct: -adsPct, color: '#f59e0b', icon: '📢' },
        { label: `Devolução (${devolucaoPct}%)`, value: -custoDev, pct: -devolucaoPct, color: '#a855f7', icon: '🔄' },
        { label: `Impostos (${impostosPct}%)`, value: -custoImp, pct: -impostosPct, color: '#ec4899', icon: '🏛️' },
        { label: 'Embalagem', value: -embalagemFixo, pct: precoVenda > 0 ? -(embalagemFixo / precoVenda * 100) : 0, color: '#14b8a6', icon: '📋' },
        { label: 'Frete', value: -frete, pct: precoVenda > 0 ? -(frete / precoVenda * 100) : 0, color: '#3b82f6', icon: '🚚' },
      ],
    };
  }, [precoVenda, comissao, frete, cmv, adsPct, devolucaoPct, impostosPct, embalagemFixo]);

  // All channels quick compare
  const allChannelsCalc = useMemo(() => {
    if (precoVenda <= 0) return [];
    return CHANNELS.map(ch => {
      const comR = precoVenda * (ch.comissao / 100);
      const liq = precoVenda - comR;
      const ads = precoVenda * (adsPct / 100);
      const dev = precoVenda * (devolucaoPct / 100);
      const imp = precoVenda * (impostosPct / 100);
      const mr = liq - cmv - ads - dev - imp - embalagemFixo - ch.frete;
      const mp = (mr / precoVenda) * 100;
      return { ...ch, margemR: mr, margemPct: mp };
    });
  }, [precoVenda, cmv, adsPct, devolucaoPct, impostosPct, embalagemFixo]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero Header + Search */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-pink-500/5 border border-border rounded-2xl p-6">
        <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-bl-full" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-purple-500/10 to-transparent rounded-tr-full" />
        <div className="relative flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20">
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Calculadora de Precificação</h2>
            <p className="text-xs text-muted-foreground">Simule margens em tempo real por marketplace</p>
          </div>
        </div>
        <div className="relative flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={skuInput}
              onChange={e => setSkuInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Digite o SKU do produto (ex: FC-138)"
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

      {/* Empty state */}
      {!activeSku && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 mb-4 animate-pulse">
            <Sparkles className="w-10 h-10 text-indigo-400" />
          </div>
          <h3 className="text-foreground font-semibold mb-1">Busque um SKU para começar</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Digite o código do produto acima e veja a margem em cada marketplace instantaneamente.
          </p>
        </div>
      )}

      {/* Main Layout — Product + Marketplace + Parameters */}
      {activeSku && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Card 1: Product */}
            <div className="bg-card border border-border rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-bl-full" />
              <div className="flex items-center gap-2 mb-4">
                <Package className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-foreground">Produto</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">SKU</span>
                  <span className="text-base font-mono font-bold text-foreground bg-muted/50 px-3 py-1 rounded-lg">{activeSku}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">CMV (Custo)</span>
                  <div className="flex items-center gap-2">
                    {cmvFromSheet !== null && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        ✓ Planilha
                      </span>
                    )}
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={cmvSource === 'auto' && cmvFromSheet !== null ? cmvFromSheet : cmvManual}
                        onChange={e => { setCmvManual(Number(e.target.value)); setCmvSource('manual'); }}
                        className="w-24 pl-7 pr-2 py-1.5 rounded-lg bg-muted border border-border text-sm text-foreground text-right outline-none focus:border-indigo-500/50"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Marketplace Selector */}
            <div className="bg-card border border-border rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-purple-500/10 to-transparent rounded-bl-full" />
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-foreground">Marketplace</h3>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CHANNELS.map(ch => (
                  <button
                    key={ch.id}
                    onClick={() => selectChannel(ch)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                      selectedChannel.id === ch.id
                        ? 'text-white shadow-md scale-105'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50'
                    }`}
                    style={selectedChannel.id === ch.id ? { backgroundColor: ch.color, boxShadow: `0 4px 14px ${ch.color}40` } : {}}
                  >
                    <span className="mr-1">{ch.icon}</span>{ch.name.split(' ').slice(0, 2).join(' ')}
                  </button>
                ))}
              </div>
              {/* Custom comissao/frete for selected */}
              <div className="flex gap-3 mt-3 pt-3 border-t border-border/50">
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground mb-1 block">Comissão %</label>
                  <input type="number" step="0.5" value={comissao}
                    onChange={e => setCustomComissao(Number(e.target.value))}
                    className="w-full px-2 py-1 rounded-lg bg-muted border border-border text-xs text-foreground text-center outline-none focus:border-indigo-500/50"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground mb-1 block">Frete R$</label>
                  <input type="number" step="0.5" value={frete}
                    onChange={e => setCustomFrete(Number(e.target.value))}
                    className="w-full px-2 py-1 rounded-lg bg-muted border border-border text-xs text-foreground text-center outline-none focus:border-indigo-500/50"
                  />
                </div>
              </div>
            </div>

            {/* Card 3: Parameters */}
            <div className="bg-card border border-border rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-bl-full" />
              <div className="flex items-center gap-2 mb-3">
                <Percent className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-foreground">Parâmetros</h3>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-[10px] text-muted-foreground">% ADS</span>
                    <span className="text-[10px] font-semibold text-indigo-400">{adsPct}%</span>
                  </div>
                  <input type="range" min={0} max={20} step={0.5} value={adsPct}
                    onChange={e => setAdsPct(Number(e.target.value))}
                    className="w-full h-1 rounded-full appearance-none bg-muted cursor-pointer accent-indigo-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-[10px] text-muted-foreground">Devolução</span>
                    <span className="text-[10px] font-semibold text-amber-400">{devolucaoPct}%</span>
                  </div>
                  <input type="range" min={0} max={15} step={0.5} value={devolucaoPct}
                    onChange={e => setDevolucaoPct(Number(e.target.value))}
                    className="w-full h-1 rounded-full appearance-none bg-muted cursor-pointer accent-amber-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-[10px] text-muted-foreground">Impostos</span>
                    <span className="text-[10px] font-semibold text-red-400">{impostosPct}%</span>
                  </div>
                  <input type="range" min={0} max={30} step={0.5} value={impostosPct}
                    onChange={e => setImpostosPct(Number(e.target.value))}
                    className="w-full h-1 rounded-full appearance-none bg-muted cursor-pointer accent-red-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-[10px] text-muted-foreground">Embalagem</span>
                    <span className="text-[10px] font-semibold text-emerald-400">{formatBRL(embalagemFixo)}</span>
                  </div>
                  <input type="range" min={0} max={20} step={0.5} value={embalagemFixo}
                    onChange={e => setEmbalagemFixo(Number(e.target.value))}
                    className="w-full h-1 rounded-full appearance-none bg-muted cursor-pointer accent-emerald-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Result Card — Clean: Price + Margin */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="p-6 flex flex-col md:flex-row items-center gap-6">
              {/* Price Input */}
              <div className="flex-1 w-full">
                <label className="text-xs text-muted-foreground mb-2 block">Preço de Venda</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted-foreground font-medium">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={precoVenda || ''}
                    onChange={e => setPrecoVenda(Number(e.target.value))}
                    placeholder="0,00"
                    className="w-full pl-12 pr-4 py-4 rounded-xl bg-muted border-2 border-border text-2xl font-bold text-foreground text-right outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/10 transition-all"
                  />
                </div>
              </div>

              {/* Arrow */}
              {calc && (
                <div className="hidden md:flex items-center text-muted-foreground">
                  <div className="w-12 h-px bg-border" />
                  <div className="w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[8px] border-l-border" />
                </div>
              )}

              {/* Margin Result */}
              {calc && (
                <div className="flex items-center gap-6">
                  <MargemGauge pct={calc.margemPct} />
                  <div className="text-center md:text-left">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Lucro por Unidade</p>
                    <p className={`text-2xl font-bold ${calc.margemR >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatBRL(calc.margemR)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      em <span className="text-foreground font-medium">{selectedChannel.name}</span>
                    </p>
                  </div>
                </div>
              )}

              {!calc && (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Digite o preço de venda
                </div>
              )}
            </div>

            {/* Saber Mais — Expandable Breakdown */}
            {calc && (
              <>
                <button
                  onClick={() => setShowBreakdown(!showBreakdown)}
                  className="w-full flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground hover:text-foreground border-t border-border/50 transition-colors bg-muted/20 hover:bg-muted/40"
                >
                  <Info className="w-3.5 h-3.5" />
                  {showBreakdown ? 'Ocultar detalhes' : 'Saber mais — ver detalhamento completo'}
                  {showBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showBreakdown && (
                  <div className="p-5 border-t border-border/50 animate-fade-in space-y-4">
                    {/* Waterfall breakdown */}
                    <div className="space-y-2">
                      {calc.steps.map((step, i) => {
                        const barWidth = Math.min(100, Math.abs(step.pct));
                        const isPositive = step.value >= 0;
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <span className="text-lg w-7 text-center">{step.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-center mb-0.5">
                                <span className="text-xs text-muted-foreground truncate">{step.label}</span>
                                <span className={`text-xs font-semibold ${isPositive ? 'text-foreground' : 'text-red-400'}`}>
                                  {isPositive ? '' : '-'}{formatBRL(Math.abs(step.value))}
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{ width: `${barWidth}%`, backgroundColor: step.color, opacity: 0.8 }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {/* Result bar */}
                      <div className="flex items-center gap-3 pt-2 mt-2 border-t border-border/50">
                        <span className="text-lg w-7 text-center">✨</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-semibold text-foreground">Margem Líquida</span>
                            <span className={`text-sm font-bold ${calc.margemR >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {formatBRL(calc.margemR)} ({calc.margemPct.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Formula */}
                    <div className="bg-muted/30 rounded-xl p-3 text-[10px] text-muted-foreground">
                      <strong className="text-foreground">Fórmula:</strong> Margem = Preço − Comissão − CMV − ADS − Devolução − Impostos − Embalagem − Frete
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Quick Compare — All Channels */}
          {precoVenda > 0 && allChannelsCalc.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                Comparativo Rápido — Todos os Canais
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {allChannelsCalc.map(ch => (
                  <button
                    key={ch.id}
                    onClick={() => selectChannel(CHANNELS.find(c => c.id === ch.id)!)}
                    className={`relative overflow-hidden rounded-xl p-3 text-center transition-all hover:scale-105 cursor-pointer border ${
                      selectedChannel.id === ch.id ? 'border-indigo-500/50 ring-1 ring-indigo-500/20' : 'border-border/50'
                    }`}
                    style={{ background: selectedChannel.id === ch.id ? `${ch.color}08` : undefined }}
                  >
                    <p className="text-lg mb-0.5">{ch.icon}</p>
                    <p className="text-[10px] text-muted-foreground font-medium truncate">{ch.name}</p>
                    <p className={`text-sm font-bold mt-1 ${ch.margemPct >= 20 ? 'text-emerald-400' : ch.margemPct >= 10 ? 'text-amber-400' : ch.margemPct >= 0 ? 'text-red-400' : 'text-red-500'}`}>
                      {ch.margemPct.toFixed(1)}%
                    </p>
                    <p className={`text-[10px] font-medium ${ch.margemR >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                      {formatBRL(ch.margemR)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
