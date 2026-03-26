import { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Package, XCircle, CheckCircle, Loader2, RefreshCw,
  Search, ExternalLink, ImageIcon, DollarSign, Edit3,
  Save, Tag, AlertCircle, AlertTriangle, Filter, Trash2,
  PauseCircle, Eye, ChevronLeft, ChevronRight, Upload, X,
} from 'lucide-react';

// ━━━ Types (compatible with CadastroPage ML types) ━━━
interface ShopeeItemSummary {
  id: string; title: string; price: number; thumbnail: string;
  available_quantity: number; status: string; sub_status: string[];
  seller_sku: string; skus: string[]; conta: string;
}

interface ShopeeItemDetail {
  id: string; title: string; price: number; available_quantity: number;
  status: string; sub_status: string[]; condition: string; permalink: string;
  listing_type_id: string; date_created: string; category_id: string;
  pictures: { id: string; url: string; secure_url: string }[];
  variations: { id: number; price: number; available_quantity: number; picture_ids: string[]; attribute_combinations: { id: string; name: string; value_name: string }[] }[];
  shipping: { logistic_type: string; free_shipping: boolean };
  seller_custom_field: string; description_text: string; conta: string;
  tags: string[]; attributes: { id: string; name: string; value_name: string }[];
}

type StatusFilter = 'all' | 'active' | 'paused' | 'closed';

// ━━━ Helpers ━━━
async function callShopee(body: any) {
  const { data, error } = await supabase.functions.invoke('shopee', { body });
  if (error) throw new Error(error.message || 'Edge Function error');
  return data;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: any; label: string; cls: string }> = {
    active: { icon: CheckCircle, label: 'Ativo', cls: 'text-emerald-400 bg-emerald-400/10' },
    paused: { icon: PauseCircle, label: 'Oculto', cls: 'text-yellow-400 bg-yellow-400/10' },
    closed: { icon: XCircle, label: 'Banido/Excluído', cls: 'text-red-400 bg-red-400/10' },
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
export function ShopeeCadastroTab() {
  const { user } = useAuth();

  const [accounts, setAccounts] = useState<{ id: string; nome: string }[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [accountsLoaded, setAccountsLoaded] = useState(false);

  const [items, setItems] = useState<ShopeeItemSummary[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [searchSku, setSearchSku] = useState('');

  const [detail, setDetail] = useState<ShopeeItemDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState(0);

  // Load accounts
  useState(() => {
    (async () => {
      try {
        const data = await callShopee({ action: 'list_accounts' });
        setAccounts(data || []);
        if (data?.length > 0) setSelectedAccount(data[0].id);
        setAccountsLoaded(true);
      } catch (err: any) { console.error('Error loading Shopee accounts:', err); setAccountsLoaded(true); }
    })();
  });

  const loadItems = useCallback(async (offset = 0) => {
    if (!selectedAccount) return;
    setListLoading(true);
    try {
      const statusMap: Record<string, string> = { all: 'NORMAL', active: 'NORMAL', paused: 'UNLIST', closed: 'BANNED' };
      const data = await callShopee({ action: 'list_items', account_id: selectedAccount, offset, limit: 50, item_status: statusMap[statusFilter] || 'NORMAL' });
      setItems(data.items || []);
      setTotalItems(data.total || 0);
      setCurrentOffset(offset);
    } catch (err: any) { console.error('Error loading items:', err); }
    setListLoading(false);
  }, [selectedAccount, statusFilter]);

  const loadDetail = useCallback(async (itemId: string) => {
    setDetailLoading(true); setEditMode(false); setSaveMsg('');
    try {
      const data = await callShopee({ action: 'get_item_detail', item_id: itemId, account_id: selectedAccount });
      setDetail(data); setSelectedPhoto(0);
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
    });
    setEditMode(true); setSaveMsg('');
  };

  const handleSave = async () => {
    if (!detail || !user) return;
    setSaving(true); setSaveMsg('');
    try {
      const fields: any = {};
      if (editFields.title !== detail.title) fields.title = editFields.title;
      if (Number(editFields.price) !== detail.price) fields.price = editFields.price;
      if (Number(editFields.available_quantity) !== detail.available_quantity) fields.available_quantity = editFields.available_quantity;
      if (editFields.description !== detail.description_text) fields.description = editFields.description;

      if (Object.keys(fields).length === 0) { setSaveMsg('Nenhuma alteração detectada.'); setSaving(false); return; }

      const result = await callShopee({ action: 'update_item', item_id: detail.id, fields, account_id: selectedAccount });
      setSaveMsg(`✅ ${(result.results || []).join(', ')}`);
      setEditMode(false);
      await loadDetail(detail.id);
    } catch (err: any) { setSaveMsg(`❌ Erro: ${err.message}`); }
    setSaving(false);
  };

  const filteredItems = searchSku
    ? items.filter(i => i.seller_sku?.toUpperCase().includes(searchSku.toUpperCase()) || i.title.toUpperCase().includes(searchSku.toUpperCase()))
    : items;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <select value={selectedAccount} onChange={e => { setSelectedAccount(e.target.value); setItems([]); setDetail(null); }} className="px-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary">
          {accounts.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          {accounts.length === 0 && <option value="">Carregando contas...</option>}
        </select>
        <button onClick={() => loadItems(0)} disabled={listLoading || !selectedAccount} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#ee4d2d] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
          {listLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Carregar
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="Buscar SKU..." value={searchSku} onChange={e => setSearchSku(e.target.value.toUpperCase())} className="pl-9 pr-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm w-40 focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
        </div>
      </div>

      {/* Status Filters */}
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        {([
          { val: 'all' as StatusFilter, label: 'Todos' },
          { val: 'active' as StatusFilter, label: 'Ativos' },
          { val: 'paused' as StatusFilter, label: 'Ocultos' },
          { val: 'closed' as StatusFilter, label: 'Banidos' },
        ]).map(f => (
          <button key={f.val} onClick={() => { setStatusFilter(f.val); }} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${statusFilter === f.val ? 'bg-[#ee4d2d] text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* List + Detail Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ━━━ LEFT: Item List ━━━ */}
        <div className="lg:col-span-1 bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-border bg-muted/30">
            <span className="text-xs font-semibold text-foreground">Anúncios</span>
            {totalItems > 0 && <span className="text-[10px] text-muted-foreground ml-2">({totalItems})</span>}
          </div>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-border">
            {filteredItems.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {listLoading ? 'Carregando...' :  'Clique em "Carregar" para listar'}
              </div>
            )}
            {filteredItems.map(item => (
              <button
                key={item.id}
                onClick={() => loadDetail(item.id)}
                className={`w-full text-left px-3 py-2.5 hover:bg-muted/40 transition-colors flex items-start gap-3 ${detail?.id === item.id ? 'bg-muted/50 border-l-2 border-[#ee4d2d]' : ''}`}
              >
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" loading="lazy" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0"><ImageIcon className="w-5 h-5 text-muted-foreground" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{item.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono text-[#ee4d2d] font-semibold">R$ {item.price?.toFixed(2)}</span>
                    <span className="text-[10px] text-muted-foreground">Qtd: {item.available_quantity}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  {item.seller_sku && <p className="text-[9px] font-mono text-muted-foreground mt-0.5">SKU: {item.seller_sku}</p>}
                </div>
              </button>
            ))}
          </div>
          {/* Pagination */}
          {totalItems > 50 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted/20">
              <button onClick={() => loadItems(Math.max(0, currentOffset - 50))} disabled={currentOffset === 0} className="text-xs text-primary disabled:opacity-30">
                <ChevronLeft className="w-4 h-4 inline" /> Anterior
              </button>
              <span className="text-[10px] text-muted-foreground">{currentOffset + 1}–{Math.min(currentOffset + 50, totalItems)} de {totalItems}</span>
              <button onClick={() => loadItems(currentOffset + 50)} disabled={currentOffset + 50 >= totalItems} className="text-xs text-primary disabled:opacity-30">
                Próximo <ChevronRight className="w-4 h-4 inline" />
              </button>
            </div>
          )}
        </div>

        {/* ━━━ RIGHT: Detail Panel ━━━ */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          {detailLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#ee4d2d]" /></div>
          ) : !detail ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Package className="w-10 h-10 text-muted-foreground opacity-40 mb-3" />
              <p className="text-sm text-muted-foreground">Selecione um anúncio</p>
            </div>
          ) : (
            <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge status={detail.status} />
                    <span className="text-[10px] font-mono text-muted-foreground">ID: {detail.id}</span>
                  </div>
                  {editMode ? (
                    <textarea value={editFields.title} onChange={e => setEditFields(f => ({ ...f, title: e.target.value }))} className="w-full text-foreground text-sm font-semibold bg-muted rounded-lg px-3 py-2 outline-none resize-none" rows={2} />
                  ) : (
                    <h3 className="text-foreground font-semibold text-sm">{detail.title}</h3>
                  )}
                </div>
                <div className="flex gap-1.5">
                  {!editMode ? (
                    <button onClick={startEdit} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#ee4d2d]/10 text-[#ee4d2d] text-xs font-medium hover:bg-[#ee4d2d]/20">
                      <Edit3 className="w-3.5 h-3.5" /> Editar
                    </button>
                  ) : (
                    <>
                      <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#ee4d2d] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
                      </button>
                      <button onClick={() => setEditMode(false)} className="px-2 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {saveMsg && <div className={`px-3 py-2 rounded-lg text-xs font-medium ${saveMsg.startsWith('✅') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{saveMsg}</div>}

              {/* Photos */}
              {detail.pictures?.length > 0 && (
                <div>
                  <div className="relative w-full aspect-square max-w-xs rounded-xl overflow-hidden border border-border bg-muted/30">
                    <img src={detail.pictures[selectedPhoto]?.secure_url || detail.pictures[selectedPhoto]?.url} alt="" className="w-full h-full object-contain" />
                    {detail.pictures.length > 1 && (
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                        {detail.pictures.map((_, i) => (
                          <button key={i} onClick={() => setSelectedPhoto(i)} className={`w-2 h-2 rounded-full transition-all ${selectedPhoto === i ? 'bg-[#ee4d2d] scale-125' : 'bg-white/60'}`} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5 mt-2 overflow-x-auto">
                    {detail.pictures.map((pic, i) => (
                      <button key={i} onClick={() => setSelectedPhoto(i)} className={`w-12 h-12 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-all ${selectedPhoto === i ? 'border-[#ee4d2d]' : 'border-transparent opacity-60 hover:opacity-80'}`}>
                        <img src={pic.secure_url || pic.url} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Prices & Stock */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-muted/30 rounded-lg p-3">
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase flex items-center gap-1"><DollarSign className="w-3 h-3" />Preço</label>
                  {editMode ? (
                    <input type="number" step="0.01" value={editFields.price} onChange={e => setEditFields(f => ({ ...f, price: e.target.value }))} className="w-full mt-1 px-2 py-1.5 rounded bg-card border border-border text-foreground text-sm outline-none" />
                  ) : (
                    <p className="text-foreground font-bold text-lg mt-1">R$ {detail.price?.toFixed(2)}</p>
                  )}
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase flex items-center gap-1"><Package className="w-3 h-3" />Estoque</label>
                  {editMode ? (
                    <input type="number" min={0} value={editFields.available_quantity} onChange={e => setEditFields(f => ({ ...f, available_quantity: e.target.value }))} className="w-full mt-1 px-2 py-1.5 rounded bg-card border border-border text-foreground text-sm outline-none" />
                  ) : (
                    <p className="text-foreground font-bold text-lg mt-1">{detail.available_quantity}</p>
                  )}
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase flex items-center gap-1"><Tag className="w-3 h-3" />SKU</label>
                  <p className="text-foreground font-mono text-sm mt-1">{detail.seller_custom_field || '—'}</p>
                </div>
              </div>

              {/* Description */}
              <div className="bg-muted/30 rounded-lg p-3">
                <label className="text-[10px] text-muted-foreground font-semibold uppercase mb-1 block">Descrição</label>
                {editMode ? (
                  <textarea value={editFields.description} onChange={e => setEditFields(f => ({ ...f, description: e.target.value }))} className="w-full min-h-[120px] px-2 py-1.5 rounded bg-card border border-border text-foreground text-sm outline-none resize-y" />
                ) : (
                  <p className="text-foreground text-xs whitespace-pre-wrap max-h-[200px] overflow-y-auto">{detail.description_text || 'Sem descrição.'}</p>
                )}
              </div>

              {/* Variations */}
              {detail.variations?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-foreground mb-2">Variações ({detail.variations.length})</h4>
                  <div className="space-y-1.5">
                    {detail.variations.map((v, i) => (
                      <div key={v.id || i} className="flex items-center gap-3 bg-muted/20 rounded-lg px-3 py-2 text-xs">
                        <span className="text-muted-foreground">#{i + 1}</span>
                        <span className="font-mono text-foreground">R$ {v.price?.toFixed(2)}</span>
                        <span className="text-muted-foreground">Qtd: {v.available_quantity}</span>
                        {v.attribute_combinations?.map((ac, j) => (
                          <span key={j} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">{ac.name}: {ac.value_name}</span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Attributes */}
              {detail.attributes?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-foreground mb-2">Atributos</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {detail.attributes.map((attr, i) => (
                      <div key={i} className="bg-muted/20 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-muted-foreground font-medium">{attr.name}</p>
                        <p className="text-xs text-foreground mt-0.5">{attr.value_name || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
