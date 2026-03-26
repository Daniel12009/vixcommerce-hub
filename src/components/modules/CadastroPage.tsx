import { useState, useCallback, useRef, useEffect } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Package, Award, XCircle, CheckCircle, Truck, Loader2, RefreshCw, X, FileText, ChevronRight, ChevronLeft, Search, Plus, ExternalLink, ImageIcon, DollarSign, Edit3, Save, Upload, Ruler, Weight, Tag, AlertCircle, AlertTriangle, Filter, Layers, Trash2, PauseCircle, Clock, Megaphone, Star, Eye, Store, Settings2, Sparkles } from 'lucide-react';
import { ShopeeCadastroTab } from './ShopeeCadastroTab';
import { AIAdCreator } from './AIAdCreator';

// ━━━ Types ━━━
interface MLItemSummary {
  id: string; title: string; price: number; thumbnail: string;
  available_quantity: number; status: string; sub_status: string[];
  seller_sku: string; skus: string[]; conta: string;
  catalog_listing?: boolean; listing_type_id?: string;
  logistic_type?: string; tags?: string[]; date_created?: string;
}

interface MLItemDetail {
  id: string; title: string; price: number; available_quantity: number;
  status: string; sub_status: string[]; condition: string; permalink: string;
  listing_type_id: string; date_created: string; category_id: string;
  catalog_listing: boolean; warranty: string; video_id: string;
  pictures: { id: string; url: string; secure_url: string }[];
  variations: {
    id: number; price: number; available_quantity: number;
    picture_ids: string[];
    attribute_combinations: { id: string; name: string; value_name: string }[];
  }[];
  shipping: { logistic_type: string; free_shipping: boolean; dimensions?: any; local_pick_up?: boolean; free_methods?: any[] };
  seller_custom_field: string; description_text: string; conta: string;
  tags: string[]; attributes: { id: string; name: string; value_name: string }[];
  promotions: { id: string; type: string; status: string; start_date: string; finish_date: string; deal_price?: number; name?: string }[];
  health: { good_quality_thumbnail: boolean; good_quality_picture: boolean; catalog_listing: boolean };
  sale_terms: { id: string; name: string; value_name: string }[];
}

interface ChangeLogEntry {
  id: string; item_id: string; campo: string; valor_anterior: string;
  valor_novo: string; usuario: string; created_at: string;
}

type StatusFilter = 'all' | 'active' | 'paused' | 'closed';

// ━━━ Helper ━━━
async function callML(body: any) {
  const { data, error } = await supabase.functions.invoke('mercado-livre', { body });
  if (error) throw new Error(error.message || 'Edge Function error');
  return data;
}

// ━━━ Badges ━━━
function ItemStatusBadge({ status, subStatus }: { status: string; subStatus?: string[] }) {
  const isGhost = subStatus && subStatus.length > 0;
  const ghostLabel = isGhost ? subStatus.join(', ') : '';

  if (isGhost && status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-orange-400 bg-orange-400/10" title={ghostLabel}>
        <AlertTriangle className="w-3 h-3" />Restrito
      </span>
    );
  }

  const map: Record<string, { icon: any; label: string; cls: string }> = {
    active: { icon: CheckCircle, label: 'Ativo', cls: 'text-emerald-400 bg-emerald-400/10' },
    paused: { icon: PauseCircle, label: 'Pausado', cls: 'text-yellow-400 bg-yellow-400/10' },
    closed: { icon: XCircle, label: 'Encerrado', cls: 'text-red-400 bg-red-400/10' },
    under_review: { icon: Clock, label: 'Em revisão', cls: 'text-blue-400 bg-blue-400/10' },
  };
  const s = map[status] || { icon: AlertCircle, label: status, cls: 'text-muted-foreground bg-muted' };
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.cls}`}>
      <Icon className="w-3 h-3" />{s.label}
    </span>
  );
}

function TypeBadge({ catalog, logistic }: { catalog?: boolean; logistic?: string }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {catalog && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/10 text-purple-400">CATÁLOGO</span>}
      {logistic === 'fulfillment' && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/10 text-blue-400">FULL</span>}
      {logistic === 'cross_docking' && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500/10 text-orange-400">COLETA</span>}
    </div>
  );
}

// ━━━ Main Component ━━━
export function CadastroPage() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);

  const PlatformTabs = [
    { id: 'ml', label: 'Mercado Livre', icon: DollarSign, colorClass: 'bg-[hsl(45,100%,50%,0.1)] text-[#fbbc04] border-[#fbbc04]/30' },
    { id: 'shopee', label: 'Shopee', icon: Store, colorClass: 'bg-[#ee4d2d]/10 text-[#ee4d2d] border-[#ee4d2d]/30' },
    { id: 'amazon', label: 'Amazon', icon: Package, colorClass: 'bg-[#ff9900]/10 text-[#ff9900] border-[#ff9900]/30' },
    { id: 'tiktok', label: 'TikTok Shop', icon: Layers, colorClass: 'bg-black/5 text-foreground border-border' },
    { id: 'generic', label: 'Outros Canais', icon: Settings2, colorClass: 'bg-primary/5 text-primary border-primary/20' },
  ];

  // Accounts — cached
  const [accounts, setAccounts] = useState<{ id: string; nome: string }[]>(() => {
    try { const c = localStorage.getItem('ml_accounts'); return c ? JSON.parse(c) : []; } catch { return []; }
  });
  const [selectedAccount, setSelectedAccount] = useState(() => {
    try { return localStorage.getItem('ml_selected_account') || ''; } catch { return ''; }
  });
  const [accountsLoaded, setAccountsLoaded] = useState(false);

  const [items, setItems] = useState<MLItemSummary[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [searchSku, setSearchSku] = useState('');
  const [searching, setSearching] = useState(false);

  const [detail, setDetail] = useState<MLItemDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [editAttributes, setEditAttributes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const [changelog, setChangelog] = useState<ChangeLogEntry[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState(0);

  const [showCreate, setShowCreate] = useState(false);
  const [showAICreator, setShowAICreator] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');
  const [newItem, setNewItem] = useState({
    title: '', price: '', quantity: '1', condition: 'new',
    listing_type: 'gold_special', category_id: '', description: '',
    picture_urls: '', seller_sku: '',
  });

  const [uploading, setUploading] = useState(false);
  const [categorySuggestions, setCategorySuggestions] = useState<{ domain_name: string; category_id: string; category_name: string }[]>([]);
  const [catSearching, setCatSearching] = useState(false);
  const [catSearchQuery, setCatSearchQuery] = useState('');

  // Load accounts on mount
  useEffect(() => {
    if (accountsLoaded) return;
    (async () => {
      try {
        const data = await callML({ action: 'list_accounts' });
        setAccounts(data || []);
        localStorage.setItem('ml_accounts', JSON.stringify(data || []));
        if (data?.length > 0 && !selectedAccount) {
          setSelectedAccount(data[0].id);
          localStorage.setItem('ml_selected_account', data[0].id);
        }
        setAccountsLoaded(true);
      } catch (err: any) { console.error('Error loading accounts:', err); setAccountsLoaded(true); }
    })();
  }, [accountsLoaded, selectedAccount]);

  const loadItems = useCallback(async (offset = 0, status?: string) => {
    if (!selectedAccount) return;
    setListLoading(true);
    try {
      const s = status || statusFilter;
      const data = await callML({ action: 'list_seller_items', account_id: selectedAccount, offset, limit: 50, status: s });
      setItems(data.items || []);
      setTotalItems(data.total || 0);
      setCurrentOffset(offset);
    } catch (err: any) { console.error('Error loading items:', err); }
    setListLoading(false);
  }, [selectedAccount, statusFilter]);

  const handleSearch = useCallback(async () => {
    if (!searchSku.trim()) { loadItems(0); return; }
    setSearching(true); setDetail(null);
    try {
      const data = await callML({ action: 'search_items_by_sku', sku: searchSku.trim(), account_id: selectedAccount || undefined });
      setItems(data.items || []); setTotalItems(data.items?.length || 0); setCurrentOffset(0);
    } catch (err: any) { console.error('Search error:', err); }
    setSearching(false);
  }, [searchSku, selectedAccount, loadItems]);

  const loadDetail = useCallback(async (itemId: string) => {
    setDetailLoading(true); setEditMode(false); setSaveMsg('');
    try {
      const data = await callML({ action: 'get_item_detail', item_id: itemId, account_id: selectedAccount || undefined });
      setDetail(data); setSelectedPhoto(0);
      const { data: logs } = await (supabase as any).from('listing_changelog').select('*').eq('item_id', itemId).order('created_at', { ascending: false }).limit(20);
      setChangelog(logs || []);
    } catch (err: any) { console.error('Detail error:', err); }
    setDetailLoading(false);
  }, [selectedAccount]);

  const startEdit = () => {
    if (!detail) return;
    setEditFields({
      title: detail.title || '',
      price: String(detail.price || ''),
      available_quantity: String(detail.available_quantity || ''),
      description: detail.description_text || '',
      warranty: detail.warranty || '',
      video_id: detail.video_id || '',
    });
    // Populate editable attributes
    const attrMap: Record<string, string> = {};
    (detail.attributes || []).forEach(a => { if (a.value_name) attrMap[a.id] = a.value_name; });
    setEditAttributes(attrMap);
    setEditMode(true); setSaveMsg('');
  };

  const handleSave = async () => {
    if (!detail || !user) return;
    setSaving(true); setSaveMsg('');
    try {
      const changes: { campo: string; anterior: string; novo: string }[] = [];
      const updateFields: any = {};
      if (editFields.title !== detail.title) { updateFields.title = editFields.title; changes.push({ campo: 'title', anterior: detail.title, novo: editFields.title }); }
      if (Number(editFields.price) !== detail.price) { updateFields.price = Number(editFields.price); changes.push({ campo: 'price', anterior: String(detail.price), novo: editFields.price }); }
      if (Number(editFields.available_quantity) !== detail.available_quantity) { updateFields.available_quantity = Number(editFields.available_quantity); changes.push({ campo: 'available_quantity', anterior: String(detail.available_quantity), novo: editFields.available_quantity }); }
      if (editFields.warranty !== (detail.warranty || '')) { updateFields.warranty = editFields.warranty; changes.push({ campo: 'warranty', anterior: detail.warranty || '', novo: editFields.warranty }); }
      if (editFields.video_id !== (detail.video_id || '')) { updateFields.video_id = editFields.video_id; changes.push({ campo: 'video_id', anterior: detail.video_id || '', novo: editFields.video_id }); }
      // Check attribute changes
      const changedAttrs: { id: string; value_name: string }[] = [];
      for (const [attrId, newVal] of Object.entries(editAttributes)) {
        const original = (detail.attributes || []).find(a => a.id === attrId);
        if (original && newVal !== original.value_name) {
          changedAttrs.push({ id: attrId, value_name: newVal });
          changes.push({ campo: `attr:${original.name}`, anterior: original.value_name, novo: newVal });
        }
      }
      if (changedAttrs.length > 0) updateFields.attributes = changedAttrs;
      if (Object.keys(updateFields).length > 0) await callML({ action: 'update_item', item_id: detail.id, fields: updateFields, account_id: selectedAccount });
      if (editFields.description !== detail.description_text) {
        await callML({ action: 'update_description', item_id: detail.id, description_text: editFields.description, account_id: selectedAccount });
        changes.push({ campo: 'description', anterior: '(alterado)', novo: '(alterado)' });
      }
      for (const c of changes) {
        await (supabase as any).from('listing_changelog').insert({ item_id: detail.id, marketplace: 'ml', account_name: detail.conta || '', campo: c.campo, valor_anterior: c.anterior, valor_novo: c.novo, usuario: user.username });
      }
      setSaveMsg(`✅ ${changes.length} campo(s) atualizado(s)!`);
      setEditMode(false);
      await loadDetail(detail.id);
    } catch (err: any) { setSaveMsg(`❌ Erro: ${err.message}`); }
    setSaving(false);
  };

  const predictCategory = useCallback(async (title: string) => {
    if (title.length < 5) { setCategorySuggestions([]); return; }
    setCatSearching(true);
    try {
      const data = await callML({ action: 'predict_category', query: title });
      setCategorySuggestions(data || []);
    } catch { setCategorySuggestions([]); }
    setCatSearching(false);
  }, []);

  const searchCategories = useCallback(async (q: string) => {
    if (q.length < 2) return;
    setCatSearching(true);
    try {
      const data = await callML({ action: 'search_categories', query: q });
      setCategorySuggestions(Array.isArray(data) ? data.map((c: any) => ({ domain_name: '', category_id: c.id, category_name: c.name || c.id })).slice(0, 8) : []);
    } catch { setCategorySuggestions([]); }
    setCatSearching(false);
  }, []);

  const handleCreate = async () => {
    if (!newItem.title.trim() || !newItem.price || !newItem.category_id.trim()) { setCreateMsg('❌ Preencha título, preço e categoria.'); return; }
    setCreating(true); setCreateMsg('');
    try {
      const pictures = newItem.picture_urls.split('\n').filter(u => u.trim()).map(u => ({ source: u.trim() }));
      const itemPayload: any = { title: newItem.title, price: Number(newItem.price), available_quantity: Number(newItem.quantity) || 1, condition: newItem.condition, listing_type_id: newItem.listing_type, category_id: newItem.category_id, currency_id: 'BRL', buying_mode: 'buy_it_now' };
      if (pictures.length > 0) itemPayload.pictures = pictures;
      if (newItem.seller_sku) itemPayload.seller_custom_field = newItem.seller_sku;
      const result = await callML({ action: 'create_item', new_item: itemPayload, account_id: selectedAccount });
      if (newItem.description.trim() && result.id) await callML({ action: 'update_description', item_id: result.id, description_text: newItem.description, account_id: selectedAccount });
      if (user && result.id) await (supabase as any).from('listing_changelog').insert({ item_id: result.id, marketplace: 'ml', account_name: accounts.find(a => a.id === selectedAccount)?.nome || '', campo: 'criação', valor_anterior: '', valor_novo: newItem.title, usuario: user.username });
      setCreateMsg(`✅ Anúncio criado! ID: ${result.id}`);
      setNewItem({ title: '', price: '', quantity: '1', condition: 'new', listing_type: 'gold_special', category_id: '', description: '', picture_urls: '', seller_sku: '' });
      setTimeout(() => { loadItems(0); setShowCreate(false); setCreateMsg(''); }, 2000);
    } catch (err: any) { setCreateMsg(`❌ Erro: ${err.message}`); }
    setCreating(false);
  };

  const handlePhotoUpload = async (file: File) => {
    if (!detail) return;
    setUploading(true);
    try {
      const fileName = `ml-photos/${detail.id}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from('listing-photos').upload(fileName, file, { contentType: file.type });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from('listing-photos').getPublicUrl(fileName);
      await callML({ action: 'upload_picture', item_id: detail.id, fields: { picture_url: urlData.publicUrl }, account_id: selectedAccount });
      if (user) await (supabase as any).from('listing_changelog').insert({ item_id: detail.id, marketplace: 'ml', account_name: detail.conta, campo: 'foto_adicionada', valor_anterior: '', valor_novo: file.name, usuario: user.username });
      setSaveMsg('✅ Foto adicionada!');
      await loadDetail(detail.id);
    } catch (err: any) { setSaveMsg(`❌ Erro upload: ${err.message}`); }
    setUploading(false);
  };

  const handleDeletePhoto = async () => {
    if (!detail || detail.pictures?.length <= 1) return; // Need at least 1 photo
    const pic_id = detail.pictures[selectedPhoto]?.id;
    if (!pic_id) return;
    if (!window.confirm('Tem certeza que deseja remover esta foto?')) return;
    
    setUploading(true);
    try {
      await callML({ action: 'delete_picture', item_id: detail.id, fields: { picture_id: pic_id }, account_id: selectedAccount });
      if (user) await (supabase as any).from('listing_changelog').insert({ item_id: detail.id, marketplace: 'ml', account_name: detail.conta, campo: 'foto_removida', valor_anterior: pic_id, valor_novo: '', usuario: user.username });
      setSaveMsg('✅ Foto removida!');
      setSelectedPhoto(0);
      await loadDetail(detail.id);
    } catch (err: any) { setSaveMsg(`❌ Erro ao remover foto: ${err.message}`); }
    setUploading(false);
  };

  if (!selectedPlatform) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
        <PageHeader title="Ficha Técnica" subtitle="Selecione um marketplace para gerenciar, editar e criar novos anúncios." />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mt-6">
          {PlatformTabs.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedPlatform(p.id)}
              className={`p-6 rounded-2xl border bg-card hover:bg-muted/50 transition-all text-left group relative overflow-hidden flex flex-col items-center text-center gap-4 ${p.colorClass}`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="p-4 rounded-full bg-background shadow-sm group-hover:scale-110 transition-transform duration-300">
                <p.icon className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-bold text-lg">{p.label}</h3>
                <p className="text-xs text-muted-foreground mt-1 font-medium">Acessar Anúncios</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (selectedPlatform === 'shopee') {
    return (
      <div className="animate-in fade-in slide-in-from-right-8 duration-300 pb-12">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setSelectedPlatform(null)} className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <span className="bg-[#ee4d2d]/10 text-[#ee4d2d] p-1 rounded-md"><Store className="w-4 h-4"/></span>
            Shopee — Ficha Técnica
          </h2>
        </div>
        <ShopeeCadastroTab />
      </div>
    );
  }

  if (selectedPlatform !== 'ml') {
    return (
      <div className="animate-in fade-in slide-in-from-right-8 duration-300 pb-12">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setSelectedPlatform(null)} className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-foreground capitalize flex items-center gap-2">
            {PlatformTabs.find(p => p.id === selectedPlatform)?.label} — Ficha Técnica
          </h2>
        </div>
        <div className="bg-card border border-border rounded-xl p-12 text-center mt-4">
          <Layers className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Conexão API em Desenvolvimento</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            A gestão de anúncios (CRUD completo) para {PlatformTabs.find(p => p.id === selectedPlatform)?.label} será integrada na próxima atualização.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-right-8 duration-300">
      <div className="flex items-center gap-3 mb-3">
        <button onClick={() => setSelectedPlatform(null)} className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <PageHeader title="Ficha Técnica" subtitle="Gestão de Anúncios — Mercado Livre" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <select value={selectedAccount} onChange={e => { setSelectedAccount(e.target.value); localStorage.setItem('ml_selected_account', e.target.value); setItems([]); setDetail(null); }} className="px-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary">
          {accounts.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          {accounts.length === 0 && <option value="">Carregando contas...</option>}
        </select>
        <button onClick={() => loadItems(0)} disabled={listLoading || !selectedAccount} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
          {listLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Carregar
        </button>
        {selectedPlatform === 'ml' && (
          <button
            onClick={() => setShowAICreator(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700"
          >
            <Sparkles className="w-4 h-4" />
            Criar com IA
          </button>
        )}
        <button onClick={() => { setShowCreate(!showCreate); setCreateMsg(''); }} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> Novo
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="Buscar SKU..." value={searchSku} onChange={e => setSearchSku(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && handleSearch()} className="pl-9 pr-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm w-40 focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <button onClick={handleSearch} disabled={searching} className="px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 disabled:opacity-50">
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Pesquisar'}
          </button>
        </div>
      </div>

      {/* Status Filters */}
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        {([
          { val: 'all' as StatusFilter, label: 'Todos' },
          { val: 'active' as StatusFilter, label: 'Ativos' },
          { val: 'paused' as StatusFilter, label: 'Pausados' },
          { val: 'closed' as StatusFilter, label: 'Inativos' },
        ]).map(f => (
          <button key={f.val} onClick={() => { setStatusFilter(f.val); loadItems(0, f.val); }} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${statusFilter === f.val ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            {f.label} {statusFilter === f.val && totalItems > 0 && <span className="ml-1 opacity-60">({totalItems})</span>}
          </button>
        ))}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-5 bg-card border border-emerald-500/30 rounded-xl p-5 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-foreground font-semibold flex items-center gap-2"><Plus className="w-4 h-4 text-emerald-400" /> Criar Novo Anúncio</h3>
            <button onClick={() => setShowCreate(false)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          {createMsg && <div className={`mb-4 px-4 py-2 rounded-lg text-sm font-medium ${createMsg.startsWith('✅') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{createMsg}</div>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div className="md:col-span-2">
              <label className="text-[10px] text-muted-foreground font-semibold uppercase flex justify-between">Título * <span className={newItem.title.length > 55 ? 'text-red-400' : ''}>{newItem.title.length}/60</span></label>
              <input maxLength={60} value={newItem.title} onChange={e => { setNewItem(n => ({ ...n, title: e.target.value })); if (e.target.value.length > 5) predictCategory(e.target.value); }} className="w-full mt-1 px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none" placeholder="Título do anúncio (max 60)" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase flex justify-between">SKU <span>{newItem.seller_sku.length}/50</span></label>
              <input maxLength={50} value={newItem.seller_sku} onChange={e => setNewItem(n => ({ ...n, seller_sku: e.target.value.toUpperCase() }))} className="w-full mt-1 px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none" placeholder="VIX-001" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase">Preço (R$) *</label>
              <input type="number" step="0.01" min="0" value={newItem.price} onChange={e => setNewItem(n => ({ ...n, price: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none" placeholder="79.90" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase">Quantidade</label>
              <input type="number" min="1" max="999999" value={newItem.quantity} onChange={e => setNewItem(n => ({ ...n, quantity: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none" />
            </div>
            <div className="relative">
              <label className="text-[10px] text-muted-foreground font-semibold uppercase flex items-center gap-1">Categoria * {catSearching && <Loader2 className="w-2.5 h-2.5 animate-spin" />}</label>
              <input value={newItem.category_id} onChange={e => setNewItem(n => ({ ...n, category_id: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none" placeholder="MLB12345" />
              <div className="mt-1 flex items-center gap-1">
                <input value={catSearchQuery} onChange={e => setCatSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchCategories(catSearchQuery)} className="flex-1 px-2 py-1 rounded bg-muted/70 text-foreground text-[11px] outline-none" placeholder="Buscar..." />
                <button onClick={() => searchCategories(catSearchQuery)} className="text-[10px] text-primary">🔍</button>
              </div>
              {categorySuggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-72 bg-card border border-border rounded-lg shadow-xl max-h-40 overflow-y-auto">
                  {categorySuggestions.map((cat, i) => (
                    <button key={i} onClick={() => { setNewItem(n => ({ ...n, category_id: cat.category_id })); setCategorySuggestions([]); }} className="w-full text-left px-3 py-2 text-xs hover:bg-muted border-b border-border/30 last:border-0">
                      <span className="font-medium text-foreground">{cat.category_name || cat.category_id}</span>
                      {cat.domain_name && <span className="text-muted-foreground ml-1">({cat.domain_name})</span>}
                      <span className="block text-[10px] text-primary font-mono">{cat.category_id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase">Condição</label>
              <select value={newItem.condition} onChange={e => setNewItem(n => ({ ...n, condition: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none">
                <option value="new">Novo</option><option value="used">Usado</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase">Tipo</label>
              <select value={newItem.listing_type} onChange={e => setNewItem(n => ({ ...n, listing_type: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none">
                <option value="gold_special">Clássico</option><option value="gold_pro">Premium</option><option value="free">Grátis</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase flex justify-between">Descrição <span>{newItem.description.length}/50000</span></label>
              <textarea maxLength={50000} value={newItem.description} onChange={e => setNewItem(n => ({ ...n, description: e.target.value }))} rows={3} className="w-full mt-1 px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none resize-y" placeholder="Descrição..." />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase">URLs Fotos (uma por linha)</label>
              <textarea value={newItem.picture_urls} onChange={e => setNewItem(n => ({ ...n, picture_urls: e.target.value }))} rows={3} className="w-full mt-1 px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none resize-y" placeholder="https://..." />
            </div>
          </div>
          <button onClick={handleCreate} disabled={creating} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {creating ? 'Criando...' : 'Criar Anúncio'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Items list */}
        <div className="bg-card border border-border rounded-xl p-4 animate-fade-in max-h-[calc(100vh-280px)] overflow-y-auto">
          <h3 className="text-foreground font-semibold text-sm mb-3">Anúncios {totalItems > 0 && <span className="text-muted-foreground font-normal">({items.length} de {totalItems})</span>}</h3>
          {listLoading && items.length === 0 && <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...</div>}
          {!listLoading && items.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">Clique em "Carregar" para listar</div>}
          <div className="space-y-1">
            {items.map(item => (
              <button key={item.id} onClick={() => loadDetail(item.id)} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-3 ${detail?.id === item.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground'}`}>
                {item.thumbnail ? <img src={item.thumbnail} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" /> : <div className="w-10 h-10 rounded bg-muted flex-shrink-0 flex items-center justify-center"><ImageIcon className="w-4 h-4 text-muted-foreground" /></div>}
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-xs">{item.title || item.id}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.seller_sku && <span className="font-mono text-[10px] opacity-70">{item.seller_sku}</span>}
                    <span className="text-[10px] font-semibold">R$ {item.price?.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <ItemStatusBadge status={item.status} subStatus={item.sub_status} />
                    <TypeBadge catalog={item.catalog_listing} logistic={item.logistic_type} />
                  </div>
                </div>
              </button>
            ))}
          </div>
          {totalItems > 50 && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
              <button onClick={() => loadItems(Math.max(0, currentOffset - 50))} disabled={currentOffset === 0 || listLoading} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronLeft className="w-3.5 h-3.5" /> Ant.</button>
              <span className="text-[10px] text-muted-foreground">{currentOffset + 1}–{Math.min(currentOffset + 50, totalItems)} de {totalItems}</span>
              <button onClick={() => loadItems(currentOffset + 50)} disabled={currentOffset + 50 >= totalItems || listLoading} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30">Próx. <ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>

        {/* Item detail */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 animate-fade-in max-h-[calc(100vh-280px)] overflow-y-auto">
          {detailLoading && <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...</div>}
          {!detailLoading && !detail && <div className="flex flex-col items-center justify-center py-20 text-muted-foreground"><FileText className="w-12 h-12 mb-3 opacity-30" /><p className="text-sm">Selecione um anúncio</p></div>}

          {!detailLoading && detail && (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-xs text-muted-foreground">{detail.id}</span>
                    <ItemStatusBadge status={detail.status} subStatus={detail.sub_status} />
                    {detail.catalog_listing && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400">CATÁLOGO</span>}
                    {detail.shipping?.logistic_type === 'fulfillment' && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400">FULL</span>}
                  </div>
                  {/* Sub-status warning */}
                  {detail.sub_status?.length > 0 && (
                    <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-xs text-orange-400">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Sub-status: <strong>{detail.sub_status.join(', ')}</strong> — Este anúncio pode ter restrições ou não ser visível no marketplace.</span>
                    </div>
                  )}
                  {/* Catalog suggestion */}
                  {detail.catalog_listing && (
                    <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-400">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Anúncio de <strong>catálogo</strong> — edição limitada pelo ML. Para modificar título/fotos, crie um anúncio <strong>tradicional</strong> usando o botão "Novo Anúncio" com os mesmos dados.</span>
                    </div>
                  )}
                  {!editMode ? <h3 className="text-base font-bold text-foreground">{detail.title}</h3> : (
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-1"><span>TÍTULO</span><span className={editFields.title?.length > 55 ? 'text-red-400' : ''}>{editFields.title?.length || 0}/60</span></div>
                      <input maxLength={60} value={editFields.title || ''} onChange={e => setEditFields(f => ({ ...f, title: e.target.value }))} className="text-base font-bold text-foreground bg-muted px-3 py-1.5 rounded-lg w-full outline-none" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!detail.catalog_listing && !editMode && (
                    <button onClick={startEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20"><Edit3 className="w-3.5 h-3.5" /> Editar</button>
                  )}
                  {editMode && (
                    <>
                      <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
                      </button>
                      <button onClick={() => { setEditMode(false); setSaveMsg(''); }} className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs">Cancelar</button>
                    </>
                  )}
                  <a href={detail.permalink} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" title="Ver no ML"><ExternalLink className="w-4 h-4" /></a>
                </div>
              </div>

              {saveMsg && <div className={`px-3 py-2 rounded-lg text-sm font-medium ${saveMsg.startsWith('✅') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{saveMsg}</div>}

              {/* Photos */}
              {detail.pictures?.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[10px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" /> Fotos ({detail.pictures.length})</h4>
                    {!detail.catalog_listing && (
                      <>
                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handlePhotoUpload(e.target.files[0]); }} />
                        <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary/20 disabled:opacity-50">
                          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Adicionar Foto
                        </button>
                      </>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <div className="w-48 h-48 rounded-xl overflow-hidden bg-muted flex-shrink-0 relative group">
                      <img src={detail.pictures[selectedPhoto]?.secure_url || detail.pictures[selectedPhoto]?.url} alt="" className="w-full h-full object-contain" />
                      {!detail.catalog_listing && detail.pictures?.length > 1 && (
                        <button onClick={handleDeletePhoto} disabled={uploading} className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 disabled:opacity-50" title="Apagar foto">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 content-start">
                      {detail.pictures.map((pic, i) => (
                        <button key={pic.id} onClick={() => setSelectedPhoto(i)} className={`w-11 h-11 rounded-lg overflow-hidden border-2 transition-colors ${i === selectedPhoto ? 'border-primary' : 'border-transparent hover:border-border'}`}>
                          <img src={pic.secure_url || pic.url} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Main editable fields */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase flex items-center gap-1"><DollarSign className="w-3 h-3" /> Preço</label>
                  {!editMode ? <p className="mt-1 text-foreground font-bold text-lg">R$ {detail.price?.toFixed(2)}</p> : (
                    <input type="number" step="0.01" value={editFields.price || ''} onChange={e => setEditFields(f => ({ ...f, price: e.target.value }))} className="mt-1 w-full px-3 py-1.5 rounded-lg bg-muted text-foreground font-bold text-lg outline-none" />
                  )}
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase flex items-center gap-1"><Package className="w-3 h-3" /> Estoque</label>
                  {!editMode ? <p className="mt-1 text-foreground font-bold text-lg">{detail.available_quantity}</p> : (
                    <input type="number" value={editFields.available_quantity || ''} onChange={e => setEditFields(f => ({ ...f, available_quantity: e.target.value }))} className="mt-1 w-full px-3 py-1.5 rounded-lg bg-muted text-foreground font-bold text-lg outline-none" />
                  )}
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase">Condição</label>
                  <p className="mt-1 text-foreground text-sm">{detail.condition === 'new' ? 'Novo' : 'Usado'}</p>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase flex items-center gap-1"><Truck className="w-3 h-3" /> Frete Grátis</label>
                  <p className="mt-1 text-foreground text-sm">{detail.shipping?.free_shipping ? 'Sim ✅' : 'Não'}</p>
                </div>
              </div>

              {/* Warranty & Video (editable) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase">Garantia</label>
                  {!editMode ? <p className="mt-1 text-foreground text-sm">{detail.warranty || '-'}</p> : (
                    <input maxLength={60} value={editFields.warranty || ''} onChange={e => setEditFields(f => ({ ...f, warranty: e.target.value }))} className="mt-1 w-full px-3 py-1.5 rounded-lg bg-muted text-foreground text-sm outline-none" placeholder="Ex: 12 meses de garantia" />
                  )}
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase">ID do Vídeo (YouTube)</label>
                  {!editMode ? <p className="mt-1 text-foreground text-sm">{detail.video_id || '-'}</p> : (
                    <input value={editFields.video_id || ''} onChange={e => setEditFields(f => ({ ...f, video_id: e.target.value }))} className="mt-1 w-full px-3 py-1.5 rounded-lg bg-muted text-foreground text-sm outline-none" placeholder="ID do YouTube" />
                  )}
                </div>
              </div>

              {/* Dimensions */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div><label className="text-[10px] text-muted-foreground font-semibold uppercase flex items-center gap-1"><Weight className="w-3 h-3" /> Peso</label><p className="mt-1 text-foreground text-sm">{detail.shipping?.dimensions ? `${(detail.shipping.dimensions.weight / 1000).toFixed(2)} kg` : '-'}</p></div>
                <div><label className="text-[10px] text-muted-foreground font-semibold uppercase"><Ruler className="w-3 h-3 inline" /> Altura</label><p className="mt-1 text-foreground text-sm">{detail.shipping?.dimensions?.height ? `${detail.shipping.dimensions.height} cm` : '-'}</p></div>
                <div><label className="text-[10px] text-muted-foreground font-semibold uppercase">Largura</label><p className="mt-1 text-foreground text-sm">{detail.shipping?.dimensions?.width ? `${detail.shipping.dimensions.width} cm` : '-'}</p></div>
                <div><label className="text-[10px] text-muted-foreground font-semibold uppercase">Comprimento</label><p className="mt-1 text-foreground text-sm">{detail.shipping?.dimensions?.length ? `${detail.shipping.dimensions.length} cm` : '-'}</p></div>
                <div><label className="text-[10px] text-muted-foreground font-semibold uppercase">Logística</label><p className="mt-1 text-foreground text-sm font-medium">{detail.shipping?.logistic_type === 'fulfillment' ? '🏭 Full' : detail.shipping?.logistic_type || '-'}</p></div>
              </div>

              {/* Extra info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><label className="text-[10px] text-muted-foreground font-semibold uppercase">Categoria</label><p className="mt-1 text-foreground">{detail.category_id}</p></div>
                <div><label className="text-[10px] text-muted-foreground font-semibold uppercase">Tipo Listagem</label><p className="mt-1 text-foreground">{detail.listing_type_id}</p></div>
                <div><label className="text-[10px] text-muted-foreground font-semibold uppercase">Criado em</label><p className="mt-1 text-foreground">{detail.date_created ? new Date(detail.date_created).toLocaleDateString('pt-BR') : '-'}</p></div>
                <div><label className="text-[10px] text-muted-foreground font-semibold uppercase">Tipo</label><p className="mt-1">{detail.catalog_listing ? <span className="text-purple-400 font-semibold">Catálogo</span> : <span className="text-foreground">Tradicional</span>}</p></div>
              </div>

              {/* Attributes */}
              {detail.attributes?.length > 0 && (
                <div>
                  <h4 className="text-[10px] text-muted-foreground font-semibold uppercase mb-2 flex items-center gap-1"><Tag className="w-3 h-3" /> Atributos ({detail.attributes.length})</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs">
                    {detail.attributes.filter(a => a.value_name).map((attr, i) => (
                      <div key={i} className="flex items-center gap-1 py-0.5">
                        <span className="text-muted-foreground whitespace-nowrap">{attr.name}:</span>
                        {editMode ? (
                          <input
                            type="text"
                            value={editAttributes[attr.id] ?? attr.value_name}
                            onChange={e => setEditAttributes(prev => ({ ...prev, [attr.id]: e.target.value }))}
                            className="flex-1 min-w-0 px-1.5 py-0.5 bg-muted border border-border rounded text-xs text-foreground"
                          />
                        ) : (
                          <span className="text-foreground font-medium">{attr.value_name}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Promotions */}
              {detail.promotions?.length > 0 && (
                <div>
                  <h4 className="text-[10px] text-muted-foreground font-semibold uppercase mb-2 flex items-center gap-1.5"><Megaphone className="w-3.5 h-3.5" /> Promoções ({detail.promotions.length})</h4>
                  <div className="space-y-1">
                    {detail.promotions.map((promo, i) => (
                      <div key={promo.id || i} className="flex items-center gap-3 px-3 py-1.5 bg-amber-500/5 border border-amber-500/10 rounded-lg text-xs">
                        <Star className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <span className="text-foreground font-medium flex-1">{promo.name || promo.type || 'Promoção'}</span>
                        {promo.deal_price && <span className="text-emerald-400 font-bold">R$ {promo.deal_price.toFixed(2)}</span>}
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${promo.status === 'started' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                          {promo.status === 'started' ? 'Ativa' : promo.status}
                        </span>
                        {promo.finish_date && <span className="text-muted-foreground">até {new Date(promo.finish_date).toLocaleDateString('pt-BR')}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="text-[10px] text-muted-foreground font-semibold uppercase flex items-center gap-1.5"><FileText className="w-3 h-3" /> Descrição {editMode && <span className="font-normal">{editFields.description?.length || 0}/50000</span>}</label>
                {!editMode ? (
                  <div className="mt-1 p-3 bg-muted/50 rounded-lg text-sm text-foreground whitespace-pre-wrap max-h-28 overflow-y-auto">
                    {detail.description_text || <span className="text-muted-foreground italic">Sem descrição</span>}
                  </div>
                ) : (
                  <textarea maxLength={50000} value={editFields.description || ''} onChange={e => setEditFields(f => ({ ...f, description: e.target.value }))} rows={4} className="mt-1 w-full p-3 rounded-lg bg-muted text-foreground text-sm outline-none resize-y" />
                )}
              </div>

              {/* Variations */}
              {detail.variations?.length > 0 && (
                <div>
                  <h4 className="text-[10px] text-muted-foreground font-semibold uppercase mb-2">Variações ({detail.variations.length})</h4>
                  <div className="bg-muted/30 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead><tr className="border-b border-border/50">
                        <th className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground">SKU</th>
                        <th className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground">Atributos</th>
                        <th className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground text-right">Preço</th>
                        <th className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground text-right">Estoque</th>
                      </tr></thead>
                      <tbody>
                        {detail.variations.map(v => {
                          const skuAttr = v.attribute_combinations?.find(a => a.id === 'SELLER_SKU');
                          const attrs = v.attribute_combinations?.filter(a => a.id !== 'SELLER_SKU') || [];
                          return (
                            <tr key={v.id} className="border-b border-border/30 hover:bg-muted/20">
                              <td className="px-3 py-1.5 font-mono text-xs">{skuAttr?.value_name || '-'}</td>
                              <td className="px-3 py-1.5 text-xs">{attrs.map(a => `${a.name}: ${a.value_name}`).join(' | ') || '-'}</td>
                              <td className="px-3 py-1.5 text-xs text-right font-semibold">R$ {v.price?.toFixed(2)}</td>
                              <td className="px-3 py-1.5 text-xs text-right">{v.available_quantity}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Changelog */}
              <div>
                <h4 className="text-[10px] text-muted-foreground font-semibold uppercase flex items-center gap-1.5 mb-2"><Clock className="w-3 h-3" /> Log de Alterações</h4>
                {changelog.length === 0 ? <p className="text-sm text-muted-foreground italic">Nenhuma alteração registrada</p> : (
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {changelog.map(log => (
                      <div key={log.id} className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-1 bg-muted/30 rounded-lg">
                        <span className="text-foreground font-semibold">{log.usuario}</span>
                        <span>→</span>
                        <span className="text-primary font-medium">{log.campo}</span>
                        {log.valor_anterior && <><span className="text-red-400 line-through">{log.valor_anterior.substring(0, 30)}</span></>}
                        <span className="text-emerald-400">{log.valor_novo.substring(0, 30)}</span>
                        <span className="ml-auto opacity-60 text-[10px]">{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <AIAdCreator
        open={showAICreator}
        onClose={() => setShowAICreator(false)}
        accountId={selectedAccount}
        accountName={accounts.find(a => a.id === selectedAccount)?.nome || ''}
        onPublish={(payload) => {
          setNewItem({
            title: payload.title,
            price: String(payload.price),
            quantity: '1',
            condition: 'new',
            listing_type: 'gold_special',
            category_id: payload.category_id,
            description: payload.description,
            picture_urls: '',
            seller_sku: payload.seller_sku,
          });
          setShowAICreator(false);
          setShowCreate(true);
        }}
      />
    </div>
  );
}
