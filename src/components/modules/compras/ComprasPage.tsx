import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Package, LineChart, MessageSquare, AlertTriangle, TrendingUp, RefreshCw } from 'lucide-react';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import { ComprasDashboard } from './ComprasDashboard';
// import { ComprasComparativo } from './ComprasComparativo'; // We will create this later

type TabType = 'dashboard' | 'comparativo';

export function ComprasPage() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const { comprasItems, refreshingModule, refreshModule } = useSheetsData();

  const isRefreshing = refreshingModule === 'compras';

  const handleRefresh = () => {
    refreshModule('compras');
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Compras e S&OP" 
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex bg-muted/50 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'dashboard'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <LineChart className="w-4 h-4" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('comparativo')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'comparativo'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Comparativo & AI
          </button>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Sincronizando...' : 'Sincronizar Dados'}
        </button>
      </div>

      {!comprasItems || comprasItems.length === 0 ? (
        <Card className="p-8 flex flex-col items-center justify-center text-center border-dashed">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Package className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold mb-2">Sem dados de Compras</h2>
          <p className="text-muted-foreground max-w-md mb-6">
            Não encontramos dados de estimativas e S&OP. Por favor, conecte ou atualize sua planilha de compras.
          </p>
        </Card>
      ) : (
        <div className="mt-6">
          {activeTab === 'dashboard' && <ComprasDashboard data={comprasItems} />}
          {activeTab === 'comparativo' && (
            <Card className="p-8 flex flex-col items-center justify-center text-center">
              <MessageSquare className="w-12 h-12 text-muted-foreground mb-4" />
              <h2 className="text-xl font-bold mb-2">Assistente AI em Desenvolvimento</h2>
              <p className="text-muted-foreground max-w-md">
                A aba de comparativo e assistente AI para pedidos será implementada na próxima fase.
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
