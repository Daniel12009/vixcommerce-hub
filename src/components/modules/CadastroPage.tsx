import { useState, useCallback } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Search, Loader2, ChevronLeft, ChevronRight, Save, ExternalLink,
  Image as ImageIcon, Edit3, Clock, Tag, Package, DollarSign, FileText,
  AlertCircle, CheckCircle, PauseCircle, XCircle, RefreshCw, Plus, X
} from 'lucide-react';

// ━━━ Types ━━━
interface MLItemSummary {
  id: string; title: string; price: number; thumbnail: string;
  available_quantity: number; status: string; seller_sku: string;
  skus: string[]; conta: string; account_id?: string;
}

interface MLItemDetail {
  id: string; title: string; price: number; available_quantity: number;
  status: string; condition: string; permalink: string;
  listing_type_id: string; date_created: string; category_id: string;
  pictures: { id: string; url: string; secure_url: string; size: string }[];
  variations: {
    id: number; price: number; available_quantity: number;
    picture_ids: string[];
    attribute_combinations: { id: string; name: string; value_name: string }[];
  }[];
  shipping: { logistic_type: string; free_shipping: boolean };
  seller_custom_field: string;
  description_text: string;
  conta: string;
}

interface ChangeLogEntry {
  id: string; item_id: string; campo: string; valor_anterior: string;
  valor_novo: string; usuario: string; created_at: string;
}

// ━━━ Helper: call ML Edge Function ━━━
async function callML(body: any) {
  const { data, error } = await supabase.functions.invoke('mercado-livre', { body });
  if (error) throw new Error(error.message || 'Edge Function error');
  return data;
}

// ━━━ Status badge ━━━
function ItemStatusBadge({ status }: { status: string }) {
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

// ━━━ Main Component ━━━
export function CadastroPage() {
  const { user } = useAuth();

  // ML accounts
  const [accounts, setAccounts] = useState<{ id: string; nome: string }[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [accountsLoaded, setAccountsLoaded] = useState(false);

  // Items list
  const [items, setItems] = useState<MLItemSummary[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [listLoading, setListLoading] = useState(false);

  // Search
  const [searchSku, setSearchSku] = useState('');
  const [searching, setSearching] = useState(false);

  // Item detail
  const [detail, setDetail] = useState<MLItemDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Editing
  const [editMode, setEditMode] = useState(false);
  const [editFields, setEditFields] = useState<{ title: string; price: string; available_quantity: string; description: string }>({ title: '', price: '', available_quantity: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Changelog
  const [changelog, setChangelog] = useState<ChangeLogEntry[]>([]);

  // Photo gallery
  const [selectedPhoto, setSelectedPhoto] = useState(0);

  // Create new item
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');
  const [newItem, setNewItem] = useState({
    title: '', price: '', quantity: '1', condition: 'new',
    listing_type: 'gold_special', category_id: '', description: '',
    picture_urls: '', seller_sku: '',
  });

  // Load accounts on first render
  const loadAccounts = useCallback(async () => {
    if (accountsLoaded) return;
    try {
      const data = await callML({ action: 'list_accounts' });
      setAccounts(data || []);
      if (data?.length > 0) setSelectedAccount(data[0].id);
      setAccountsLoaded(true);
    } catch (err: any) {
      console.error('Error loading accounts:', err);
    }
  }, [accountsLoaded]);

  // Don't await — just trigger on mount
  if (!accountsLoaded) loadAccounts();

  // List items for selected account
  const loadItems = useCallback(async (offset = 0) => {
    if (!selectedAccount) return;
    setListLoading(true);
    try {
      const data = await callML({ action: 'list_seller_items', account_id: selectedAccount, offset, limit: 20 });
      setItems(data.items || []);
      setTotalItems(data.total || 0);
      setCurrentOffset(offset);
    } catch (err: any) {
      console.error('Error loading items:', err);
    }
    setListLoading(false);
  }, [selectedAccount]);

  // Search by SKU
  const handleSearch = useCallback(async () => {
    if (!searchSku.trim()) { loadItems(0); return; }
    setSearching(true);
    setDetail(null);
    try {
      const data = await callML({
        action: 'search_items_by_sku',
        sku: searchSku.trim(),
        account_id: selectedAccount || undefined,
      });
      setItems(data.items || []);
      setTotalItems(data.items?.length || 0);
      setCurrentOffset(0);
    } catch (err: any) {
      console.error('Search error:', err);
    }
    setSearching(false);
  }, [searchSku, selectedAccount, loadItems]);

  // Load item detail
  const loadDetail = useCallback(async (itemId: string) => {
    setDetailLoading(true);
    setEditMode(false);
    setSaveMsg('');
    try {
      const data = await callML({
        action: 'get_item_detail',
        item_id: itemId,
        account_id: selectedAccount || undefined,
      });
      setDetail(data);
      setSelectedPhoto(0);

      // Load changelog
      const { data: logs } = await (supabase as any)
        .from('listing_changelog')
        .select('*')
        .eq('item_id', itemId)
        .order('created_at', { ascending: false })
        .limit(20);
      setChangelog(logs || []);
    } catch (err: any) {
      console.error('Detail error:', err);
    }
    setDetailLoading(false);
  }, [selectedAccount]);

  // Start editing
  const startEdit = () => {
    if (!detail) return;
    setEditFields({
      title: detail.title,
      price: String(detail.price),
      available_quantity: String(detail.available_quantity),
      description: detail.description_text,
    });
    setEditMode(true);
    setSaveMsg('');
  };

  // Save changes
  const handleSave = async () => {
    if (!detail || !user) return;
    setSaving(true);
    setSaveMsg('');

    try {
      const changes: { campo: string; anterior: string; novo: string }[] = [];
      const updateFields: any = {};

      if (editFields.title !== detail.title) {
        updateFields.title = editFields.title;
        changes.push({ campo: 'title', anterior: detail.title, novo: editFields.title });
      }
      if (Number(editFields.price) !== detail.price) {
        updateFields.price = Number(editFields.price);
        changes.push({ campo: 'price', anterior: String(detail.price), novo: editFields.price });
      }
      if (Number(editFields.available_quantity) !== detail.available_quantity) {
        updateFields.available_quantity = Number(editFields.available_quantity);
        changes.push({ campo: 'available_quantity', anterior: String(detail.available_quantity), novo: editFields.available_quantity });
      }

      // Update item fields
      if (Object.keys(updateFields).length > 0) {
        await callML({ action: 'update_item', item_id: detail.id, fields: updateFields, account_id: selectedAccount });
      }

      // Update description separately
      if (editFields.description !== detail.description_text) {
        await callML({ action: 'update_description', item_id: detail.id, description_text: editFields.description, account_id: selectedAccount });
        changes.push({ campo: 'description', anterior: '(alterado)', novo: '(alterado)' });
      }

      // Save changelog
      for (const c of changes) {
        await (supabase as any).from('listing_changelog').insert({
          item_id: detail.id,
          marketplace: 'ml',
          account_name: detail.conta || '',
          campo: c.campo,
          valor_anterior: c.anterior,
          valor_novo: c.novo,
          usuario: user.username,
        });
      }

      setSaveMsg(`✅ ${changes.length} campo(s) atualizado(s)!`);
      setEditMode(false);

      // Reload detail
      await loadDetail(detail.id);
    } catch (err: any) {
      setSaveMsg(`❌ Erro: ${err.message}`);
    }
    setSaving(false);
  };

  // Create new item handler
  const handleCreate = async () => {
    if (!newItem.title.trim() || !newItem.price || !newItem.category_id.trim()) {
      setCreateMsg('❌ Preencha título, preço e categoria.');
      return;
    }
    setCreating(true);
    setCreateMsg('');
    try {
      const pictures = newItem.picture_urls.split('\n').filter(u => u.trim()).map(u => ({ source: u.trim() }));
      const itemPayload: any = {
        title: newItem.title,
        price: Number(newItem.price),
        available_quantity: Number(newItem.quantity) || 1,
        condition: newItem.condition,
        listing_type_id: newItem.listing_type,
        category_id: newItem.category_id,
        currency_id: 'BRL',
        buying_mode: 'buy_it_now',
      };
      if (pictures.length > 0) itemPayload.pictures = pictures;
      if (newItem.seller_sku) itemPayload.seller_custom_field = newItem.seller_sku;

      const result = await callML({ action: 'create_item', new_item: itemPayload, account_id: selectedAccount });

      // Add description after creation
      if (newItem.description.trim() && result.id) {
        await callML({ action: 'update_description', item_id: result.id, description_text: newItem.description, account_id: selectedAccount });
      }

      // Log creation
      if (user && result.id) {
        await (supabase as any).from('listing_changelog').insert({
          item_id: result.id,
          marketplace: 'ml',
          account_name: accounts.find(a => a.id === selectedAccount)?.nome || '',
          campo: 'criação',
          valor_anterior: '',
          valor_novo: newItem.title,
          usuario: user.username,
        });
      }

      setCreateMsg(`✅ Anúncio criado! ID: ${result.id}`);
      setNewItem({ title: '', price: '', quantity: '1', condition: 'new', listing_type: 'gold_special', category_id: '', description: '', picture_urls: '', seller_sku: '' });

      // Reload list
      setTimeout(() => { loadItems(0); setShowCreate(false); setCreateMsg(''); }, 2000);
    } catch (err: any) {
      setCreateMsg(`❌ Erro: ${err.message}`);
    }
    setCreating(false);
  };

  return (
    <div>
      <PageHeader title="Ficha Técnica" subtitle="Gestão de Anúncios — Mercado Livre" />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Account selector */}
        <select
          value={selectedAccount}
          onChange={e => { setSelectedAccount(e.target.value); setItems([]); setDetail(null); }}
          className="px-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {accounts.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          {accounts.length === 0 && <option value="">Carregando contas...</option>}
        </select>

        <button
          onClick={() => loadItems(0)}
          disabled={listLoading || !selectedAccount}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {listLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Carregar Anúncios
        </button>

        <button
          onClick={() => { setShowCreate(!showCreate); setCreateMsg(''); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
        >
          <Plus className="w-4 h-4" />
          Novo Anúncio
        </button>

        <div className="flex-1" />

        {/* SKU search */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por SKU..."
              value={searchSku}
              onChange={e => setSearchSku(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="pl-9 pr-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm w-48 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching}
            className="px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 disabled:opacity-50"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Pesquisar'}
          </button>
        </div>
      </div>

      {/* Create new item form */}
      {showCreate && (
        <div className="mb-6 bg-card border border-emerald-500/30 rounded-xl p-5 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-foreground font-semibold flex items-center gap-2"><Plus className="w-4 h-4 text-emerald-400" /> Criar Novo Anúncio</h3>
            <button onClick={() => setShowCreate(false)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          {createMsg && (
            <div className={`mb-4 px-4 py-2 rounded-lg text-sm font-medium ${createMsg.startsWith('✅') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {createMsg}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div className="md:col-span-2">
              <label className="text-[10px] text-muted-foreground font-semibold uppercase">Título *</label>
              <input value={newItem.title} onChange={e => setNewItem(n => ({ ...n, title: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none" placeholder="Ex: Camiseta Básica Premium Algodão 100%" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase">SKU</label>
              <input value={newItem.seller_sku} onChange={e => setNewItem(n => ({ ...n, seller_sku: e.target.value.toUpperCase() }))} className="w-full mt-1 px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none" placeholder="VIX-001" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase">Preço (R$) *</label>
              <input type="number" step="0.01" value={newItem.price} onChange={e => setNewItem(n => ({ ...n, price: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none" placeholder="79.90" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase">Quantidade</label>
              <input type="number" value={newItem.quantity} onChange={e => setNewItem(n => ({ ...n, quantity: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase">Categoria ID *</label>
              <input value={newItem.category_id} onChange={e => setNewItem(n => ({ ...n, category_id: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none" placeholder="MLB12345" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase">Condição</label>
              <select value={newItem.condition} onChange={e => setNewItem(n => ({ ...n, condition: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none">
                <option value="new">Novo</option>
                <option value="used">Usado</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase">Tipo Listagem</label>
              <select value={newItem.listing_type} onChange={e => setNewItem(n => ({ ...n, listing_type: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none">
                <option value="gold_special">Clássico</option>
                <option value="gold_pro">Premium</option>
                <option value="gold">Ouro</option>
                <option value="silver">Prata</option>
                <option value="bronze">Bronze</option>
                <option value="free">Grátis</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase">Descrição</label>
              <textarea value={newItem.description} onChange={e => setNewItem(n => ({ ...n, description: e.target.value }))} rows={3} className="w-full mt-1 px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none resize-y" placeholder="Descrição detalhada do produto..." />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase">URLs das Fotos (uma por linha)</label>
              <textarea value={newItem.picture_urls} onChange={e => setNewItem(n => ({ ...n, picture_urls: e.target.value }))} rows={3} className="w-full mt-1 px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none resize-y" placeholder={"https://exemplo.com/foto1.jpg\nhttps://exemplo.com/foto2.jpg"} />
            </div>
          </div>
          <button onClick={handleCreate} disabled={creating} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {creating ? 'Criando...' : 'Criar Anúncio'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Items list */}
        <div className="bg-card border border-border rounded-xl p-4 animate-fade-in max-h-[calc(100vh-220px)] overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-foreground font-semibold text-sm">
              Anúncios {totalItems > 0 && <span className="text-muted-foreground font-normal">({totalItems})</span>}
            </h3>
          </div>

          {listLoading && items.length === 0 && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
            </div>
          )}

          {!listLoading && items.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Selecione uma conta e clique em "Carregar Anúncios"
            </div>
          )}

          <div className="space-y-1">
            {items.map(item => (
              <button
                key={item.id}
                onClick={() => loadDetail(item.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-3 ${
                  detail?.id === item.id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-foreground'
                }`}
              >
                {item.thumbnail && (
                  <img src={item.thumbnail} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-xs">{item.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {item.seller_sku && <span className="font-mono text-[10px] opacity-70">{item.seller_sku}</span>}
                    <span className="text-[10px] font-semibold">R$ {item.price?.toFixed(2)}</span>
                  </div>
                  <div className="mt-1">
                    <ItemStatusBadge status={item.status} />
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Pagination */}
          {totalItems > 20 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
              <button
                onClick={() => loadItems(Math.max(0, currentOffset - 20))}
                disabled={currentOffset === 0 || listLoading}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Anterior
              </button>
              <span className="text-[10px] text-muted-foreground">
                {currentOffset + 1}–{Math.min(currentOffset + 20, totalItems)} de {totalItems}
              </span>
              <button
                onClick={() => loadItems(currentOffset + 20)}
                disabled={currentOffset + 20 >= totalItems || listLoading}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                Próximo <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Item detail */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 animate-fade-in max-h-[calc(100vh-220px)] overflow-y-auto" style={{ animationDelay: '100ms' }}>
          {detailLoading && (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando detalhes...
            </div>
          )}

          {!detailLoading && !detail && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <FileText className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">Selecione um anúncio para ver os detalhes</p>
            </div>
          )}

          {!detailLoading && detail && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Tag className="w-4 h-4 text-primary" />
                    <span className="font-mono text-xs text-muted-foreground">{detail.id}</span>
                    <ItemStatusBadge status={detail.status} />
                  </div>
                  {!editMode ? (
                    <h3 className="text-lg font-bold text-foreground">{detail.title}</h3>
                  ) : (
                    <input
                      value={editFields.title}
                      onChange={e => setEditFields(f => ({ ...f, title: e.target.value }))}
                      className="text-lg font-bold text-foreground bg-muted px-3 py-1 rounded-lg w-full outline-none"
                    />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!editMode ? (
                    <button onClick={startEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20">
                      <Edit3 className="w-3.5 h-3.5" /> Editar
                    </button>
                  ) : (
                    <>
                      <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
                      </button>
                      <button onClick={() => { setEditMode(false); setSaveMsg(''); }} className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:text-foreground">
                        Cancelar
                      </button>
                    </>
                  )}
                  <a href={detail.permalink} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {saveMsg && (
                <div className={`px-4 py-2 rounded-lg text-sm font-medium ${saveMsg.startsWith('✅') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                  {saveMsg}
                </div>
              )}

              {/* Photo Gallery */}
              {detail.pictures?.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5" /> Fotos ({detail.pictures.length})
                  </h4>
                  <div className="flex gap-3">
                    {/* Main photo */}
                    <div className="w-64 h-64 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                      <img
                        src={detail.pictures[selectedPhoto]?.secure_url || detail.pictures[selectedPhoto]?.url}
                        alt="Produto"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    {/* Thumbnails */}
                    <div className="flex flex-wrap gap-2 content-start">
                      {detail.pictures.map((pic, i) => (
                        <button
                          key={pic.id}
                          onClick={() => setSelectedPhoto(i)}
                          className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors ${
                            i === selectedPhoto ? 'border-primary' : 'border-transparent hover:border-border'
                          }`}
                        >
                          <img src={pic.secure_url || pic.url} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Key fields */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1">
                    <DollarSign className="w-3 h-3" /> Preço
                  </label>
                  {!editMode ? (
                    <p className="mt-1 text-foreground font-bold text-lg">R$ {detail.price?.toFixed(2)}</p>
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      value={editFields.price}
                      onChange={e => setEditFields(f => ({ ...f, price: e.target.value }))}
                      className="mt-1 w-full px-3 py-1.5 rounded-lg bg-muted text-foreground font-bold text-lg outline-none"
                    />
                  )}
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1">
                    <Package className="w-3 h-3" /> Estoque
                  </label>
                  {!editMode ? (
                    <p className="mt-1 text-foreground font-bold text-lg">{detail.available_quantity}</p>
                  ) : (
                    <input
                      type="number"
                      value={editFields.available_quantity}
                      onChange={e => setEditFields(f => ({ ...f, available_quantity: e.target.value }))}
                      className="mt-1 w-full px-3 py-1.5 rounded-lg bg-muted text-foreground font-bold text-lg outline-none"
                    />
                  )}
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Condição</label>
                  <p className="mt-1 text-foreground text-sm">{detail.condition === 'new' ? 'Novo' : 'Usado'}</p>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Frete Grátis</label>
                  <p className="mt-1 text-foreground text-sm">{detail.shipping?.free_shipping ? 'Sim ✅' : 'Não'}</p>
                </div>
              </div>

              {/* Additional info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase">Categoria</label>
                  <p className="mt-1 text-foreground">{detail.category_id}</p>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase">Tipo Listagem</label>
                  <p className="mt-1 text-foreground">{detail.listing_type_id}</p>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase">Logística</label>
                  <p className="mt-1 text-foreground">{detail.shipping?.logistic_type || '-'}</p>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase">Criado em</label>
                  <p className="mt-1 text-foreground">{detail.date_created ? new Date(detail.date_created).toLocaleDateString('pt-BR') : '-'}</p>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-3 h-3" /> Descrição
                </label>
                {!editMode ? (
                  <div className="mt-2 p-3 bg-muted/50 rounded-lg text-sm text-foreground whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {detail.description_text || <span className="text-muted-foreground italic">Sem descrição</span>}
                  </div>
                ) : (
                  <textarea
                    value={editFields.description}
                    onChange={e => setEditFields(f => ({ ...f, description: e.target.value }))}
                    rows={6}
                    className="mt-2 w-full p-3 rounded-lg bg-muted text-foreground text-sm outline-none resize-y"
                  />
                )}
              </div>

              {/* Variations */}
              {detail.variations?.length > 0 && (
                <div>
                  <h4 className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">
                    Variações ({detail.variations.length})
                  </h4>
                  <div className="bg-muted/30 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="px-3 py-2 text-[10px] font-semibold text-muted-foreground">SKU</th>
                          <th className="px-3 py-2 text-[10px] font-semibold text-muted-foreground">Atributos</th>
                          <th className="px-3 py-2 text-[10px] font-semibold text-muted-foreground text-right">Preço</th>
                          <th className="px-3 py-2 text-[10px] font-semibold text-muted-foreground text-right">Estoque</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.variations.map(v => {
                          const skuAttr = v.attribute_combinations?.find(a => a.id === 'SELLER_SKU');
                          const attrs = v.attribute_combinations?.filter(a => a.id !== 'SELLER_SKU') || [];
                          return (
                            <tr key={v.id} className="border-b border-border/30 hover:bg-muted/20">
                              <td className="px-3 py-2 font-mono text-xs">{skuAttr?.value_name || '-'}</td>
                              <td className="px-3 py-2 text-xs">
                                {attrs.map(a => `${a.name}: ${a.value_name}`).join(' | ') || '-'}
                              </td>
                              <td className="px-3 py-2 text-xs text-right font-semibold">R$ {v.price?.toFixed(2)}</td>
                              <td className="px-3 py-2 text-xs text-right">{v.available_quantity}</td>
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
                <h4 className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <Clock className="w-3 h-3" /> Log de Alterações
                </h4>
                {changelog.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Nenhuma alteração registrada</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {changelog.map(log => (
                      <div key={log.id} className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-1.5 bg-muted/30 rounded-lg">
                        <span className="text-foreground font-semibold">{log.usuario}</span>
                        <span>alterou</span>
                        <span className="text-primary font-medium">{log.campo}</span>
                        <span>de</span>
                        <span className="text-red-400">{log.valor_anterior}</span>
                        <span>→</span>
                        <span className="text-emerald-400">{log.valor_novo}</span>
                        <span className="ml-auto opacity-60">{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
