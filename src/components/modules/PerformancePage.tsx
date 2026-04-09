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
    productivityScore, streak, loading 
  } = useUserPerformance()

  if (loading) {
    return (
      <div className="flex bg-[#0A0D0B] min-h-screen items-center justify-center p-6 text-gray-400">
        Carregando performance...
      </div>
    )
  }

  return (
    <div className="bg-[#0A0D0B] min-h-screen text-gray-200">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Performance & Atividade</h1>
          <p className="text-sm text-gray-400">
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
        <Card className="bg-[#121614] border-gray-800">
          <CardHeader>
            <CardTitle className="text-lg font-medium text-gray-200">Heatmap de Contribuição (90 dias)</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityHeatmap data={heatmap} />
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
