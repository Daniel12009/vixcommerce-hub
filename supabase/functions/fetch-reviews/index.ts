import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { shopeeFetch } from '../_shared/shopee-utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = 'https://mbxpkqhjapmhehdngfaj.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ieHBrcWhqYXBtaGVoZG5nZmFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzkzMjg5NiwiZXhwIjoyMDg5NTA4ODk2fQ.Z5urVHTv5oLodyYnnXM_RBALEl8Ji_5ld-HNtLjxLjQ';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const logMessages: string[] = [];
  const log = (msg: string) => { console.log(msg); logMessages.push(msg); };

  const today = new Date().toISOString().split('T')[0];
  let totalSnapshots = 0;

  // ═══════════════════════════════════════════════════
  // MERCADO LIVRE
  // ═══════════════════════════════════════════════════
  try {
    const { data: mlAccounts } = await supabase
      .from('ml_accounts')
      .select('id, nome, seller_id, access_token')
      .eq('ativo', true);

    for (const account of mlAccounts ?? []) {
      log(`[ML] Processando conta: ${account.nome}`);
      try {
        // Buscar anúncios ativos
        const searchRes = await fetch(
          `https://api.mercadolibre.com/users/${account.seller_id}/items/search?status=active&limit=50`,
          { headers: { Authorization: `Bearer ${account.access_token}` } }
        );
        const search = await searchRes.json();
        const itemIds: string[] = search.results ?? [];
        log(`[ML] ${account.nome}: ${itemIds.length} anúncios ativos`);

        // Buscar título dos itens em batch
        const titles: Record<string, string> = {};
        if (itemIds.length > 0) {
          const idsParam = itemIds.slice(0, 20).join(',');
          const multiRes = await fetch(
            `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,title`,
            { headers: { Authorization: `Bearer ${account.access_token}` } }
          );
          const multiData = await multiRes.json();
          for (const item of multiData ?? []) {
            if (item.body?.id && item.body?.title) {
              titles[item.body.id] = item.body.title;
            }
          }
        }

        // Buscar reviews de cada anúncio
        for (const itemId of itemIds.slice(0, 50)) {
          try {
            const revRes = await fetch(
              `https://api.mercadolibre.com/reviews/item/${itemId}`,
              { headers: { Authorization: `Bearer ${account.access_token}` } }
            );
            
            if (!revRes.ok) continue;
            const rev = await revRes.json();

            const snapshot = {
              plataforma: 'ml',
              conta: account.nome,
              item_id: itemId,
              item_title: titles[itemId] || null,
              rating_average: rev.rating_average ?? 0,
              total_reviews: rev.paging?.total ?? 0,
              stars_1: rev.rating_levels?.one_star ?? 0,
              stars_2: rev.rating_levels?.two_star ?? 0,
              stars_3: rev.rating_levels?.three_star ?? 0,
              stars_4: rev.rating_levels?.four_star ?? 0,
              stars_5: rev.rating_levels?.five_star ?? 0,
              snapshot_date: today,
            };

            await supabase.from('reviews_snapshots').upsert(snapshot, {
              onConflict: 'plataforma,item_id,snapshot_date',
            });

            totalSnapshots++;
          } catch (e: any) {
            log(`[ML] Erro review ${itemId}: ${e.message}`);
          }
        }
      } catch (e: any) {
        log(`[ML] Erro conta ${account.nome}: ${e.message}`);
      }
    }
  } catch (e: any) {
    log(`[ML] Erro geral: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════
  // SHOPEE
  // ═══════════════════════════════════════════════════
  try {
    const { data: shopeeAccounts } = await supabase
      .from('shopee_accounts')
      .select('*')
      .eq('ativo', true);

    for (const account of shopeeAccounts ?? []) {
      log(`[SHOPEE] Processando conta: ${account.nome}`);
      try {
        // Buscar itens ativos da loja
        const itemList = await shopeeFetch(account, '/api/v2/product/get_item_list', {
          offset: '0',
          page_size: '50',
          item_status: 'NORMAL',
        });

        const items = itemList?.response?.item ?? [];
        log(`[SHOPEE] ${account.nome}: ${items.length} itens ativos`);

        for (const item of items.slice(0, 50)) {
          const itemId = String(item.item_id);
          try {
            // Buscar avaliações do item
            const comments = await shopeeFetch(account, '/api/v2/product/get_comment', {
              item_id: itemId,
              filter_type: '0',
              offset: '0',
              page_size: '50',
            });

            const commentList = comments?.response?.item_comment_list ?? [];

            // Calcular distribuição de estrelas
            let s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0;
            for (const c of commentList) {
              switch (c.rating_star) {
                case 1: s1++; break;
                case 2: s2++; break;
                case 3: s3++; break;
                case 4: s4++; break;
                case 5: s5++; break;
              }
            }
            const total = s1 + s2 + s3 + s4 + s5;
            const avg = total > 0 ? (1*s1 + 2*s2 + 3*s3 + 4*s4 + 5*s5) / total : 0;

            // Buscar título do item
            let itemTitle = null;
            try {
              const info = await shopeeFetch(account, '/api/v2/product/get_item_base_info', {
                item_id_list: itemId,
              });
              itemTitle = info?.response?.item_list?.[0]?.item_name ?? null;
            } catch {}

            const snapshot = {
              plataforma: 'shopee',
              conta: account.nome,
              item_id: itemId,
              item_title: itemTitle,
              rating_average: Math.round(avg * 100) / 100,
              total_reviews: total,
              stars_1: s1,
              stars_2: s2,
              stars_3: s3,
              stars_4: s4,
              stars_5: s5,
              snapshot_date: today,
            };

            await supabase.from('reviews_snapshots').upsert(snapshot, {
              onConflict: 'plataforma,item_id,snapshot_date',
            });

            totalSnapshots++;
          } catch (e: any) {
            log(`[SHOPEE] Erro comment item ${itemId}: ${e.message}`);
          }
        }
      } catch (e: any) {
        log(`[SHOPEE] Erro conta ${account.nome}: ${e.message}`);
      }
    }
  } catch (e: any) {
    log(`[SHOPEE] Erro geral: ${e.message}`);
  }

  log(`[DONE] Total snapshots salvos: ${totalSnapshots}`);

  return new Response(JSON.stringify({ ok: true, snapshots: totalSnapshots, logs: logMessages }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
