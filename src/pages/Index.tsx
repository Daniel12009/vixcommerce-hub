import { useState } from 'react';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { LoadingScreen } from '@/components/layout/LoadingScreen';
import { DashboardPage } from '@/components/modules/DashboardPage';
import { EstoquePage } from '@/components/modules/EstoquePage';
import { FinanceiroPage } from '@/components/modules/FinanceiroPage';
import { CadastroPage } from '@/components/modules/CadastroPage';
import { MarketingPage } from '@/components/modules/MarketingPage';
import { AtualizarDadosPage } from '@/components/modules/AtualizarDadosPage';
import { DevolucaoPage } from '@/components/modules/DevolucaoPage';
import { SheetsDataProvider, useSheetsData } from '@/contexts/SheetsDataContext';
import type { ModuleName } from '@/lib/types';

function AppContent() {
  const [activeModule, setActiveModule] = useState<ModuleName>('dashboard');
  const { isLoaded } = useSheetsData();

  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard': return <DashboardPage />;
      case 'atualizar': return <AtualizarDadosPage />;
      case 'estoque': return <EstoquePage />;
      case 'devolucao': return <DevolucaoPage />;
      case 'financeiro': return <FinanceiroPage />;
      case 'cadastro': return <CadastroPage />;
      case 'marketing': return <MarketingPage />;
    }
  };

  if (!isLoaded) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar activeModule={activeModule} onModuleChange={setActiveModule} />
      <main className="ml-64 p-8">
        {renderModule()}
      </main>
    </div>
  );
}

const Index = () => {
  return (
    <SheetsDataProvider>
      <AppContent />
    </SheetsDataProvider>
  );
};

export default Index;
