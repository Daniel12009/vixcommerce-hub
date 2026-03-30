import { useState } from 'react';
import { Sparkles, Loader2, CheckCircle, XCircle, AlertTriangle, ChevronRight, Copy, Send, RefreshCw, X, FolderOpen, DollarSign, Search, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSheetsData } from '@/contexts/SheetsDataContext';

interface AIAdCreatorProps {
  open: boolean;
  onClose: () => void;
  accountId: string;
  accountName: string;
  onPublish: (payload: {
    title: string;
    price: number;
    description: string;
    category_id: string;
    seller_sku: string;
    photo_urls: string[];
    quantity?: number;
    listing_type?: string;
    warranty_type?: string;
    warranty_time?: string;
  }) => void;
}

type AgentStep = {
  key: string;
  label: string;
  description: string;
};

const AGENT_STEPS: AgentStep[] = [
  { key: 'market_research', label: 'Pesquisa de Mercado', description: 'Analisando concorrentes e tendências...' },
  { key: 'strategy', label: 'Estratégia', description: 'Definindo posicionamento e preço...' },
  { key: 'seo', label: 'SEO', description: 'Mapeando palavras-chave...' },
  { key: 'copy', label: 'Copywriter', description: 'Criando título e descrição...' },
  { key: 'compliance', label: 'Compliance', description: 'Validando políticas do Mercado Livre...' },
];

export function AIAdCreator({ open, onClose, accountId, accountName, onPublish }: AIAdCreatorProps) {
  const { user } = useAuth();
  const { vendasItems, financeiroItems, adsItems, performanceItems, estoqueItems } = useSheetsData();

  const [sku, setSku] = useState('');
  const [productName, setProductName] = useState('');
  const [productDesc, setProductDesc] = useState('');
  const [generating, setGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [error, setError] = useState('');

  // Campos editáveis do draft
  const [editTitle, setEditTitle] = useState('');
  const [editTitleSeo, setEditTitleSeo] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [categoryAttributes, setCategoryAttributes] = useState<any[]>([]);
  const [attrValues, setAttrValues] = useState<Record<string, string>>({});
  const [loadingAttrs, setLoadingAttrs] = useState(false);

  // Drive Photos + Dimensions
  const [drivePhotos, setDrivePhotos] = useState<string[]>([]);
  const [driveFolder, setDriveFolder] = useState('');
  const [driveDimensions, setDriveDimensions] = useState<any>(null);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);

  // Category search
  const [catQuery, setCatQuery] = useState('');
  const [catResults, setCatResults] = useState<{ id: string; name: string; path: string }[]>([]);
  const [catSearching, setCatSearching] = useState(false);

  // Publish fields
  const [editQuantity, setEditQuantity] = useState('1');
  const [editListingType, setEditListingType] = useState('gold_special');
  const [editWarrantyType, setEditWarrantyType] = useState('Garantia do vendedor');
  const [editWarrantyTime, setEditWarrantyTime] = useState('90 dias');
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState('');

  if (!open) return null;

  function getProductContext() {
    const venda = vendasItems?.find(v => v.sku === sku || v.skuProduto === sku);
    const financeiro = financeiroItems?.find(f => f.skuPrincipal === sku);
    const ads = adsItems?.filter(a => a.idAnuncio?.includes(sku) || a.titulo?.toLowerCase().includes(productName.toLowerCase()));
    const perf = performanceItems?.find(p => p.sku === sku);
    const estoque = estoqueItems?.find(e => e.skuPrincipal === sku);
    const avgRoas = ads && ads.length > 0 ? (ads.reduce((s, a) => s + (a.roas || 0), 0) / ads.length).toFixed(2) : null;
    return {
      price_sell: venda?.precoUnitario || financeiro?.receita || null,
      price_cost: financeiro?.custo || null,
      margin: financeiro?.margemPercent || null,
      vmd: estoque?.vmd || null,
      stock: estoque?.estoqueAtual || null,
      roas: avgRoas,
      conversao: perf?.conversao || null,
    };
  }

  async function searchDriveData() {
    if (!sku.trim()) { setDriveError('Informe o SKU para buscar fotos e medidas.'); return; }
    setDriveLoading(true);
    setDriveError('');
    setDrivePhotos([]);
    setSelectedPhotos([]);
    setDriveDimensions(null);
    try {
      const { data, error } = await supabase.functions.invoke('drive-photos', {
        body: { sku, account_name: accountName, fetch_dimensions: true },
      });
      if (error) throw new Error(error.message);
      // Fotos
      if (data.photos?.found) {
        setDrivePhotos(data.photos.urls || []);
        setDriveFolder(data.photos.folder_name || '');
        setSelectedPhotos((data.photos.urls || []).slice(0, 6));
      } else {
        setDriveError(data.photos?.message || 'Nenhuma foto encontrada.');
      }
      // Dimensões
      if (data.dimensions?.found) {
        setDriveDimensions(data.dimensions);
      }
    } catch (err: any) {
      setDriveError(err.message || 'Erro ao buscar dados no Drive.');
    } finally {
      setDriveLoading(false);
    }
  }

  function togglePhoto(url: string) {
    setSelectedPhotos(prev =>
      prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url].slice(0, 6)
    );
  }

  async function searchCategories(query: string) {
    setCatQuery(query);
    if (query.length < 2) { setCatResults([]); return; }
    setCatSearching(true);
    try {
      const res = await fetch(`https://api.mercadolibre.com/sites/MLB/domain_discovery/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) { setCatResults([]); return; }
      const data = await res.json();
      setCatResults((data || []).slice(0, 8).map((d: any) => ({
        id: d.category_id || '',
        name: d.category_name || d.domain_name || '',
        path: (d.attributes || []).map((a: any) => a.name).join(' → ') || d.domain_name || '',
      })));
    } catch { setCatResults([]); } finally { setCatSearching(false); }
  }

  async function handleGenerate() {
    if (!productName.trim()) { setError('Informe o nome do produto.'); return; }
    if (!accountId) { setError('Selecione uma conta ML antes de gerar.'); return; }
    setError('');
    setGenerating(true);
    setDraft(null);

    const ctx = getProductContext();

    // Progresso visual — avança a cada 4s enquanto aguarda a API
    const stepKeys = ['market_research', 'strategy', 'seo', 'copy', 'compliance'];
    let stepIdx = 0;
    setCurrentStep(stepKeys[0]);

    const stepTimer = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, stepKeys.length - 1);
      setCurrentStep(stepKeys[stepIdx]);
    }, 4000);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-ad-creator', {
        body: {
          sku: sku || productName.slice(0, 20).toUpperCase().replace(/\s/g, '-'),
          product_name: productName,
          product_description: productDesc,
          price_sell: ctx.price_sell,
          price_cost: ctx.price_cost,
          margin: ctx.margin,
          vmd: ctx.vmd,
          stock: ctx.stock,
          roas: ctx.roas,
          conversao: ctx.conversao,
          conta: accountName,
          photo_urls: selectedPhotos,
          dimensions: driveDimensions,
        },
      });

      clearInterval(stepTimer);
      setCurrentStep(null);

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      if (data?.overall_status === 'error') throw new Error(data.error || 'Erro ao gerar');

      setDraft(data);
      setEditTitle(data.copy?.title?.value || '');
      setEditTitleSeo(data.copy?.title_seo?.value || data.seo?.title_optimized?.value || '');
      setEditDescription(data.copy?.description?.value || '');
      setEditPrice(String(data.strategy?.price_suggestion || ''));
      const catId = data.compliance?.category_id_hint || '';
      setEditCategoryId(catId);
      if (catId) fetchCategoryAttributes(catId);

      // Changelog
      if (user) {
        try {
          await (supabase as any).from('listing_changelog').insert({
            item_id: `ai-draft-${sku || productName}`,
            marketplace: 'ml',
            account_name: accountName,
            campo: 'ai_draft_criado',
            valor_anterior: '',
            valor_novo: data?.copy?.title?.value || productName,
            usuario: user.username,
          });
        } catch (logErr) {
          console.warn('Changelog insert failed:', logErr);
        }
      }
    } catch (err: any) {
      clearInterval(stepTimer);
      setCurrentStep(null);
      setError(err.message || 'Erro ao gerar anúncio.');
    } finally {
      setGenerating(false);
    }
  }

  async function fetchCategoryAttributes(catId: string) {
    if (!catId || catId.length < 4) return;
    setLoadingAttrs(true);
    setCategoryAttributes([]);
    try {
      const { data, error } = await supabase.functions.invoke('mercado-livre', {
        body: { action: 'get_category_attributes', category_id: catId, account_id: accountId },
      });
      if (error || !data?.attributes) return;
      setCategoryAttributes(data.attributes);
      const newVals: Record<string, string> = {};
      data.attributes.forEach((a: any) => {
        if (a.id === 'family_name') newVals['family_name'] = editTitle.split(' ').slice(0, 3).join(' ');
        // BRAND left empty for user to fill
        if (a.id === 'MODEL') newVals['MODEL'] = sku || '';
      });
      setAttrValues(prev => ({ ...prev, ...newVals }));
    } catch { /* ignore */ } finally {
      setLoadingAttrs(false);
    }
  }

  async function handlePublish() {
    if (!editTitle || !editPrice || !editCategoryId) {
      setError('Preencha título, preço e categoria antes de publicar.');
      return;
    }
    setPublishing(true);
    setPublishMsg('');
    setError('');

    try {
      setPublishMsg('Publicando anúncio...');

      const pictures = selectedPhotos.map(u => ({ source: u }));

      // Build base payload — minimal and safe for all categories
      const itemPayload: any = {
        title: (editTitleSeo || editTitle).slice(0, 60),
        price: Number(editPrice),
        available_quantity: Number(editQuantity) || 1,
        condition: 'new',
        listing_type_id: editListingType || 'gold_special',
        category_id: editCategoryId,
        currency_id: 'BRL',
        buying_mode: 'buy_it_now',
      };

      // SKU
      if (sku) itemPayload.seller_custom_field = sku;

      // Pictures
      if (pictures.length > 0) itemPayload.pictures = pictures;

      // Warranty — only add if both fields are filled
      if (editWarrantyType && editWarrantyTime) {
        itemPayload.sale_terms = [
          { id: 'WARRANTY_TYPE', value_name: editWarrantyType },
          { id: 'WARRANTY_TIME', value_name: editWarrantyTime },
        ];
      }

      // Shipping dimensions from planilha — only add if we have all values
      const dim = driveDimensions;
      if (
        dim?.largura_embalagem && dim?.altura_embalagem &&
        dim?.profundidade_embalagem && dim?.peso_embalagem
      ) {
        itemPayload.shipping = {
          dimensions: {
            width: Math.round(dim.largura_embalagem * 10),   // ML usa mm
            height: Math.round(dim.altura_embalagem * 10),
            length: Math.round(dim.profundidade_embalagem * 10),
            weight: Math.round(dim.peso_embalagem * 1000),   // ML usa gramas
          },
        };
      }

      // ALWAYS add attributes — family_name, BRAND and ITEM_CONDITION are required
      // NOTE: family_name will be extracted to body root level by the edge function
      itemPayload.attributes = [
        { id: 'family_name', value_name: attrValues['family_name']?.trim() || (editTitleSeo || editTitle || '').split(' ').slice(0, 3).join(' ') },
        { id: 'BRAND', value_name: attrValues['BRAND']?.trim() || 'Sem marca' },
        { id: 'ITEM_CONDITION', value_name: 'Novo' },
        // Other attributes filled by user
        ...Object.entries(attrValues || {})
          .filter(([id, val]) => id !== 'BRAND' && id !== 'family_name' && id !== 'ITEM_CONDITION' && val?.trim())
          .map(([id, value]) => ({ id, value_name: String(value).trim() })),
      ];

      // Channels — required per ML API (replaces deprecated exclusive_channel)
      itemPayload.channels = ['marketplace'];
      console.log('[PUBLISH] attributes:', JSON.stringify(itemPayload.attributes));
      console.log('[PUBLISH] FULL PAYLOAD:', JSON.stringify(itemPayload, null, 2));

      const { data: result, error: fnError } = await supabase.functions.invoke('mercado-livre', {
        body: { action: 'create_item', new_item: itemPayload, account_id: accountId },
      });

      if (fnError) throw new Error(fnError.message);

      // ML returns error details in result.error or result.message
      if (result?.error) {
        const detail = result.cause ? ` (${JSON.stringify(result.cause)})` : '';
        throw new Error(`ML: ${result.message || result.error}${detail}`);
      }

      if (!result?.id) throw new Error('ML não retornou ID — verifique os atributos obrigatórios da categoria.');

      // Step 2: Description
      if (editDescription.trim()) {
        setPublishMsg('Criando descrição...');
        await supabase.functions.invoke('mercado-livre', {
          body: {
            action: 'update_description',
            item_id: result.id,
            description_text: editDescription,
            account_id: accountId,
          },
        }).catch(() => {});
      }

      // Step 3: Log
      try {
        await (supabase as any).from('listing_changelog').insert({
          item_id: result.id,
          marketplace: 'ml',
          account_name: accountName,
          campo: 'criação_ia',
          valor_anterior: '',
          valor_novo: itemPayload.title,
          usuario: user?.username || 'system',
        });
      } catch { /* optional */ }

      setPublishMsg(`✅ Publicado! ID: ${result.id}`);

    } catch (err: any) {
      const msg = err.message || 'Erro ao publicar.';
      // Show the real ML error — not just a generic timeout message
      setError(`❌ ${msg}`);
      setPublishMsg('');
    } finally {
      setPublishing(false);
    }
  }

  function handleFallbackPublish() {
    onPublish({
      title: editTitleSeo || editTitle,
      price: Number(editPrice),
      description: editDescription,
      category_id: editCategoryId,
      seller_sku: sku,
      photo_urls: selectedPhotos,
      quantity: Number(editQuantity) || 1,
      listing_type: editListingType,
      warranty_type: editWarrantyType,
      warranty_time: editWarrantyTime,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Overlay */}
      <div className="flex-1 bg-black/50" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-2xl h-full bg-background border-l border-border flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <span className="font-semibold text-foreground">Criar Anúncio com IA</span>
            <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted">Mercado Livre</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Conta selecionada */}
        <div className={`flex items-center gap-3 px-4 py-2.5 border-b ${
          accountName
            ? 'bg-yellow-400/5 border-yellow-400/20'
            : 'bg-red-400/5 border-red-400/20'
        }`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
            accountName ? 'bg-yellow-400/15' : 'bg-red-400/15'
          }`}>
            <DollarSign className={`w-3 h-3 ${accountName ? 'text-yellow-500' : 'text-red-400'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Publicando na conta</p>
            <p className={`text-xs font-medium truncate ${accountName ? 'text-foreground' : 'text-red-400'}`}>
              {accountName || 'Selecione uma conta ML antes de continuar'}
            </p>
          </div>
          {accountName
            ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            : <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          }
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* FASE 1: Input */}
          {!draft && !generating && (
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-semibold uppercase text-muted-foreground">SKU (opcional)</label>
                <input
                  value={sku}
                  onChange={e => setSku(e.target.value.toUpperCase())}
                  placeholder="VIX-001"
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-muted text-sm text-foreground outline-none"
                />
                {sku && estoqueItems?.find(e => e.skuPrincipal === sku) && (
                  <p className="mt-1 text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Dados encontrados nas planilhas
                  </p>
                )}
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase text-muted-foreground">Nome do Produto *</label>
                <input
                  value={productName}
                  onChange={e => setProductName(e.target.value)}
                  placeholder="Ex: Mochila Impermeável 30L USB"
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-muted text-sm text-foreground outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase text-muted-foreground">Descrição base (opcional)</label>
                <textarea
                  value={productDesc}
                  onChange={e => setProductDesc(e.target.value)}
                  rows={3}
                  placeholder="Características principais, material, uso..."
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-muted text-sm text-foreground outline-none resize-y"
                />
              </div>

              {/* Busca automática: fotos + medidas */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">
                    Fotos e medidas
                  </label>
                  {driveFolder && (
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />{driveFolder}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={searchDriveData}
                  disabled={driveLoading || !sku.trim()}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors w-full justify-center"
                >
                  {driveLoading
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando no Drive...</>
                    : <><FolderOpen className="w-3.5 h-3.5" /> Buscar fotos e medidas (Drive)</>
                  }
                </button>

                {driveError && (
                  <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3" />{driveError}
                  </p>
                )}

                {/* Medidas encontradas */}
                {driveDimensions?.found && (
                  <div className="px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-[11px] text-emerald-400">
                    <span className="font-medium">Medidas carregadas: </span>
                    {driveDimensions.largura_produto}×{driveDimensions.altura_produto}×{driveDimensions.profundidade_produto}cm
                    · {driveDimensions.peso_embalagem}kg emb.
                  </div>
                )}

                {/* Grid de fotos */}
                {drivePhotos.length > 0 && (
                  <>
                    <p className="text-[10px] text-muted-foreground">
                      Clique para deselecionar. Máximo 6 fotos para o ML.
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {drivePhotos.map((url, i) => (
                        <div
                          key={i}
                          onClick={() => togglePhoto(url)}
                          className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all aspect-square ${
                            selectedPhotos.includes(url) ? 'border-purple-500' : 'border-border opacity-40'
                          }`}
                        >
                          <img
                            src={url}
                            alt={`Foto ${i + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                          />
                          {selectedPhotos.includes(url) && (
                            <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center">
                              <CheckCircle className="w-3.5 h-3.5 text-white" />
                            </div>
                          )}
                          <div className="absolute bottom-1 left-1 bg-black/50 text-white text-[9px] px-1 rounded">
                            {i + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground text-right">
                      {selectedPhotos.length}/{Math.min(drivePhotos.length, 6)} selecionada(s)
                    </p>
                  </>
                )}

                {!drivePhotos.length && !driveLoading && (
                  <p className="text-[10px] text-muted-foreground">
                    Busca na pasta com o nome do SKU em: Drive → Design → IMAGENS - IA · e medidas na planilha SKU-DIMENSÕES
                  </p>
                )}
              </div>

              {error && (
                <p className="text-red-400 text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />{error}
                </p>
              )}

              <button
                onClick={handleGenerate}
                disabled={generating || !productName.trim() || !accountId}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {generating
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando anúncio...</>
                  : <><Sparkles className="w-4 h-4" /> Gerar Anúncio com IA</>
                }
              </button>
            </div>
          )}

          {/* FASE 2: Progresso dos agentes */}
          {generating && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Os agentes estão trabalhando em sequência...</p>
              {AGENT_STEPS.map((step, idx) => {
                const stepKeys = AGENT_STEPS.map(s => s.key);
                const currentIdx = stepKeys.indexOf(currentStep || '');
                const isActive = currentStep === step.key;
                const isDone = currentIdx > idx;
                return (
                  <div
                    key={step.key}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-500 ${
                      isActive
                        ? 'border-purple-500/50 bg-purple-500/5'
                        : isDone
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : 'border-border bg-muted/20'
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    ) : isActive ? (
                      <Loader2 className="w-4 h-4 text-purple-400 animate-spin flex-shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-border flex-shrink-0" />
                    )}
                    <div>
                      <p className={`text-sm font-medium transition-colors ${
                        isActive ? 'text-purple-300' : isDone ? 'text-emerald-400' : 'text-muted-foreground'
                      }`}>
                        {step.label}
                      </p>
                      {isActive && (
                        <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* FASE 3: Draft gerado */}
          {draft && !generating && (
            <div className="space-y-5">
              {/* Compliance badge */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${draft.compliance?.approved ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                {draft.compliance?.approved
                  ? <><CheckCircle className="w-4 h-4" /> Anúncio aprovado pelo agente de compliance</>
                  : <><AlertTriangle className="w-4 h-4" /> {draft.compliance?.issues?.join(' • ')}</>
                }
              </div>

              {/* Agentes resumo */}
              <div className="grid grid-cols-5 gap-2">
                {AGENT_STEPS.map(step => (
                  <div key={step.key} className="flex flex-col items-center gap-1 p-2 rounded-lg bg-muted/40 text-center">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[10px] text-muted-foreground leading-tight">{step.label}</span>
                  </div>
                ))}
              </div>

              {/* Título */}
              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase text-muted-foreground flex justify-between">
                  Título <span className={editTitle.length > 55 ? 'text-red-400' : 'text-muted-foreground'}>{editTitle.length}/60</span>
                </label>
                <input
                  maxLength={60}
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted text-sm text-foreground outline-none border border-border focus:border-purple-500/50"
                />
                {editTitleSeo && editTitleSeo !== editTitle && (
                  <div className="text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-purple-400 font-medium shrink-0">SEO:</span>
                    <span className="cursor-pointer hover:text-foreground" onClick={() => setEditTitle(editTitleSeo)}>
                      {editTitleSeo} <span className="text-purple-400 ml-1">← usar este</span>
                    </span>
                  </div>
                )}
              </div>

              {/* Keywords */}
              {draft.seo?.primary_keywords?.length > 0 && (
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Keywords Primárias</label>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {draft.seo.primary_keywords.map((kw: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20">{kw}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Highlights */}
              {draft.copy?.highlights?.value?.length > 0 && (
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Destaques do Produto</label>
                  <ul className="mt-2 space-y-1.5">
                    {draft.copy.highlights.value.map((h: string, i: number) => (
                      <li key={i} className="text-sm text-foreground bg-muted/40 px-3 py-1.5 rounded-lg">{h}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Preço */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Preço Sugerido (R$)</label>
                  <input
                    type="number" step="0.01"
                    value={editPrice}
                    onChange={e => setEditPrice(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-muted text-sm text-foreground outline-none border border-border focus:border-purple-500/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Categoria ML</label>
                  <div className="relative mt-1">
                    <div className="flex items-center gap-2">
                      <input
                        value={editCategoryId}
                        onChange={e => setEditCategoryId(e.target.value)}
                        placeholder={draft.compliance?.category_suggestion || 'MLB...'}
                        className="flex-1 px-3 py-2 rounded-lg bg-muted text-sm text-foreground outline-none border border-border focus:border-purple-500/50"
                      />
                    </div>
                    {editCategoryId && (
                      <p className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        {draft.compliance?.category_suggestion || editCategoryId}
                      </p>
                    )}
                  </div>
                  {/* Category search */}
                  <div className="mt-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        value={catQuery}
                        onChange={e => searchCategories(e.target.value)}
                        placeholder="Buscar categoria... ex: torneira"
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-muted/50 text-xs text-foreground outline-none border border-border focus:border-purple-500/50"
                      />
                      {catSearching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-muted-foreground" />}
                    </div>
                    {catResults.length > 0 && (
                      <div className="mt-1 border border-border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                        {catResults.map((cat, i) => (
                          <button
                            key={i}
                            onClick={() => { setEditCategoryId(cat.id); setCatResults([]); setCatQuery(''); fetchCategoryAttributes(cat.id); }}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-purple-500/10 transition-colors border-b border-border last:border-b-0 ${
                              editCategoryId === cat.id ? 'bg-purple-500/10 text-purple-400' : 'text-foreground'
                            }`}
                          >
                            <span className="font-medium">{cat.id}</span>
                            <span className="text-muted-foreground ml-2">— {cat.name}</span>
                            {cat.path && <p className="text-[10px] text-muted-foreground mt-0.5">{cat.path}</p>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Atributos obrigatórios da categoria */}
              {loadingAttrs && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Carregando atributos obrigatórios da categoria...
                </div>
              )}

              {categoryAttributes.length > 0 && (
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    Atributos obrigatórios da categoria
                  </label>
                  <div className="space-y-2">
                    {categoryAttributes.map((attr) => (
                      <div key={attr.id}>
                        <label className="text-[10px] text-muted-foreground flex items-center gap-1">
                          {attr.name}
                          {attr.required && <span className="text-red-400">*</span>}
                        </label>
                        {attr.id === 'BRAND' ? (
                          <div className="relative mt-0.5">
                            <input
                              value={attrValues['BRAND'] || ''}
                              onChange={e => setAttrValues(prev => ({ ...prev, BRAND: e.target.value }))}
                              list="brand-suggestions"
                              placeholder="Digite sua marca ou busque na lista..."
                              className="w-full px-3 py-1.5 rounded-lg bg-muted text-sm text-foreground outline-none border border-border focus:border-purple-500/50"
                            />
                            <datalist id="brand-suggestions">
                              {attr.values.map((v: any) => (
                                <option key={v.id} value={v.name} />
                              ))}
                            </datalist>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              Digite o nome da sua marca. Se não estiver na lista, escreva assim mesmo.
                            </p>
                          </div>
                        ) : attr.values.length > 0 ? (
                          <select
                            value={attrValues[attr.id] || ''}
                            onChange={e => setAttrValues(prev => ({ ...prev, [attr.id]: e.target.value }))}
                            className="mt-0.5 w-full px-3 py-1.5 rounded-lg bg-muted text-sm text-foreground outline-none border border-border focus:border-purple-500/50"
                          >
                            <option value="">Selecionar...</option>
                            {attr.values.map((v: any) => (
                              <option key={v.id} value={v.name}>{v.name}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={attrValues[attr.id] || ''}
                            onChange={e => setAttrValues(prev => ({ ...prev, [attr.id]: e.target.value }))}
                            placeholder={attr.hint || `Digite ${attr.name.toLowerCase()}...`}
                            className="mt-0.5 w-full px-3 py-1.5 rounded-lg bg-muted text-sm text-foreground outline-none border border-border focus:border-purple-500/50"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quantidade, Tipo Listagem, Garantia */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Quantidade</label>
                  <input type="number" min="1" value={editQuantity} onChange={e => setEditQuantity(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-muted text-sm text-foreground outline-none border border-border" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Tipo Listagem</label>
                  <select value={editListingType} onChange={e => setEditListingType(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-muted text-sm text-foreground outline-none border border-border">
                    <option value="gold_special">Clássico</option>
                    <option value="gold_pro">Premium</option>
                    <option value="free">Grátis</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Tipo Garantia</label>
                  <select value={editWarrantyType} onChange={e => setEditWarrantyType(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-muted text-sm text-foreground outline-none border border-border">
                    <option value="Garantia do vendedor">Garantia do vendedor</option>
                    <option value="Garantia de fábrica">Garantia de fábrica</option>
                    <option value="Sem garantia">Sem garantia</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Tempo Garantia</label>
                  <input value={editWarrantyTime} onChange={e => setEditWarrantyTime(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-muted text-sm text-foreground outline-none border border-border" placeholder="90 dias" />
                </div>
              </div>

              {/* Dimensões */}
              {draft.dimensions?.found && (
                <div className="px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/20 text-[11px] text-blue-400">
                  <span className="font-medium">📐 Dimensões: </span>
                  {draft.dimensions.largura_produto}×{draft.dimensions.altura_produto}×{draft.dimensions.profundidade_produto}cm
                  · Emb: {draft.dimensions.largura_embalagem}×{draft.dimensions.altura_embalagem}×{draft.dimensions.profundidade_embalagem}cm
                  · {draft.dimensions.peso_embalagem}kg
                </div>
              )}

              {/* Descrição */}
              <div>
                <label className="text-[11px] font-semibold uppercase text-muted-foreground flex justify-between">
                  Descrição <span>{editDescription.length} chars</span>
                </label>
                <textarea
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  rows={6}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-muted text-sm text-foreground outline-none resize-y border border-border focus:border-purple-500/50"
                />
              </div>

              {/* Fotos selecionadas */}
              {selectedPhotos.length > 0 && (
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">
                    Fotos selecionadas ({selectedPhotos.length})
                  </label>
                  <div className="flex gap-2 mt-2 overflow-x-auto">
                    {selectedPhotos.map((url, i) => (
                      <img key={i} src={url} alt={`Foto ${i+1}`} className="w-14 h-14 rounded-lg object-cover border border-border flex-shrink-0" />
                    ))}
                  </div>
                </div>
              )}

              {/* Posicionamento estratégico */}
              {draft.strategy?.positioning && (
                <div className="px-3 py-2.5 rounded-lg bg-purple-500/5 border border-purple-500/20 text-xs text-purple-300">
                  <span className="font-semibold">Estratégia: </span>{draft.strategy.positioning}
                </div>
              )}

              {error && (
                <p className="text-red-400 text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />{error}
                </p>
              )}

              {publishMsg && (
                <div className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${publishMsg.startsWith('✅') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                  {publishMsg.startsWith('✅') ? <CheckCircle className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                  {publishMsg}
                  {publishMsg.includes('ID:') && (
                    <a href={`https://www.mercadolivre.com.br/anuncios/${publishMsg.split('ID: ')[1]}`} target="_blank" rel="noopener noreferrer" className="ml-auto">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )}

              {/* Botões */}
              <div className="flex gap-3">
                <button
                  onClick={() => { setDraft(null); setCurrentStep(null); setError(''); setPublishMsg(''); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  <RefreshCw className="w-4 h-4" /> Gerar novamente
                </button>
                <button
                  onClick={handlePublish}
                  disabled={publishing || publishMsg.startsWith('✅')}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {publishing ? 'Publicando...' : publishMsg.startsWith('✅') ? 'Publicado!' : 'Publicar no Mercado Livre'}
                </button>
              </div>

              {/* Fallback: enviar pro formulário manual */}
              {!publishMsg.startsWith('✅') && (
                <button
                  onClick={handleFallbackPublish}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                >
                  Ou enviar para o formulário manual →
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
