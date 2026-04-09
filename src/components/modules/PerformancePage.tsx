import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useUserPerformance } from '@/hooks/useUserPerformance'
import { ActivityHeatmap } from '@/components/performance/ActivityHeatmap'
import { ProductivityScoreCard } from '@/components/performance/ProductivityScoreCard'
import { ModuleUsageBreakdown } from '@/components/performance/ModuleUsageBreakdown'
import { WeeklyDigestCard } from '@/components/performance/WeeklyDigestCard'

export default function PerformancePage() {
  const { 
    heatmap, currentWeek, previousWeek, 
    productivityScore, streak 
  } = useUserPerformance()

  return (
    <div className="min-h-screen text-foreground">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground mb-2">Performance &amp; Atividade</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe o seu painel de produtividade detalhado baseado nas suas atividades no sistema.
          </p>
        </div>

        {/* Section 1: Top Metrics Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ProductivityScoreCard 
            score={productivityScore} 
            streak={streak} 
            currentWeekActions={currentWeek?.total_actions || 0}
            previousWeekActions={previousWeek?.total_actions || 0}
          />
          <ModuleUsageBreakdown weekData={currentWeek} />
          <WeeklyDigestCard weekData={currentWeek} />
        </div>

        {/* Section 2: Heatmap */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg font-medium text-foreground">Heatmap de Contribuição (90 dias)</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityHeatmap data={heatmap} />
          </CardContent>
        </Card>

        {/* Empty state */}
        {heatmap.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg font-medium mb-1">Nenhuma atividade registrada ainda</p>
            <p className="text-sm">Suas métricas aparecerão aqui conforme você usar o sistema.</p>
          </div>
        )}

      </div>
    </div>
  )
}
