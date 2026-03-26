import { useState } from 'react';
import { ShoppingBag, TrendingUp, Filter, Loader2, Store, Eye, Search } from 'lucide-react';
import { KpiCard } from '@/components/shared/KpiCard';

export function ShopeeMarketingTab({ activeTab }: { activeTab: 'dashboard' | 'gerenciar' | 'status' }) {
  // Placeholder for future Shopee Ads / Performance metrics fetching
  const [loading, setLoading] = useState(false);

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col items-center justify-center py-20 bg-card border border-border rounded-xl">
        <Store className="w-12 h-12 text-[#EE4D2D] opacity-40 mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Integração Shopee Ads</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          A seção de Performance para a Shopee está sendo estruturada. Em breve, você visualizará aqui o painel completo de visualizações, conversões diretas e controle de campanhas (Discovery e Search).
        </p>
      </div>
    </div>
  );
}
