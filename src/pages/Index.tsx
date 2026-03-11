import { useState } from 'react';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { DashboardPage } from '@/components/modules/DashboardPage';
import { EstoquePage } from '@/components/modules/EstoquePage';
import { FinanceiroPage } from '@/components/modules/FinanceiroPage';
import { CadastroPage } from '@/components/modules/CadastroPage';
import { MarketingPage } from '@/components/modules/MarketingPage';
import { AtualizarDadosPage } from '@/components/modules/AtualizarDadosPage';
import { SheetsDataProvider } from '@/contexts/SheetsDataContext';
import type { ModuleName } from '@/lib/types';

const Index = () => {
  const [activeModule, setActiveModule] = useState<ModuleName>('dashboard');

  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard': return <DashboardPage />;
      case 'atualizar': return <AtualizarDadosPage />;
      case 'estoque': return <EstoquePage />;
      case 'financeiro': return <FinanceiroPage />;
      case 'cadastro': return <CadastroPage />;
      case 'marketing': return <MarketingPage />;
    }
  };

  return (
    <SheetsDataProvider>
      <div className="min-h-screen bg-background">
        <AppSidebar activeModule={activeModule} onModuleChange={setActiveModule} />
        <main className="ml-64 p-8">
          {renderModule()}
        </main>
      </div>
    </SheetsDataProvider>
  );
};

export default Index;
