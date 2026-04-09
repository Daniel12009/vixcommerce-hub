// components/performance/ModuleUsageBreakdown.tsx
import type { WeeklySummary } from '@/hooks/useUserPerformance'

interface Props {
  weekData: WeeklySummary | null
}

export function ModuleUsageBreakdown({ weekData }: Props) {
  if (!weekData) {
    return <div className="text-xs text-gray-500">Dados insuficientes.</div>
  }

  const { total_actions, market_intel_actions, demand_actions, po_actions } = weekData
  
  const getPct = (part: number) => {
    if (!total_actions) return 0
    return Math.round((part / total_actions) * 100)
  }

  const intelPct = getPct(market_intel_actions)
  const demandPct = getPct(demand_actions)
  const poPct = getPct(po_actions)

  return (
    <div style={{
      padding: '20px 24px',
      background: 'var(--color-background-secondary)',
      borderRadius: 12,
      border: '0.5px solid var(--color-border-tertiary)',
      height: '100%',
    }}>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        Uso por Módulo (7 dias)
      </p>

      {/* Barra de distribuição */}
      <div className="h-2 w-full rounded-full flex overflow-hidden mb-5">
        <div style={{ width: `${intelPct}%`, backgroundColor: '#4A62E2' }} />
        <div style={{ width: `${demandPct}%`, backgroundColor: '#E24B4A' }} />
        <div style={{ width: `${poPct}%`, backgroundColor: '#F1A12A' }} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#4A62E2]" />
            <span className="text-xs text-gray-400">Inteligência de Mercado</span>
          </div>
          <span className="text-xs font-semibold text-gray-300">{intelPct}%</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#E24B4A]" />
            <span className="text-xs text-gray-400">Planejamento de Demanda</span>
          </div>
          <span className="text-xs font-semibold text-gray-300">{demandPct}%</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#F1A12A]" />
            <span className="text-xs text-gray-400">Pedidos de Compra (CBM)</span>
          </div>
          <span className="text-xs font-semibold text-gray-300">{poPct}%</span>
        </div>
      </div>
    </div>
  )
}
