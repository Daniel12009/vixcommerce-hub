import { useState } from 'react';
import { Package, Truck, Calendar, MapPin, ChevronRight, Activity, Globe, Database, Link as LinkIcon } from 'lucide-react';

export function EmTransitoTab() {
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);

  const platforms = [
    { id: 'ml', name: 'Mercado Livre', icon: Database, colorClass: 'bg-[hsl(45,100%,50%,0.1)] text-[#fbbc04] border-[#fbbc04]/30' },
    { id: 'shopee', name: 'Shopee', icon: LinkIcon, colorClass: 'bg-[#ee4d2d]/10 text-[#ee4d2d] border-[#ee4d2d]/30' },
    { id: 'amazon', name: 'Amazon', icon: Globe, colorClass: 'bg-[#ff9900]/10 text-[#ff9900] border-[#ff9900]/30' },
    { id: 'tiktok', name: 'TikTok Shop', icon: Activity, colorClass: 'bg-black/5 text-foreground border-border' },
  ];

  if (!selectedPlatform) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-foreground">📦 Encomendas em Trânsito</h2>
          <p className="text-muted-foreground text-sm">Selecione o marketplace para monitorar pacotes enviados (Shipped) que ainda não foram entregues ao cliente.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {platforms.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedPlatform(p.id)}
              className={`p-6 rounded-2xl border bg-card hover:bg-muted/50 transition-all text-left group relative overflow-hidden flex flex-col items-center text-center gap-4 ${p.colorClass}`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="p-4 rounded-full bg-background shadow-sm group-hover:scale-110 transition-transform duration-300">
                <p.icon className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-bold text-lg">{p.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 font-medium">Rastrear Pacotes</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-right-8 duration-300">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedPlatform(null)} className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <ChevronRight className="w-5 h-5 rotate-180" />
          </button>
          <h2 className="text-xl font-bold text-foreground capitalize flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" /> {platforms.find(p => p.id === selectedPlatform)?.name} - Em Trânsito
          </h2>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-12 text-center">
        <div className="relative w-16 h-16 mx-auto mb-4">
          <Truck className="w-full h-full text-muted-foreground opacity-20 absolute" />
          <Activity className="w-6 h-6 text-primary absolute bottom-0 right-0 animate-pulse" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Conexão em Desenvolvimento</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          A API específica para a busca de pacotes em trânsito e leitura de rastreio no {platforms.find(p => p.id === selectedPlatform)?.name} está mapeada.<br/><br/>
          Em breve, você acompanhará todos os pacotes aqui em tempo real.
        </p>
      </div>
    </div>
  );
}
