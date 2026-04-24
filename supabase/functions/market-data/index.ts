import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function sb() {
  return createClient(
    (Deno.env.get('EXTERNAL_DB_URL') || Deno.env.get('SUPABASE_URL'))!,
    (Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { action, segment_id, ...rest } = body;
    const client = sb();

    // ── list_sellers ─────────────────────────────────────────────────────────
    if (action === 'list_sellers') {
      const { data: sellers, error } = await client
        .from('market_sellers')
        .select('*')
        .order('is_minha_conta', { ascending: false })
        .order('criado_em');
      if (error) throw error;

      // Attach last snapshot to each seller
      const sellersWithSnap = await Promise.all((sellers || []).map(async (s: any) => {
        const { data: snap } = await client
          .from('seller_snapshots')
          .select('*')
          .eq('seller_id_ref', s.id)
          .order('coletado_em', { ascending: false })
          .limit(1)
          .single();
        return { ...s, ultimo_snapshot: snap || null };
      }));

      return ok(sellersWithSnap);
    }

    // ── list_segments ─────────────────────────────────────────────────────────
    if (action === 'list_segments') {
      const { data: segments, error } = await client
        .from('market_segments')
        .select('*')
        .order('ativo', { ascending: false })
        .order('nome');
      if (error) throw error;

      // For each segment, get the latest snapshot stats
      const enriched = await Promise.all((segments || []).map(async (seg: any) => {
        // Get latest snapshot batch (last coletado_em)
        const { data: latest } = await client
          .from('market_snapshots')
          .select('posicao, preco, seller_id, seller_nick, vendas_estimadas, coletado_em')
          .eq('segment_id', seg.id)
          .order('coletado_em', { ascending: false })
          .order('posicao')
          .limit(50);

        if (!latest?.length) return { ...seg, snapshots: [], ultima_coleta: null, lider: null, total_items: 0 };

        // Group by the latest coletado_em
        const latestTs = latest[0].coletado_em;
        const currentSnaps = latest.filter((s: any) => s.coletado_em === latestTs);
        const totalVendas = currentSnaps.reduce((s: number, x: any) => s + (x.vendas_estimadas || 0), 0);

        return {
          ...seg,
          snapshots: currentSnaps.slice(0, 10),
          ultima_coleta: latestTs,
          lider: currentSnaps[0] || null,
          total_items: currentSnaps.length,
          total_vendas_top: totalVendas,
        };
      }));

      return ok(enriched);
    }

    // ── get_history ───────────────────────────────────────────────────────────
    if (action === 'get_history') {
      if (!segment_id) throw new Error('segment_id required');
      const days = rest.days || 30;
      const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

      const { data, error } = await client
        .from('market_snapshots')
        .select('*')
        .eq('segment_id', segment_id)
        .gte('coletado_em', cutoff)
        .order('coletado_em', { ascending: false })
        .order('posicao');
      if (error) throw error;

      return ok(data || []);
    }

    // ── add_segment ───────────────────────────────────────────────────────────
    if (action === 'add_segment') {
      const { nome, tipo, category_id, keyword, top_n } = rest;
      if (!nome) throw new Error('nome required');
      const { data, error } = await client.from('market_segments').insert({
        nome, tipo: tipo || 'keyword', category_id: category_id || null,
        keyword: keyword || null, top_n: top_n || 50, ativo: true,
      }).select().single();
      if (error) throw error;
      return ok(data);
    }

    // ── toggle_segment ────────────────────────────────────────────────────────
    if (action === 'toggle_segment') {
      if (!segment_id) throw new Error('segment_id required');
      const { data, error } = await client
        .from('market_segments')
        .update({ ativo: rest.ativo })
        .eq('id', segment_id)
        .select().single();
      if (error) throw error;
      return ok(data);
    }

    // ── add_seller ────────────────────────────────────────────────────────────
    if (action === 'add_seller') {
      const { seller_id, nickname, nome_interno, cor, is_minha_conta } = rest;
      if (!seller_id) throw new Error('seller_id required');
      const { data, error } = await client.from('market_sellers').upsert({
        seller_id, nickname: nickname || null, nome_interno: nome_interno || null,
        cor: cor || '#f97316', is_minha_conta: is_minha_conta || false, ativo: true,
      }, { onConflict: 'seller_id' }).select().single();
      if (error) throw error;
      return ok(data);
    }

    // ── delete_seller ─────────────────────────────────────────────────────────
    if (action === 'delete_seller') {
      const { id } = rest;
      if (!id) throw new Error('id required');
      const { error } = await client.from('market_sellers').delete().eq('id', id);
      if (error) throw error;
      return ok({ deleted: true });
    }

    // ── run_collector ─────────────────────────────────────────────────────────
    if (action === 'run_collector') {
      const res = await fetch(
        `${(Deno.env.get('EXTERNAL_DB_URL') || Deno.env.get('SUPABASE_URL'))}/functions/v1/market-collector`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${Deno.env.get('SUPABASE_ANON_KEY') || (Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!}`,
          },
          body: '{}',
        }
      );
      const result = await res.json();
      return ok(result);
    }

    // ── get_my_accounts ───────────────────────────────────────────────────────
    if (action === 'get_my_accounts') {
      const { data, error } = await client
        .from('ml_accounts')
        .select('id, nome, seller_id')
        .eq('ativo', true);
      if (error) throw error;
      return ok(data || []);
    }

    // ── ping_ml — diagnostic: raw ML API test ─────────────────────────────────
    if (action === 'ping_ml') {
      const { keyword = 'torneira', limit = 3 } = rest;
      const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(keyword)}&limit=${limit}`;
      try {
        const res = await fetch(url);
        const text = await res.text();
        let body: any;
        try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
        return ok({ status: res.status, ok: res.ok, url, body_preview: text.slice(0, 400), results_count: body?.results?.length ?? null, total: body?.paging?.total ?? null });
      } catch (err: any) {
        return ok({ error: err.message, url });
      }
    }

    if (action === 'search_ranking') {
      const { keyword, category_id, my_seller_ids = [], max_pages = 3 } = rest;
      if (!keyword && !category_id) throw new Error('keyword or category_id required');

      // Load accounts with full token info for refresh capability
      const { data: accs } = await client
        .from('ml_accounts')
        .select('id, seller_id, access_token, refresh_token, token_expires_at, client_id, client_secret')
        .eq('ativo', true);

      let sellerIds: string[] = my_seller_ids;
      if (!sellerIds.length) {
        sellerIds = (accs || []).map((a: any) => String(a.seller_id)).filter(Boolean);
      }

      // Get a fresh ML access token (auto-refresh if expired like mercado-livre edge fn)
      const getToken = async (): Promise<string | undefined> => {
        const acc = (accs || []).find((a: any) => a.refresh_token || a.access_token);
        if (!acc) return undefined;
        try {
          // Refresh if expired or expiring in next 5 min
          const expiry = acc.token_expires_at ? new Date(acc.token_expires_at) : null;
          const needsRefresh = !expiry || expiry < new Date(Date.now() + 5 * 60 * 1000);
          if (needsRefresh && acc.refresh_token && acc.client_id && acc.client_secret) {
            const res = await fetch('https://api.mercadolibre.com/oauth/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: acc.client_id,
                client_secret: acc.client_secret,
                refresh_token: acc.refresh_token,
              }),
            });
            if (res.ok) {
              const d = await res.json();
              // Update token in DB (best-effort)
              await client.from('ml_accounts').update({
                access_token: d.access_token,
                refresh_token: d.refresh_token,
                token_expires_at: new Date(Date.now() + d.expires_in * 1000).toISOString(),
              }).eq('id', acc.id);
              console.log(`[search_ranking] token refreshed for account ${acc.id}`);
              return d.access_token;
            }
            console.warn('[search_ranking] token refresh failed, falling back to stored token');
          }
          return acc.access_token;
        } catch (e) {
          console.warn('[search_ranking] getToken error:', e);
          return acc?.access_token;
        }
      };

      const mlToken = await getToken();
      const mlHeaders: Record<string, string> = mlToken ? { Authorization: `Bearer ${mlToken}` } : {};

      const PAGE_SIZE = 50;

      // Normalize: strip combining diacritics (ã→a, ç→c, etc.) via unicode range
      const normalize = (s: string) =>
        s.normalize('NFD')
         .replace(/[\u0300-\u036f]/g, '')
         .replace(/[^a-zA-Z0-9\s]/g, ' ')
         .replace(/\s+/g, ' ')
         .trim();

      const kwRaw  = (keyword || '').trim();
      const kwNorm = normalize(kwRaw);
      const words  = kwNorm.split(' ').filter((w: string) => w.length > 1);

      // Progressive keyword candidates: more specific → broader
      const candidates: string[] = [...new Set([
        kwNorm,
        words.slice(0, 4).join(' '),
        words.slice(1, 5).join(' '),
        words.slice(0, 3).join(' '),
        words.slice(1, 4).join(' '),
        words.slice(1, 3).join(' '),
        words.slice(0, 2).join(' '),
        kwRaw,
      ])].filter(Boolean);

      // If no keyword candidates remain but we have a category_id, we MUST add an empty string candidate so it fetches the category alone
      if (candidates.length === 0 && category_id) {
        candidates.push('');
      }

      // Build URL — with auth: sort=sold_quantity_desc is allowed
      const buildUrl = (kw: string, catId: string | undefined, offset: number) => {
        let u = `https://api.mercadolibre.com/sites/MLB/search?sort=sold_quantity_desc&limit=${PAGE_SIZE}&offset=${offset}`;
        if (kw) u += `&q=${encodeURIComponent(kw)}`;
        if (catId) u += `&category=${catId}`;
        return u;
      };

      // Fetch one page — authenticated via mlHeaders to avoid 403 geo-block
      const fetchPage = async (kw: string, offset: number) => {
        try {
          const res = await fetch(buildUrl(kw, category_id, offset), { headers: mlHeaders });
          const txt = await res.text();
          console.log(`[search_ranking] ML ${res.status} for URL="${buildUrl(kw, category_id, offset)}"`);
          if (!res.ok) {
            console.warn(`[search_ranking] ML ${res.status} error body:`, txt.slice(0, 200));
            return { error: true, status: res.status, body: txt };
          }
          const d = JSON.parse(txt);
          return { items: d.results || [], total: d.paging?.total || 0, diagnosticBody: txt.slice(0, 500) };
        } catch (e: any) {
          console.warn(`[search_ranking] fetch error for kw="${kw}":`, e);
          return { error: true, status: 0, body: e.message };
        }
      };

      // Try keyword candidates until one returns results
      let fetchDiagnostic = null;
      let firstPage: any = null;
      let usedKw = '';
      for (const kw of candidates) {
        firstPage = await fetchPage(kw, 0);
        if (firstPage && firstPage.error) {
          fetchDiagnostic = firstPage;
        } else if (firstPage) {
          // capture first successful fetch to know what it looked like
          if (!fetchDiagnostic) fetchDiagnostic = { status: 200, itemsCount: firstPage.items?.length, bodySample: firstPage.diagnosticBody };
        }
        if (firstPage && !firstPage.error && firstPage.items && firstPage.items.length > 0) { usedKw = kw; break; }
        firstPage = null; // Reset if empty so it falls through
      }

      if (!firstPage) {
        console.warn(`[search_ranking] all candidates returned empty`);
        return ok({ ranking: [], my_positions: [], lider: null, total_results: 0, my_share: 0, total_vendas_top: 0, my_seller_ids: sellerIds, used_keyword: kwNorm, pages_searched: 0, diagnostic: fetchDiagnostic });
      }


      const totalAvailable = firstPage.total;
      const allResults: any[] = [...firstPage.items];

      // Continue paginating until we find MY product OR we reach max_pages
      let myFound = firstPage.items.some((r: any) => sellerIds.includes(String(r.seller?.id || '')));
      const pagesNeeded = Math.min(max_pages, Math.ceil(totalAvailable / PAGE_SIZE));

      for (let page = 1; page < pagesNeeded && !myFound; page++) {
        const offset = page * PAGE_SIZE;
        const p = await fetchPage(usedKw, offset);
        if (!p || !p.items.length) break;
        allResults.push(...p.items);
        myFound = p.items.some((r: any) => sellerIds.includes(String(r.seller?.id || '')));
      }

      // Map all results into ranked items
      const allRanked = allResults.map((item: any, idx: number) => {
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
          is_mine:       sellerIds.includes(sellerId),
          categoria_id:  item.category_id || '',
        };
      });

      // Top 50 for main display
      const top50 = allRanked.slice(0, 50);

      // All my positions (anywhere in the full result set)
      const myPositions = allRanked.filter((r: any) => r.is_mine);

      // Share calculation based on top 50 only (to be meaningful)
      const totalVendas = top50.reduce((s: number, r: any) => s + (r.vendas || 0), 0);
      const myVendasTop = top50.filter((r: any) => r.is_mine).reduce((s: number, r: any) => s + (r.vendas || 0), 0);
      const myShare = totalVendas > 0 ? Math.round(myVendasTop / totalVendas * 1000) / 10 : 0;

      return ok({
        ranking:          top50,       // top 50 displayed
        my_positions:     myPositions, // ALL my products found across pages
        lider:            top50[0] || null,
        total_results:    totalAvailable,
        pages_searched:   Math.ceil(allResults.length / PAGE_SIZE),
        my_share:         myShare,
        total_vendas_top: totalVendas,
        my_seller_ids:    sellerIds,
        used_keyword:     usedKw,
      });
    }


    // ── close_item — close (fechar) an ML listing ─────────────────────────────
    if (action === 'close_item') {
      const { item_id, account_id } = rest;
      if (!item_id) throw new Error('item_id required');

      // Fetch account creds
      let accQuery = client.from('ml_accounts').select('id, access_token, refresh_token, token_expires_at, client_id, client_secret').eq('ativo', true);
      if (account_id) accQuery = accQuery.eq('id', account_id);
      const { data: closeAccs } = await accQuery.limit(1);
      const closeAcc = closeAccs?.[0];
      if (!closeAcc) throw new Error('No active ML account found');

      // Refresh token if needed
      const closeExpiry = closeAcc.token_expires_at ? new Date(closeAcc.token_expires_at) : null;
      let closeToken = closeAcc.access_token;
      if ((!closeExpiry || closeExpiry < new Date(Date.now() + 5 * 60 * 1000)) && closeAcc.refresh_token) {
        const tr = await fetch('https://api.mercadolibre.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'refresh_token', client_id: closeAcc.client_id, client_secret: closeAcc.client_secret, refresh_token: closeAcc.refresh_token }),
        });
        if (tr.ok) { const td = await tr.json(); closeToken = td.access_token; }
      }

      const authHeaders = { Authorization: `Bearer ${closeToken}`, 'Content-Type': 'application/json' };
      const itemUrl = `https://api.mercadolibre.com/items/${item_id}`;

      // 1️⃣ Try hard DELETE first (works for ghost/0-sale/unpublished items)
      const delRes = await fetch(itemUrl, { method: 'DELETE', headers: authHeaders });
      if (delRes.ok || delRes.status === 204) {
        console.log(`[close_item] DELETE succeeded for ${item_id}`);
        return ok({ success: true, item_id, method: 'deleted' });
      }

      console.log(`[close_item] DELETE returned ${delRes.status} — falling back to status:closed`);

      // 2️⃣ Fall back to close (status: closed)
      const closeRes = await fetch(itemUrl, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ status: 'closed' }),
      });
      const closeBody = await closeRes.json();
      if (!closeRes.ok) throw new Error(`ML close failed [${closeRes.status}]: ${JSON.stringify(closeBody)}`);
      return ok({ success: true, item_id, method: 'closed', status: closeBody.status });
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function ok(data: any) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
