/**
 * mlSearch — calls ML public search API directly from the browser.
 * ML's public API supports CORS, so no edge function needed.
 * Paginates up to maxPages to find the user's real position.
 * saveSearchSnapshot persists results to market_snapshots for trend tracking.
 */
import { supabase } from '@/integrations/supabase/client';

const PAGE_SIZE = 50;

function normalizeKw(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // strip combining diacritics
    .replace(/[^a-zA-Z0-9\s]/g, ' ')   // remove remaining non-alphanumeric
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractKeywordFromTitle(title: string): string {
  const norm = normalizeKw(title);
  const words = norm.split(/\s+/).filter(w => w.length > 2);
  // Remove common noise and model codes (e.g. Fc133, V2, 220V, 12x)
  const clean = words.filter(w => !/^\d/.test(w) && !/^[A-Za-z]{1,3}\d/.test(w));
  return clean.slice(0, 5).join(' ');
}

interface MLSearchResult {
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

interface MLSearchResponse {
  ranking:          MLSearchResult[];
  my_positions:     MLSearchResult[];
  lider:            MLSearchResult | null;
  total_results:    number;
  pages_searched:   number;
  my_share:         number;
  total_vendas_top: number;
  used_keyword:     string;
}

async function fetchPage(kw: string, catId: string | undefined, offset: number): Promise<{ items: any[]; total: number } | null> {
  try {
    let url = `https://api.mercadolibre.com/sites/MLB/search?sort=sold_quantity_desc&limit=${PAGE_SIZE}&offset=${offset}`;
    if (kw) url += `&q=${encodeURIComponent(kw)}`;
    if (catId) url += `&category=${catId}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const d = await res.json();
    return { items: d.results || [], total: d.paging?.total || 0 };
  } catch { return null; }
}

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
  const kwNorm  = normalizeKw(keyword);
  const kwShort = kwNorm.split(' ').slice(0, 4).join(' ');

  let usedKw = '';
  let firstPage: { items: any[]; total: number } | null = null;

  // Try normalized full, then short 4 words, then raw
  for (const kw of [kwNorm, kwShort, keyword].filter(Boolean)) {
    const page = await fetchPage(kw, categoryId, 0);
    if (page && page.items.length > 0) {
      firstPage = page;
      usedKw = kw;
      break;
    }
  }

  const empty: MLSearchResponse = {
    ranking: [], my_positions: [], lider: null, total_results: 0,
    pages_searched: 0, my_share: 0, total_vendas_top: 0, used_keyword: kwNorm,
  };
  if (!firstPage) return empty;

  const totalAvailable = firstPage.total;
  const allResults: any[] = [...firstPage.items];

  // Paginate until my product found or maxPages reached
  let myFound = firstPage.items.some(r => mySellerIds.includes(String(r.seller?.id || '')));
  const pagesNeeded = Math.min(maxPages, Math.ceil(totalAvailable / PAGE_SIZE));

  for (let page = 1; page < pagesNeeded && !myFound; page++) {
    const p = await fetchPage(usedKw, categoryId, page * PAGE_SIZE);
    if (!p || !p.items.length) break;
    allResults.push(...p.items);
    myFound = p.items.some(r => mySellerIds.includes(String(r.seller?.id || '')));
  }

  // Map to ranked items
  const allRanked: MLSearchResult[] = allResults.map((item, idx) => {
    const sellerId = String(item.seller?.id || '');
    return {
      posicao:       idx + 1,
      item_id:       item.id,
      titulo:        item.title || '',
      preco:         item.price || 0,
      seller_id:     sellerId,
      seller_nick:   item.seller?.nickname || '',
      vendas:        item.sold_quantity || 0,
      thumbnail:     item.thumbnail || '',
      permalink:     item.permalink || '',
      free_shipping: item.shipping?.free_shipping || false,
      listing_type:  item.listing_type_id || '',
      is_mine:       mySellerIds.includes(sellerId),
    };
  });

  const top50 = allRanked.slice(0, 50);
  const myPositions = allRanked.filter(r => r.is_mine);
  const totalVendas = top50.reduce((s, r) => s + r.vendas, 0);
  const myVendasTop = top50.filter(r => r.is_mine).reduce((s, r) => s + r.vendas, 0);
  const myShare = totalVendas > 0 ? Math.round(myVendasTop / totalVendas * 1000) / 10 : 0;

  return {
    ranking:          top50,
    my_positions:     myPositions,
    lider:            top50[0] || null,
    total_results:    totalAvailable,
    pages_searched:   Math.ceil(allResults.length / PAGE_SIZE),
    my_share:         myShare,
    total_vendas_top: totalVendas,
    used_keyword:     usedKw,
  };
}

/**
 * saveSearchSnapshot — persists a mlSearch result to Supabase.
 * - Upserts a market_segment row for the keyword (or reuses existing)
 * - Bulk-inserts all ranked items into market_snapshots
 * Fire-and-forget: call without await so it never blocks the UI.
 */
export async function saveSearchSnapshot(
  result: MLSearchResponse,
  categoryId?: string,
): Promise<void> {
  try {
    const kw   = result.used_keyword;
    const nome = kw || categoryId || 'busca';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;

    // 1. Find or create the market_segment for this keyword/category
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
        .insert({ nome, tipo: categoryId ? 'categoria' : 'keyword', keyword: kw || null, category_id: categoryId || null, top_n: 50, ativo: true })
        .select('id')
        .single();
      segmentId = created?.id || null;
    }

    if (!segmentId || !result.ranking.length) return;

    // 2. Bulk-insert all ranked items as snapshots
    const rows = result.ranking.map(r => ({
      segment_id:        segmentId,
      item_id:           r.item_id,
      seller_id:         r.seller_id,
      seller_nick:       r.seller_nick,
      titulo:            r.titulo,
      posicao:           r.posicao,
      preco:             r.preco,
      vendas_estimadas:  r.vendas,
      free_shipping:     r.free_shipping,
      listing_type:      r.listing_type,
    }));

    await db.from('market_snapshots').insert(rows);
  } catch (err) {
    console.warn('[saveSearchSnapshot] failed silently:', err);
  }
}
