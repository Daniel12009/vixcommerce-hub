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
    // This maintains cross-device cache without blocking the UI or throwing hard errors
    // if the payload is too large or causes a Gateway Timeout.
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
