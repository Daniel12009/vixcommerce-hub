import { useMemo } from 'react'
import { format, eachDayOfInterval, subWeeks, startOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { DayMetric } from '@/hooks/useUserPerformance'

interface Props { data: DayMetric[] }

const WEEKS = 13
const DAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

function getIntensity(actions: number): string {
  if (actions === 0) return 'var(--color-background-tertiary)'
  if (actions < 3)  return '#9FE1CB'  // teal-100
  if (actions < 7)  return '#5DCAA5'  // teal-200
  if (actions < 15) return '#1D9E75'  // teal-400
  return '#0F6E56'                    // teal-600
}

export function ActivityHeatmap({ data }: Props) {
  const map = useMemo(() => {
    const m: Record<string, number> = {}
    data.forEach((d) => { m[d.day] = d.total_actions })
    return m
  }, [data])

  const start = startOfWeek(subWeeks(new Date(), WEEKS - 1), { weekStartsOn: 0 })
  const allDays = eachDayOfInterval({ start, end: new Date() })

  // Agrupar por semanas
  const weeks: Date[][] = []
  let week: Date[] = []
  allDays.forEach((d, i) => {
    week.push(d)
    if (week.length === 7 || i === allDays.length - 1) {
      weeks.push(week)
      week = []
    }
  })

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {/* Labels dias da semana */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingTop: 18 }}>
          {DAYS.map((d, i) => (
            <div key={d} style={{
              fontSize: 10, color: 'var(--color-text-tertiary)',
              height: 12, lineHeight: '12px', width: 24, textAlign: 'right',
              paddingRight: 4,
              visibility: i % 2 === 0 ? 'visible' : 'hidden', // slack style
            }}>{d}</div>
          ))}
        </div>
        {/* Grid */}
        {weeks.map((wk, wi) => (
          <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', height: 16, lineHeight: '16px' }}>
              {wi % 4 === 0 ? format(wk[0], 'MMM', { locale: ptBR }) : ''}
            </div>
            {Array.from({ length: 7 }).map((_, di) => {
              const day = wk[di]
              if (!day) return <div key={di} style={{ width: 12, height: 12 }} />
              const key = format(day, 'yyyy-MM-dd')
              const actions = map[key] ?? 0
              return (
                <div
                  key={di}
                  title={`${key}: ${actions} ações`}
                  className="rounded-sm transition-colors duration-300 hover:brightness-90"
                  style={{
                    width: 12, height: 12,
                    backgroundColor: getIntensity(actions),
                  }}
                />
              )
            })}
          </div>
        ))}
      </div>
      {/* Legenda */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginRight: 4 }}>Menos</span>
        {[0, 2, 6, 14, 20].map((v) => (
          <div key={v} style={{
            width: 12, height: 12, borderRadius: 2,
            backgroundColor: getIntensity(v),
          }} />
        ))}
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 4 }}>Mais</span>
      </div>
    </div>
  )
}
