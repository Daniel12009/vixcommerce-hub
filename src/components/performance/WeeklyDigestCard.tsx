// components/performance/WeeklyDigestCard.tsx
import { CheckCircle2, FileText, Download } from 'lucide-react'
import type { WeeklySummary } from '@/hooks/useUserPerformance'

interface Props {
  weekData: WeeklySummary | null
}

export function WeeklyDigestCard({ weekData }: Props) {
  if (!weekData) return null

  return (
    <div style={{
      padding: '20px 24px',
      background: 'var(--color-background-secondary)',
      borderRadius: 12,
      border: '0.5px solid var(--color-border-tertiary)',
      height: '100%',
    }}>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        Highlights da Semana
      </p>

      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-[#1b2520] rounded-md text-[#1D9E75]">
            <CheckCircle2 size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-200">{weekData.active_days} dias ativos</p>
            <p className="text-xs text-gray-400">Vocês esteve presente quase todos os dias.</p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="p-2 bg-[#2d1b1b] rounded-md text-[#E24B4A]">
            <FileText size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-200">{weekData.pos_created} pedidos emitidos</p>
            <p className="text-xs text-gray-400">Gerados via módulo de Compras.</p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="p-2 bg-[#1b1c2b] rounded-md text-[#4A62E2]">
            <Download size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-200">{weekData.reports_exported} relatórios exportados</p>
            <p className="text-xs text-gray-400">Entre Mercado Inteligência e Demanda.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
