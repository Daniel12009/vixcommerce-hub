import { useCallback, useEffect, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'


const SESSION_KEY = 'vixcommerce_session_id'

export type ActivityModule = 'market_intel' | 'demand_planning' | 'purchase_orders' | 'session'

// Automatically mapping event types to modules
const MODULE_MAP: Record<string, ActivityModule> = {
  market_intel_open: 'market_intel',
  competitor_search: 'market_intel',
  snapshot_viewed: 'market_intel',
  report_exported: 'market_intel',
  price_alert_set: 'market_intel',
  price_alert_triggered: 'market_intel',
  demand_planning_open: 'demand_planning',
  demand_model_run: 'demand_planning',
  demand_param_adjusted: 'demand_planning',
  sheets_export: 'demand_planning',
  purchase_order_created: 'purchase_orders',
  purchase_order_edited: 'purchase_orders',
  purchase_order_approved: 'purchase_orders',
  cbm_allocation_run: 'purchase_orders',
  session_start: 'session',
  session_end: 'session',
  page_view: 'session',
}

export function useActivityTracker() {
  const sessionId = useRef<string>(
    sessionStorage.getItem(SESSION_KEY) ?? (() => {
      const id = crypto.randomUUID()
      sessionStorage.setItem(SESSION_KEY, id)
      return id
    })()
  )

  const track = useCallback(
    async (
      event_type: string,
      metadata?: Record<string, unknown>
    ) => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const module = MODULE_MAP[event_type] || 'session'

        await supabase.from('user_activity_events' as any).insert({
          user_id: user.id,
          event_type,
          module,
          metadata: metadata ?? {},
          session_id: sessionId.current,
          occurred_at: new Date().toISOString(),
        })
      } catch (e) {
        console.warn('[ActivityTracker] Failed to track event', event_type, e)
      }
    },
    []
  )

  // Rastrear session_start no mount (Only runs once per browser session)
  useEffect(() => {
    let active = true
    const initSession = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !active) return
      
      const alreadyTracked = sessionStorage.getItem('vix_session_started')
      if (!alreadyTracked) {
        track('session_start', {
          device: navigator.platform,
          browser: navigator.userAgent.split(' ').pop(),
        })
        sessionStorage.setItem('vix_session_started', 'true')
      }
    }
    initSession()

    // session_end em idle ou unload
    let idleTimer: ReturnType<typeof setTimeout>
    const resetIdle = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => track('session_end', {}), 15 * 60 * 1000)
    }
    window.addEventListener('mousemove', resetIdle)
    window.addEventListener('keydown', resetIdle)
    window.addEventListener('beforeunload', () => track('session_end', {}))
    resetIdle()

    return () => {
      active = false;
      clearTimeout(idleTimer)
      window.removeEventListener('mousemove', resetIdle)
      window.removeEventListener('keydown', resetIdle)
    }
  }, [track])

  return { track }
}
