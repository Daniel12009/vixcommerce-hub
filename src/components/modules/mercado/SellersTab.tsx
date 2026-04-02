import { useState, useMemo } from 'react';
import { Search, ExternalLink, Package, AlertCircle, Crown, TrendingUp, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { mlSearch, extractKeywordFromTitle, saveSearchSnapshot } from './mlSearch';

interface Props {
  myAccounts: any[];
  myItems: any[];
  mySellerIds: string[];
  loadingItems: boolean;
  callMarketData: (action: string, extra?: any) => Promise<any>;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active:   { label: 'Ativo',     color: 'text-emerald-400 bg-emerald-500/10' },
  paused:   { label: 'Pausado',   color: 'text-yellow-400 bg-yellow-500/10' },
  closed:   { label: 'Encerrado', color: 'text-red-400 bg-red-500/10' },
  inactive: { label: 'Inativo',   color: 'text-gray-400 bg-gray-500/10' },
};

function RankingPanel({ ranking, mySellerIds, keyword, onClose }: { ranking: any[]; mySellerIds: string[]; keyword: string; onClose: () => void }) {
  if (!ranking.length) {
    return (
      <div className="mt-3 border border-amber-500/30 bg-amber-500/5 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-amber-400 font-medium">
            ⚠ Nenhum resultado encontrado no ML para <em>"{keyword}"</em>.
            Tente a busca manual na aba "Busca de Ranking" com uma keyword mais simples.
          </p>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground ml-4 flex-shrink-0">Fechar</button>
        </div>
      </div>
    );
  }

  const myPositions = ranking.filter(r => r.is_mine);
  const lider = ranking[0];
  const totalVendas = ranking.reduce((s, r) => s + (r.vendas || 0), 0);
  const myVendas = myPositions.reduce((s, r) => s + (r.vendas || 0), 0);
  const myShare = totalVendas > 0 ? (myVendas / totalVendas * 100).toFixed(1) : '0';

  return (
    <div className="mt-3 border border-indigo-500/30 bg-indigo-500/5 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-indigo-500/20">
        <div className="flex items-center gap-4">
          {myPositions.length > 0 ? (
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Minha posição</p>
              <p className="text-xl font-bold text-indigo-400">#{myPositions[0].posicao}</p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-[10px] text-amber-400">⚠ Não aparece no top {ranking.length}</p>
            </div>
          )}
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">Meu share</p>
            <p className="text-xl font-bold text-foreground">{myShare}%</p>
          </div>
          {lider && (
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Líder</p>
              <p className="text-xs font-semibold text-amber-400 flex items-center gap-1"><Crown className="w-3 h-3" />{lider.seller_nick.slice(0, 18)}</p>
            </div>
          )}
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground text-left">Keyword usada</p>
            <p className="text-[10px] text-muted-foreground italic">"{keyword}"</p>
          </div>
        </div>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Fechar</button>
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-border/30">
        {ranking.slice(0, 30).map(item => (
          <div key={item.item_id} className={`flex items-center gap-3 px-4 py-2 text-xs ${item.is_mine ? 'bg-indigo-500/10' : ''}`}>
            <span className={`w-6 text-center font-bold flex-shrink-0 ${item.is_mine ? 'text-indigo-400' : 'text-muted-foreground'}`}>
              #{item.posicao}
            </span>
            {item.thumbnail && <img src={item.thumbnail.replace('http://', 'https://')} alt="" className="w-7 h-7 object-contain rounded flex-shrink-0" />}
            <span className={`flex-1 truncate ${item.is_mine ? 'font-semibold text-indigo-300' : 'text-foreground'}`} title={item.titulo}>{item.titulo}</span>
            <span className="text-muted-foreground flex-shrink-0">{item.seller_nick.slice(0, 15)}</span>
            <span className="font-semibold text-foreground flex-shrink-0">R$ {item.preco.toFixed(0)}</span>
            {item.free_shipping && <span className="text-emerald-400 flex-shrink-0">Grátis</span>}
            {item.permalink && <a href={item.permalink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-indigo-400 flex-shrink-0"><ExternalLink className="w-3 h-3" /></a>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SellersTab({ myAccounts, myItems, mySellerIds, loadingItems, callMarketData }: Props) {
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [rankingMap, setRankingMap] = useState<Record<string, any>>({});
  const [loadingRank, setLoadingRank] = useState<string | null>(null);
  const [openRanking, setOpenRanking] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null); // item to confirm deletion

  const filtered = useMemo(() => {
    return myItems.filter(item => {
      // Exclude ghost items (sub_status: deleted — visible via API but absent from ML panel)
      if (item.sub_status === 'deleted' || item.substatus === 'deleted') return false;
      const matchAccount = selectedAccount === 'all' || item.account_id === selectedAccount || item.conta === selectedAccount;
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      const q = search.toLowerCase();
      const matchSearch = !q || item.title?.toLowerCase().includes(q) || item.seller_sku?.toLowerCase().includes(q) || item.id?.toLowerCase().includes(q);
      return matchAccount && matchStatus && matchSearch;
    });
  }, [myItems, selectedAccount, statusFilter, search]);

  const countByAccount = useMemo(() => {
    const all = myItems.filter(i => statusFilter === 'all' || i.status === statusFilter);
    const counts: Record<string, number> = { all: all.length };
    myAccounts.forEach(acc => {
      counts[acc.id] = all.filter(i => i.account_id === acc.id).length;
    });
    return counts;
  }, [myItems, myAccounts, statusFilter]);

  const handleCheckRank = async (item: any) => {
    if (loadingRank) return;
    if (openRanking === item.id) { setOpenRanking(null); return; }
    if (rankingMap[item.id]) { setOpenRanking(item.id); return; }

    setLoadingRank(item.id);
    try {
      const keyword = extractKeywordFromTitle(item.title || '');
      if (!keyword) return toast.error('Produto sem título para buscar');
      const result = await mlSearch({ keyword, mySellerIds, maxPages: 3 });
      setRankingMap(prev => ({ ...prev, [item.id]: { ranking: result.ranking, keyword: result.used_keyword } }));
      setOpenRanking(item.id);
      // Save snapshot (fire-and-forget)
      saveSearchSnapshot(result);
    } catch (err: any) {
      toast.error('Erro ao buscar ranking: ' + err.message);
    } finally { setLoadingRank(null); }
  };

  const handleDeleteConfirmed = async () => {
    const item = confirmDelete;
    if (!item) return;
    setConfirmDelete(null);
    setDeletingId(item.id);
    try {
      const res = await callMarketData('close_item', { item_id: item.id, account_id: item.account_id });
      if (res?.error) throw new Error(res.error);
      const action = res?.method === 'deleted' ? 'excluído' : 'fechado';
      toast.success(`Anúncio ${action} com sucesso no ML.`);
      // Remove from local state (the list will refresh on next load)
      // Trigger parent reload if possible
    } catch (err: any) {
      toast.error(`Erro ao fechar anúncio: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  if (loadingItems) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-3" />
        Carregando produtos das contas ML…
      </div>
    );
  }

  if (myItems.length === 0) {
    return (
      <div className="text-center py-20">
        <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
        <h3 className="font-semibold text-foreground mb-1">Nenhum produto encontrado</h3>
        <p className="text-sm text-muted-foreground">Verifique se as contas ML estão configuradas em Configurações.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Account overview cards ─────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Minhas Contas ML</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {myAccounts.map(acc => {
            const accItems = myItems.filter(i => i.account_id === acc.id);
            const active  = accItems.filter(i => i.status === 'active').length;
            const paused  = accItems.filter(i => i.status === 'paused').length;
            const avgPrice = accItems.length
              ? (accItems.reduce((s, i) => s + (i.price || 0), 0) / accItems.length).toFixed(0)
              : '—';
            return (
              <div key={acc.id}
                className="bg-card border border-indigo-500/30 rounded-2xl p-4 cursor-pointer hover:border-indigo-400/60 transition-all"
                onClick={() => setSelectedAccount(prev => prev === acc.id ? 'all' : acc.id)}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {acc.nome[0].toUpperCase()}
                  </div>
                  <div className="overflow-hidden">
                    <p className="font-semibold text-foreground truncate">{acc.nome}</p>
                    {acc.seller_id && <p className="text-[10px] text-muted-foreground">ID: {acc.seller_id}</p>}
                  </div>
                  <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white flex-shrink-0">Minha Conta</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                    <p className="text-lg font-bold text-foreground">{accItems.length}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Ativos</p>
                    <p className="text-lg font-bold text-emerald-400">{active}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Pausados</p>
                    <p className="text-lg font-bold text-yellow-400">{paused}</p>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground text-center mt-2">Preço médio: R$ {avgPrice}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* ── Produtos ───────────────────────────────────────────── */}
      {/* Account filter tabs */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setSelectedAccount('all')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${selectedAccount === 'all' ? 'bg-indigo-600 text-white' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}>
          Todas <span className="ml-1 text-xs opacity-70">({countByAccount.all})</span>
        </button>
        {myAccounts.map(acc => (
          <button key={acc.id} onClick={() => setSelectedAccount(acc.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${selectedAccount === acc.id ? 'bg-indigo-600 text-white' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}>
            {acc.nome} <span className="ml-1 text-xs opacity-70">({countByAccount[acc.id] || 0})</span>
          </button>
        ))}
      </div>

      {/* Status + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por título, SKU ou ID…"
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-card border border-input text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['active', 'paused', 'all'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}>
              {s === 'all' ? 'Todos' : s === 'active' ? 'Ativos' : 'Pausados'}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} produto{filtered.length !== 1 ? 's' : ''}</p>

      {/* Product list */}
      <div className="space-y-2">
        {filtered.map(item => {
          const st = STATUS_LABEL[item.status] || { label: item.status, color: 'text-gray-400 bg-gray-500/10' };
          const isOpen = openRanking === item.id;
          const isLoading = loadingRank === item.id;
          const rankEntry = rankingMap[item.id];
          const ranking = rankEntry?.ranking || [];
          const myPos = ranking.find((r: any) => r.is_mine);

          return (
            <div key={item.id} className="border border-border rounded-xl overflow-hidden bg-card">
              <div className="flex items-center gap-3 p-3">
                {item.thumbnail && (
                  <img src={item.thumbnail.replace('http://', 'https://')} alt=""
                    className="w-14 h-14 object-contain rounded-lg bg-muted flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate" title={item.title}>{item.title}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                    <span className="text-xs text-foreground font-bold">R$ {(item.price || 0).toFixed(2)}</span>
                    <span className="text-[10px] text-muted-foreground">Estq: {item.available_quantity ?? '—'}</span>
                    {item.seller_sku && <span className="text-[10px] text-muted-foreground">SKU: {item.seller_sku}</span>}
                    <span className="text-[10px] text-muted-foreground">{item.conta}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* My position badge */}
                  {ranking.length > 0 && (
                    myPos ? (
                      <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-full">#{myPos.posicao}</span>
                    ) : (
                      <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full">Não aparece</span>
                    )
                  )}

                  {/* Check rank button */}
                  <button onClick={() => handleCheckRank(item)} disabled={isLoading}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isOpen ? 'bg-indigo-600 text-white' : 'bg-card border border-border text-muted-foreground hover:text-indigo-400 hover:border-indigo-400/50'}`}>
                    {isLoading ? (
                      <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <TrendingUp className="w-3 h-3" />
                    )}
                    {isLoading ? 'Buscando…' : isOpen ? 'Ocultar' : 'Ver Ranking'}
                  </button>

                  {item.permalink && (
                    <a href={item.permalink} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-indigo-400 hover:bg-indigo-500/10 transition-all">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}

                  {/* Trash — close/delete listing */}
                  <button
                    onClick={() => setConfirmDelete(item)}
                    disabled={deletingId === item.id}
                    title="Fechar anúncio no ML"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-40">
                    {deletingId === item.id
                      ? <div className="w-4 h-4 border border-red-400 border-t-transparent rounded-full animate-spin" />
                      : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>{/* end actions flex */}
              </div>{/* end row flex */}

              {isOpen && (
                <div className="px-3 pb-3">
                  <RankingPanel
                    ranking={rankingMap[item.id]?.ranking || []}
                    mySellerIds={mySellerIds}
                    keyword={rankingMap[item.id]?.keyword || ''}
                    onClose={() => setOpenRanking(null)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-10">
          <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
          <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>
        </div>
      )}

      {/* ── Confirmation dialog ─────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-card border border-red-500/30 rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Fechar anúncio?</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Esta ação fecha o anúncio no Mercado Livre</p>
              </div>
            </div>
            <p className="text-sm text-foreground mb-1 font-medium line-clamp-2">{confirmDelete.title}</p>
            <p className="text-xs text-muted-foreground mb-5">
              ⚠️ O anúncio será <strong>fechado</strong> no ML. Itens fechados podem ser reativados manualmente no painel do Mercado Livre, mas não estão visíveis para compradores.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
                Cancelar
              </button>
              <button onClick={handleDeleteConfirmed}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors">
                Sim, fechar anúncio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
