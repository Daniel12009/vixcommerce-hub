/**
 * mlSearch — routes through the market-data edge function.
 * Browser cannot call api.mercadolibre.com directly (CORS).
 * saveSearchSnapshot persists results to market_snapshots for trend tracking.
 */
import { supabase } from '@/integrations/supabase/client';

// ---------------------------------------------------------------------------
// Keyword helpers
// ---------------------------------------------------------------------------

function normalizeKw(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // strip combining diacritics (ç→c, ã→a…)
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractKeywordFromTitle(title: string): string {
  const norm = normalizeKw(title);
  const words = norm.split(/\s+/).filter(w => w.length > 2);
  // Remove model codes (e.g. Fc133, V2, 220V, 12x) and pure numbers
  const clean = words.filter(w => !/^\d/.test(w) && !/^[A-Za-z]{1,3}\d/.test(w));
  // Use words 1–5; if first word is very likely a sub-category prefix, also try w/o it
  return clean.slice(0, 5).join(' ');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MLSearchResult {
  posicao:       number;
  item_id:       string;
  titulo:        string;
  preco:         number;
  seller_id:     string;
  seller_nick:   string;
  vendas:        number;
  thumbnail:     string;
  permalink:     string;
  free_shipping: boolean;
  listing_type:  string;
  is_mine:       boolean;
}

export interface MLSearchResponse {
  ranking:          MLSearchResult[];
  my_positions:     MLSearchResult[];
  lider:            MLSearchResult | null;
  total_results:    number;
  pages_searched:   number;
  my_share:         number;
  total_vendas_top: number;
  used_keyword:     string;
}

// ---------------------------------------------------------------------------
// mlSearch — calls edge function which proxies ML without CORS restrictions
// ---------------------------------------------------------------------------

export async function mlSearch({
  keyword = '',
  categoryId,
  mySellerIds = [],
  maxPages = 3,
}: {
  keyword?: string;
  categoryId?: string;
  mySellerIds?: string[];
  maxPages?: number;
}): Promise<MLSearchResponse> {
  const empty: MLSearchResponse = {
    ranking: [], my_positions: [], lider: null, total_results: 0,
    pages_searched: 0, my_share: 0, total_vendas_top: 0, used_keyword: normalizeKw(keyword),
  };

  try {
    const { data, error } = await supabase.functions.invoke('market-data', {
      body: {
        action: 'search_ranking',
        keyword: keyword || undefined,
        category_id: categoryId || undefined,
        my_seller_ids: mySellerIds,
        max_pages: maxPages,
      },
    });

    if (error) {
      console.warn('[mlSearch] edge function error:', error.message);
      return empty;
    }

    return data as MLSearchResponse;
  } catch (err) {
    console.warn('[mlSearch] unexpected error:', err);
    return empty;
  }
}

// ---------------------------------------------------------------------------
// saveSearchSnapshot — persists ranking to Supabase (fire-and-forget)
// ---------------------------------------------------------------------------

export async function saveSearchSnapshot(
  result: MLSearchResponse,
  categoryId?: string,
): Promise<void> {
  try {
    if (!result.ranking.length) return;

    const kw   = result.used_keyword;
    const nome = kw || categoryId || 'busca';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;

    // Find or create the market_segment for this keyword/category
    let segmentId: string | null = null;
    const { data: existing } = await db
      .from('market_segments')
      .select('id')
      .eq('tipo', categoryId ? 'categoria' : 'keyword')
      .eq(categoryId ? 'category_id' : 'keyword', categoryId || kw)
      .maybeSingle();

    if (existing?.id) {
      segmentId = existing.id;
    } else {
      const { data: created } = await db
        .from('market_segments')
        .insert({
          nome, tipo: categoryId ? 'categoria' : 'keyword',
          keyword: kw || null, category_id: categoryId || null,
          top_n: 50, ativo: true,
        })
        .select('id')
        .single();
      segmentId = created?.id || null;
    }

    if (!segmentId) return;

    const rows = result.ranking.map(r => ({
      segment_id:       segmentId,
      item_id:          r.item_id,
      seller_id:        r.seller_id,
      seller_nick:      r.seller_nick,
      titulo:           r.titulo,
      posicao:          r.posicao,
      preco:            r.preco,
      vendas_estimadas: r.vendas,
      free_shipping:    r.free_shipping,
      listing_type:     r.listing_type,
    }));

    await db.from('market_snapshots').insert(rows);
  } catch (err) {
    console.warn('[saveSearchSnapshot] silently failed:', err);
  }
}
