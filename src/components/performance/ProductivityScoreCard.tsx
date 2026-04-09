// components/performance/ProductivityScoreCard.tsx
interface Props {
  score: number
  streak: number
  currentWeekActions: number
  previousWeekActions: number
}

export function ProductivityScoreCard({
  score, streak, currentWeekActions, previousWeekActions,
}: Props) {
  const delta = currentWeekActions - previousWeekActions
  const deltaSign = delta > 0 ? '+' : ''
  const isPositive = delta >= 0

  return (
    <div style={{
      padding: '20px 24px',
      background: 'var(--color-background-secondary)',
      borderRadius: 12,
      border: '0.5px solid var(--color-border-tertiary)',
    }}>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
        Score de produtividade
      </p>
      
      {/* Score ring — SVG simples */}
      <div className="flex items-center gap-6">
        <div className="relative">
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="var(--color-border-tertiary)" strokeWidth="6"/>
            <circle
              cx="40" cy="40" r="34" fill="none"
              stroke={score >= 70 ? '#1D9E75' : score >= 40 ? '#EF9F27' : '#E24B4A'}
              strokeWidth="6"
              strokeDasharray={`${(score / 100) * 213.6} 213.6`}
              strokeLinecap="round"
              transform="rotate(-90 40 40)"
              className="transition-all duration-1000 ease-out"
            />
            <text x="40" y="46" textAnchor="middle" fontSize="20" fontWeight="600"
              fill="var(--color-text-primary)">{score}</text>
          </svg>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Sequência ativa</p>
            <p style={{ fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)' }}>
              {streak} <span style={{ fontSize: 13, fontWeight: 400 }}>dias</span>
            </p>
          </div>
          <div>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Esta semana</p>
            <p style={{ fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)' }}>
              {currentWeekActions}{' '}
              <span className={`text-xs ml-1 ${isPositive ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                ({deltaSign}{delta} vs anterior)
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
