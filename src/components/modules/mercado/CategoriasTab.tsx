import { useState, useMemo } from 'react';
import { FolderOpen, ChevronDown, ChevronUp, ExternalLink, Search, TrendingUp, Crown } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  myItems: any[];
  mySellerIds: string[];
  loadingItems: boolean;
  callMarketData: (action: string, extra?: any) => Promise<any>;
}

function parseCatLabel(item: any): { id: string; label: string } {
  if (item.domain_id) {
    const slug = item.domain_id.replace(/^MLB-/, '').replace(/_/g, ' ').toLowerCase();
    return { id: item.domain_id, label: slug.charAt(0).toUpperCase() + slug.slice(1) };
  }
  if (item.category_id) return { id: item.category_id, label: `Categoria ${item.category_id}` };
  return { id: 'unknown', label: 'Sem categoria' };
}

function SharePanel({ result, mySellerIds }: { result: any; mySellerIds: string[] }) {
  const { ranking, my_positions, my_share, lider, total_vendas_top } = result;
  return (
    <div className="border-t border-border/50">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 px-5 py-3 bg-muted/10">
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Minha Pos.</p>
          <p className="text-2xl font-bold" style={{ color: my_positions?.length > 0 ? (my_positions[0].posicao <= 10 ? '#22c55e' : my_positions[0].posicao <= 30 ? '#f59e0b' : '#ef4444') : '#6b7280' }}>
            {my_positions?.length > 0 ? `#${my_positions[0].posicao}` : '—'}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Meu Share</p>
          <p className="text-2xl font-bold" style={{ color: (my_share || 0) >= 10 ? '#22c55e' : (my_share || 0) >= 3 ? '#f59e0b' : '#6b7280' }}>
            {my_share > 0 ? `${my_share}%` : '—'}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Líder</p>
          {lider ? <p className="text-xs font-semibold text-amber-400 flex items-center justify-center gap-1 mt-1"><Crown className="w-3 h-3" />{lider.seller_nick.slice(0, 18)}</p> : <p className="text-sm text-muted-foreground">—</p>}
        </div>
      </div>

      {my_positions?.length === 0 && (
        <div className="px-5 py-2 text-xs text-amber-500 bg-amber-500/10">
          ⚠ Seus anúncios não aparecem no top {ranking?.length || 50} desta categoria. Verifique títulos e keywords dos anúncios.
        </div>
      )}

      {/* Top 10 ranking */}
      <div className="max-h-60 overflow-y-auto divide-y divide-border/30">
        {(ranking || []).slice(0, 30).map((item: any) => (
          <div key={item.item_id} className={`flex items-center gap-3 px-5 py-2 text-xs ${item.is_mine ? 'bg-indigo-500/10' : ''}`}>
            <span className={`w-6 text-center font-bold flex-shrink-0 ${item.is_mine ? 'text-indigo-400' : 'text-muted-foreground'}`}>#{item.posicao}</span>
            {item.thumbnail && <img src={item.thumbnail.replace('http://', 'https://')} alt="" className="w-7 h-7 object-contain rounded flex-shrink-0" />}
            <span className={`flex-1 truncate ${item.is_mine ? 'font-semibold text-indigo-300' : 'text-foreground'}`} title={item.titulo}>{item.titulo}</span>
            <span className="text-muted-foreground flex-shrink-0">{item.seller_nick.slice(0, 14)}</span>
            <span className="font-semibold text-foreground flex-shrink-0">R$ {item.preco.toFixed(0)}</span>
            {item.permalink && (
              <a href={item.permalink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-indigo-400 flex-shrink-0"><ExternalLink className="w-3 h-3" /></a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CategoriasTab({ myItems, mySellerIds, loadingItems, callMarketData }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [shareMap, setShareMap] = useState<Record<string, any>>({});
  const [loadingShare, setLoadingShare] = useState<string | null>(null);

  const categorias = useMemo(() => {
    const map = new Map<string, { id: string; label: string; items: any[]; category_id?: string }>();
    myItems.filter(i => i.status === 'active').forEach(item => {
      const { id, label } = parseCatLabel(item);
      if (!map.has(id)) map.set(id, { id, label, items: [], category_id: item.category_id });
      map.get(id)!.items.push(item);
    });
    return [...map.values()].sort((a, b) => b.items.length - a.items.length);
  }, [myItems]);

  const filteredCats = useMemo(() =>
    categorias.filter(c => !search || c.label.toLowerCase().includes(search.toLowerCase()))
  , [categorias, search]);

  const handleCheckShare = async (cat: any) => {
    if (loadingShare) return;
    if (shareMap[cat.id]) {
      setExpanded(prev => prev === cat.id ? null : cat.id);
      return;
    }
    setLoadingShare(cat.id);
    setExpanded(cat.id);
    try {
      const fallbackCatId = cat.id !== 'unknown' ? cat.id : undefined;
      const result = await callMarketData('search_ranking', {
        keyword: '', // Empty keyword ensures we query the whole category
        category_id: cat.category_id || fallbackCatId,
        limit: 50,
        my_seller_ids: mySellerIds,
      });
      setShareMap(prev => ({ ...prev, [cat.id]: result }));
    } catch (err: any) {
      toast.error('Erro ao buscar share: ' + err.message);
      setExpanded(null);
    } finally { setLoadingShare(null); }
  };

  if (loadingItems) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-3" />
        Carregando categorias dos seus produtos…
      </div>
    );
  }

  if (myItems.length === 0) {
    return (
      <div className="text-center py-20">
        <FolderOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
        <h3 className="font-semibold text-foreground mb-1">Nenhum produto carregado</h3>
        <p className="text-sm text-muted-foreground">Aguarde o carregamento dos produtos na aba "Meus Produtos".</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {categorias.length} categoria{categorias.length !== 1 ? 's' : ''} dos seus produtos ativos
        </p>
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrar…"
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-card border border-input text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" />
        </div>
      </div>

      {filteredCats.map(cat => {
        const isExpanded = expanded === cat.id;
        const isLoading = loadingShare === cat.id;
        const shareResult = shareMap[cat.id];
        const accounts = [...new Set(cat.items.map(i => i.conta))];

        // Show quick position from share result if available
        const quickPos = shareResult?.my_positions?.[0]?.posicao;
        const quickShare = shareResult?.my_share;

        return (
          <div key={cat.id} className="border border-border rounded-2xl overflow-hidden bg-card">
            <div className="flex items-center gap-4 px-5 py-4">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                <FolderOpen className="w-4 h-4 text-indigo-400" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">{cat.label}</p>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  {cat.id !== 'unknown' && (
                    <span className="text-[10px] text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded">{cat.id}</span>
                  )}
                  {accounts.map(acc => <span key={acc} className="text-[10px] text-muted-foreground">{acc}</span>)}
                </div>
              </div>

              <div className="flex items-center gap-5 text-center flex-shrink-0">
                <div>
                  <p className="text-[10px] text-muted-foreground">Produtos</p>
                  <p className="text-lg font-bold text-foreground">{cat.items.length}</p>
                </div>
                {quickPos != null && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">Minha Pos.</p>
                    <p className="text-lg font-bold text-indigo-400">#{quickPos}</p>
                  </div>
                )}
                {quickShare != null && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">Share</p>
                    <p className="text-lg font-bold text-foreground">{quickShare}%</p>
                  </div>
                )}
                <button
                  onClick={() => handleCheckShare(cat)}
                  disabled={isLoading}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isExpanded && shareResult ? 'bg-indigo-600 text-white' : 'bg-card border border-border text-muted-foreground hover:text-indigo-400 hover:border-indigo-400/50'}`}
                >
                  {isLoading ? (
                    <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  ) : <TrendingUp className="w-3 h-3" />}
                  {isLoading ? 'Buscando…' : isExpanded && shareResult ? 'Ocultar' : 'Ver Share'}
                </button>
              </div>
            </div>

            {/* Share result panel */}
            {isExpanded && shareResult && (
              <SharePanel result={shareResult} mySellerIds={mySellerIds} />
            )}
          </div>
        );
      })}
    </div>
  );
}
