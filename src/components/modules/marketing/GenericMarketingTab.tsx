import { useState } from 'react';
import { Database, Filter, Loader2, BarChart2, TrendingUp, Layers } from 'lucide-react';

export function GenericMarketingTab({ activeTab }: { activeTab: 'dashboard' | 'gerenciar' | 'status' }) {
  return (
    <div className="animate-fade-in">
      <div className="flex flex-col items-center justify-center py-20 bg-card border border-border rounded-xl">
        <Layers className="w-12 h-12 text-primary opacity-40 mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Outras Integrações</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Este painel unificará a performance de vendas dos outros canais (Shein, TikTok, Magalu) configurados através das *Outras Integrações* na aba de API.
        </p>
      </div>
    </div>
  );
}
