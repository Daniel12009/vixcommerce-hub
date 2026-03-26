import { useState } from 'react';
import { LayoutDashboard, Settings2, Package, Globe, Store, Layers } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { MLMarketingTab } from './marketing/MLMarketingTab';
import { ShopeeMarketingTab } from './marketing/ShopeeMarketingTab';
import { GenericMarketingTab } from './marketing/GenericMarketingTab';

type PlatformKey = 'ml' | 'shopee' | 'amazon' | 'tiktok' | 'generic' | null;
type SubTabKey = 'dashboard' | 'gerenciar' | 'status';

export function MarketingPage() {
  const [platform, setPlatform] = useState<PlatformKey>(null);
  const [subTab, setSubTab] = useState<SubTabKey>('dashboard');

  const PlatformTabs = [
    { id: 'ml', label: 'Mercado Livre', icon: Globe, colorClass: 'bg-[hsl(45,100%,50%,0.1)] text-[#fbbc04] border-[#fbbc04]/30' },
    { id: 'shopee', label: 'Shopee', icon: Store, colorClass: 'bg-[#ee4d2d]/10 text-[#ee4d2d] border-[#ee4d2d]/30' },
    { id: 'amazon', label: 'Amazon', icon: Package, colorClass: 'bg-[#ff9900]/10 text-[#ff9900] border-[#ff9900]/30' },
    { id: 'tiktok', label: 'TikTok Shop', icon: Layers, colorClass: 'bg-black/5 text-foreground border-border' },
    { id: 'generic', label: 'Outros Canais', icon: Settings2, colorClass: 'bg-primary/5 text-primary border-primary/20' },
  ];

  const SubTabs = [
    { key: 'dashboard' as SubTabKey, label: 'Dashboard', icon: LayoutDashboard },
    { key: 'gerenciar' as SubTabKey, label: 'Gerenciar Campanhas', icon: Settings2 },
    { key: 'status' as SubTabKey, label: 'Status Anúncios', icon: Package },
  ];

  if (!platform) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
        <PageHeader title="Performance & Marketing" subtitle="Selecione um marketplace para gerenciar campanhas de Ads e analisar performance." />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mt-6">
          {PlatformTabs.map(p => (
            <button
              key={p.id}
              onClick={() => { setPlatform(p.id as PlatformKey); setSubTab('dashboard'); }}
              className={`p-6 rounded-2xl border bg-card hover:bg-muted/50 transition-all text-left group relative overflow-hidden flex flex-col items-center text-center gap-4 ${p.colorClass}`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="p-4 rounded-full bg-background shadow-sm group-hover:scale-110 transition-transform duration-300">
                <p.icon className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-bold text-lg">{p.label}</h3>
                <p className="text-xs text-muted-foreground mt-1 font-medium">Acessar Ads</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-right-8 duration-300 pb-12">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setPlatform(null)} className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
          <Globe className="w-5 h-5" /> {/* Just to mock a back button visually */}
        </button>
        <div>
          <h2 className="text-xl font-bold text-foreground capitalize flex items-center gap-2">
            {PlatformTabs.find(p => p.id === platform)?.icon && (
              <span className={PlatformTabs.find(p => p.id === platform)?.colorClass + " p-1 rounded-md"}>
                {(() => { const Icon = PlatformTabs.find(p => p.id === platform)?.icon as any; return <Icon className="w-4 h-4"/>; })()}
              </span>
            )}
            {PlatformTabs.find(p => p.id === platform)?.label} — Performance
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Gerenciamento de campanhas e anúncios no canal selecionado.</p>
        </div>
      </div>

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
        {(platform === 'generic' || platform === 'amazon' || platform === 'tiktok') && <GenericMarketingTab activeTab={subTab} />}
      </div>
    </div>
  );
}
