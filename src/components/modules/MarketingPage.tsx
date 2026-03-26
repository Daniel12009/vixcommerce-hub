import { useState } from 'react';
import { LayoutDashboard, Settings2, Package, Globe, Store, Layers } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { MLMarketingTab } from './marketing/MLMarketingTab';
import { ShopeeMarketingTab } from './marketing/ShopeeMarketingTab';
import { GenericMarketingTab } from './marketing/GenericMarketingTab';

type PlatformKey = 'ml' | 'shopee' | 'generic';
type SubTabKey = 'dashboard' | 'gerenciar' | 'status';

export function MarketingPage() {
  const [platform, setPlatform] = useState<PlatformKey>('ml');
  const [subTab, setSubTab] = useState<SubTabKey>('dashboard');

  const PlatformTabs = [
    { id: 'ml', label: 'Mercado Livre', icon: Globe, color: 'text-[#FFE600] bg-[#FFE600]/10' },
    { id: 'shopee', label: 'Shopee', icon: Store, color: 'text-[#EE4D2D] bg-[#EE4D2D]/10' },
    { id: 'generic', label: 'Shein / Outros', icon: Layers, color: 'text-primary bg-primary/10' },
  ];

  const SubTabs = [
    { key: 'dashboard' as SubTabKey, label: 'Dashboard', icon: LayoutDashboard },
    { key: 'gerenciar' as SubTabKey, label: 'Gerenciar Campanhas', icon: Settings2 },
    { key: 'status' as SubTabKey, label: 'Status Anúncios', icon: Package },
  ];

  return (
    <div className="animate-fade-in pb-12">
      <PageHeader title="Performance & Marketing" subtitle="Acompanhe vendas, visitas e métricas de anúncios em todos os seus canais." />

      {/* ━━━━━━━━━━ MASTHEAD: PLATFORM SELECTION ━━━━━━━━━━ */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {PlatformTabs.map((p) => (
          <button
            key={p.id}
            onClick={() => { setPlatform(p.id as PlatformKey); setSubTab('dashboard'); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all shadow-sm
              ${platform === p.id 
                ? 'bg-card border-2 border-primary text-foreground scale-[1.02]' 
                : 'bg-muted/30 border border-transparent text-muted-foreground hover:bg-card hover:text-foreground'
              }`}
          >
            <p.icon className={`w-5 h-5 ${platform === p.id ? p.color.split(' ')[0] : 'opacity-70'}`} />
            {p.label}
          </button>
        ))}
      </div>

      <div className="w-full h-px bg-border mb-6" />

      {/* ━━━━━━━━━━ SUB-TABS: PER PLATFORM ━━━━━━━━━━ */}
      <div className="flex gap-1 mb-6 bg-card border border-border p-1 rounded-xl w-fit shadow-sm">
        {SubTabs.map(t => (
          <button
            key={t.key} 
            onClick={() => setSubTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all 
              ${subTab === t.key 
                ? 'bg-primary text-primary-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* ━━━━━━━━━━ RENDER COMPONENT ━━━━━━━━━━ */}
      <div className="mt-2">
        {platform === 'ml' && <MLMarketingTab activeTab={subTab} />}
        {platform === 'shopee' && <ShopeeMarketingTab activeTab={subTab} />}
        {platform === 'generic' && <GenericMarketingTab activeTab={subTab} />}
      </div>
    </div>
  );
}
