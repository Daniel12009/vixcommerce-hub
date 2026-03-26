import { supabase } from '@/integrations/supabase/client';
import { set, get } from 'idb-keyval';

/**
 * Persistence layer.
 * - 'sheet_configs' (small, cross-device): saved to Supabase `app_data`.
 * - all other data arrays (huge, local cache): saved to IndexedDB to avoid Supabase 504 timeouts.
 */

export async function saveToCloud(key: string, data: any): Promise<boolean> {
  try {
    // 1. Cross-device Configs (e.g. Sheet URIs) -> Supabase
    if (key === 'sheet_configs') {
      const { error } = await supabase
        .from('app_data')
        .upsert({ data_key: key, data_value: data }, { onConflict: 'data_key' });
      if (error) console.warn(`[Persist] Supabase save failed for "${key}":`, error.message);
      
      // Also cache in IDB for fast local load
      await set(`vix_${key}`, data).catch(() => {});
      return !error;
    }

    // 2. Huge Data Caches (vendas, ads, estoque) -> Local IndexedDB
    await set(`vix_${key}`, data);
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
