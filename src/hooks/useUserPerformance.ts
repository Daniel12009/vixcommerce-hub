import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { startOfDay, subDays, format } from 'date-fns'

export interface DayMetric {
  day: string          // 'YYYY-MM-DD'
  total_actions: number
  market_intel_actions: number
  demand_actions: number
  po_actions: number
  sessions: number
}

export interface WeeklySummary {
  week_start: string
  total_actions: number
  active_days: number
  market_intel_actions: number
  demand_actions: number
  po_actions: number
  pos_created: number
  reports_exported: number
}

export interface PerformanceData {
  heatmap: DayMetric[]         // últimos 90 dias
  currentWeek: WeeklySummary | null
  previousWeek: WeeklySummary | null
  productivityScore: number    // 0-100
  streak: number               // dias consecutivos com pelo menos 1 ação
  loading: boolean
}

export function useUserPerformance(): PerformanceData {
  const [data, setData] = useState<PerformanceData>({
    heatmap: [], currentWeek: null, previousWeek: null,
    productivityScore: 0, streak: 0, loading: true,
  })

  useEffect(() => {
    let active = true

    const loadPerformance = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !active) return

        const since = format(subDays(startOfDay(new Date()), 90), 'yyyy-MM-dd')

        const [heatmapRes, weeksRes] = await Promise.all([
          supabase
            .from('user_daily_metrics' as any)
            .select('*')
            .eq('user_id', user.id)
            .gte('day', since)
            .order('day', { ascending: true }),
          supabase
            .from('user_weekly_summary' as any)
            .select('*')
            .eq('user_id', user.id)
            .order('week_start', { ascending: false })
            .limit(2),
        ])

        if (!active) return

        // If the tables don't exist yet, show empty state instead of hanging
        if (heatmapRes.error || weeksRes.error) {
          console.warn('[useUserPerformance] Views not ready yet:', heatmapRes.error?.message || weeksRes.error?.message)
          if (active) setData(prev => ({ ...prev, loading: false }))
          return
        }

        const heatmapData = heatmapRes.data || []
        const weeksData = weeksRes.data || []

        const hm = heatmapData.map((r: any) => ({
          ...r,
          day: format(new Date(r.day), 'yyyy-MM-dd'),
          total_actions: Number(r.total_actions) || 0,
          market_intel_actions: Number(r.market_intel_actions) || 0,
          demand_actions: Number(r.demand_actions) || 0,
          po_actions: Number(r.po_actions) || 0,
          sessions: Number(r.sessions) || 0,
        }))

        const parsedWeeks = weeksData.map((r: any) => ({
          ...r,
          total_actions: Number(r.total_actions) || 0,
          active_days: Number(r.active_days) || 0,
          market_intel_actions: Number(r.market_intel_actions) || 0,
          demand_actions: Number(r.demand_actions) || 0,
          po_actions: Number(r.po_actions) || 0,
          pos_created: Number(r.pos_created) || 0,
          reports_exported: Number(r.reports_exported) || 0,
        }))

        const last7 = hm.slice(-7)
        const avgActions = last7.reduce((s, d) => s + d.total_actions, 0) / 7
        const score = Math.min(100, Math.round((avgActions / 10) * 100))

        let streak = 0
        const todayStr = format(new Date(), 'yyyy-MM-dd')
        let cursorDate = new Date()
        const map = new Map<string, number>()
        hm.forEach(d => map.set(d.day, d.total_actions))

        while (streak < 90) {
          const checkKey = format(cursorDate, 'yyyy-MM-dd')
          const actions = map.get(checkKey) || 0
          if (actions > 0) {
            streak++
            cursorDate = subDays(cursorDate, 1)
          } else {
            if (checkKey === todayStr) {
              cursorDate = subDays(cursorDate, 1)
              const yesterdayKey = format(cursorDate, 'yyyy-MM-dd')
              if ((map.get(yesterdayKey) || 0) > 0) continue
            }
            break
          }
        }

        if (active) {
          setData({
            heatmap: hm,
            currentWeek: parsedWeeks[0] ?? null,
            previousWeek: parsedWeeks[1] ?? null,
            productivityScore: score,
            streak,
            loading: false,
          })
        }
      } catch (err) {
        console.warn('[useUserPerformance] Error loading performance data:', err)
        if (active) setData(prev => ({ ...prev, loading: false }))
      }
    }

    // Safety timeout: never stay in loading > 8s
    const safetyTimer = setTimeout(() => {
      setData(prev => prev.loading ? { ...prev, loading: false } : prev)
    }, 8000)

    loadPerformance().finally(() => clearTimeout(safetyTimer))

    // Real-time listener para auto-refreshing UI whenever user interacts
    const subscription = supabase
      .channel('user_metrics_refresh')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'user_activity_events' },
        (payload) => {
          // If interaction belongs to this user, reload
          supabase.auth.getUser().then(({ data: { user } }) => {
             if (user && payload.new.user_id === user.id) {
                loadPerformance()
             }
          })
        }
      )
      .subscribe()

    return () => {
      active = false;
      supabase.removeChannel(subscription)
    }
  }, [])

  return data
}
