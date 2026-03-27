import { supabase } from '@/integrations/supabase/client';
import { set, get } from 'idb-keyval';

/**
 * Persistence layer.
 * - 'sheet_configs' (small, cross-device): saved to Supabase `app_data`.
 * - all other data arrays (huge, local cache): saved to IndexedDB to avoid Supabase 504 timeouts.
 */

export async function saveToCloud(key: string, data: any): Promise<boolean> {
  try {
    // 1. Cross-device Configs (e.g. Sheet URIs) -> Sync immediately
    if (key === 'sheet_configs') {
      const { error } = await supabase
        .from('app_data')
        .upsert({ data_key: key, data_value: data }, { onConflict: 'data_key' });
      if (error) console.warn(`[Persist] Supabase save failed for "${key}":`, error.message);
      
      await set(`vix_${key}`, data).catch(() => {});
      return !error;
    }

    // 2. Huge Data Caches -> Local IndexedDB instantly
    await set(`vix_${key}`, data);
    
    // 3. Fire-and-forget sync to Supabase in the background
    // Skip if payload is too large (>500KB) to avoid Supabase Gateway Timeouts
    const str = JSON.stringify(data);
    if (str.length > 500000) {
      console.log(`[Persist] Skipping cloud sync for "${key}" — too large (${(str.length / 1024).toFixed(0)}KB)`);
      return true;
    }

    queueMicrotask(() => {
      supabase.from('app_data')
        .upsert({ data_key: key, data_value: data }, { onConflict: 'data_key' })
        .then(({ error }) => {
          if (error) console.warn(`[Persist-Async] Background sync failed for "${key}":`, error.message);
        });
    });

    return true;
  } catch (err) {
    console.warn(`[Persist] Error saving "${key}":`, err);
    return false;
  }
}

export async function loadFromCloud<T>(key: string): Promise<T | null> {
  try {
    // 1. Cross-device Configs -> Supabase
    if (key === 'sheet_configs') {
      const { data, error } = await supabase
        .from('app_data')
        .select('data_value')
        .eq('data_key', key)
        .maybeSingle();

      if (!error && data?.data_value) {
        await set(`vix_${key}`, data.data_value).catch(() => {});
        return data.data_value as T;
      }
    }

    // 2. Fallback or Huge Data -> IndexedDB
    const localData = await get(`vix_${key}`);
    return (localData as T) || null;
  } catch (err) {
    console.warn(`[Persist] Error loading "${key}":`, err);
    return null;
  }
}

// ━━━ Incremental Sync ━━━

export async function getCheckpoint(key: string): Promise<string | null> {
  try {
    const { data } = await (supabase as any)
      .from('sync_checkpoints')
      .select('last_sync_date')
      .eq('key', key)
      .single();
    return data?.last_sync_date || null;
  } catch { return null; }
}

export async function saveCheckpoint(key: string, lastDate: string, totalRecords: number) {
  try {
    await (supabase as any)
      .from('sync_checkpoints')
      .upsert({ key, last_sync_date: lastDate, last_sync_at: new Date().toISOString(), total_records: totalRecords },
        { onConflict: 'key' });
  } catch { /* ignore */ }
}

function parseDate(d: string): string {
  if (!d) return '';
  if (d.includes('/')) {
    const [day, mon, yr] = d.split('/');
    return `${yr}-${mon.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return d;
}

export async function syncVendasIncremental(allVendas: any[]): Promise<{ inserted: number; skipped: number }> {
  try {
    const checkpoint = await getCheckpoint('vendas');

    const newRecords = checkpoint
      ? allVendas.filter(v => {
          if (!v.data) return false;
          return parseDate(v.data) > checkpoint;
        })
      : allVendas;

    if (newRecords.length === 0) {
      console.log('[Sync] Vendas: nada novo desde', checkpoint);
      return { inserted: 0, skipped: allVendas.length };
    }

    // Insert in batches of 100
    const BATCH = 100;
    let inserted = 0;
    for (let i = 0; i < newRecords.length; i += BATCH) {
      const batch = newRecords.slice(i, i + BATCH).map(v => ({
        id: v.numeroPedido || `${v.data}-${v.sku}-${Math.random()}`,
        data: v.data,
        conta: v.conta,
        sku: v.sku || v.skuProduto,
        valor_total: v.valorTotal || 0,
        payload: v,
      }));
      const { error } = await (supabase as any)
        .from('vendas_cache')
        .upsert(batch, { onConflict: 'id', ignoreDuplicates: true });
      if (!error) inserted += batch.length;
    }

    // Update checkpoint with latest date
    const latestDate = newRecords
      .map(v => parseDate(v.data))
      .filter(Boolean)
      .sort()
      .pop() || '';

    if (latestDate) await saveCheckpoint('vendas', latestDate, allVendas.length);

    console.log(`[Sync] Vendas: ${inserted} inseridos, ${allVendas.length - newRecords.length} ignorados (já existiam)`);
    return { inserted, skipped: allVendas.length - newRecords.length };
  } catch (err) {
    console.warn('[Sync] Erro no sync incremental:', err);
    return { inserted: 0, skipped: 0 };
  }
}

