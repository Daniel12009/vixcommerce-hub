import { supabase } from '@/integrations/supabase/client';

/**
 * Persistence layer using Supabase `app_data` table.
 * Falls back to localStorage if Supabase is unavailable.
 *
 * Keys used:
 *   - 'sheet_configs'     → SheetConfig[]
 *   - 'vendas_data'       → VendaItem[]
 *   - 'performance_data'  → PerformanceItem[]
 *   - 'estoque_data'      → any[]
 *   - 'financeiro_data'   → any[]
 */

export async function saveToCloud(key: string, data: any): Promise<boolean> {
  try {
    // Save to localStorage (fast local cache) — ignore quota errors
    try {
      localStorage.setItem(`vix_${key}`, JSON.stringify(data));
    } catch {
      // localStorage quota exceeded — no problem, Supabase is the primary store
    }

    // Save to Supabase (cross-browser persistence)
    const { error } = await (supabase as any)
      .from('app_data')
      .upsert(
        { data_key: key, data_value: data },
        { onConflict: 'data_key' }
      );

    if (error) {
      console.warn(`[Persist] Supabase save failed for "${key}":`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[Persist] Error saving "${key}":`, err);
    return false;
  }
}

export async function loadFromCloud<T>(key: string): Promise<T | null> {
  try {
    // Try Supabase first (cross-browser source of truth)
    const { data, error } = await (supabase as any)
      .from('app_data')
      .select('data_value')
      .eq('data_key', key)
      .maybeSingle();

    if (!error && data?.data_value) {
      // Update localStorage cache (ignore quota errors)
      try { localStorage.setItem(`vix_${key}`, JSON.stringify(data.data_value)); } catch {}
      return data.data_value as T;
    }

    if (error) {
      console.warn(`[Persist] Supabase load failed for "${key}":`, error.message);
    }
  } catch (err) {
    console.warn(`[Persist] Error loading "${key}" from cloud:`, err);
  }

  // Fallback to localStorage
  try {
    const local = localStorage.getItem(`vix_${key}`);
    if (local) return JSON.parse(local) as T;
  } catch {}

  return null;
}
