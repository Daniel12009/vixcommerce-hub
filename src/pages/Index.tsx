import { useState, useEffect, useRef } from 'react';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { LoadingScreen } from '@/components/layout/LoadingScreen';
import { LoginPage } from '@/components/auth/LoginPage';
import { DashboardPage } from '@/components/modules/DashboardPage';
import { EstoquePage } from '@/components/modules/EstoquePage';
import { FinanceiroPage } from '@/components/modules/FinanceiroPage';
import { CadastroPage } from '@/components/modules/CadastroPage';
import { MarketingPage } from '@/components/modules/MarketingPage';
import { AtualizarDadosPage } from '@/components/modules/AtualizarDadosPage';
import { DevolucaoPage } from '@/components/modules/DevolucaoPage';
import { UserManagementPage } from '@/components/auth/UserManagementPage';
import { ConfiguracoesPage } from '@/components/modules/ConfiguracoesPage';
import { AtendimentoPage } from '@/components/modules/AtendimentoPage';
import { MetasPage } from '@/components/modules/MetasPage';
import { SheetsDataProvider, useSheetsData } from '@/contexts/SheetsDataContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import type { ModuleName } from '@/lib/types';

function AppContent() {
  const [activeModule, setActiveModule] = useState<ModuleName>('dashboard');
  const { isLoaded } = useSheetsData();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [showSplash, setShowSplash] = useState(false);
  const wasAuthenticated = useRef(false);

  // Show splash screen briefly after login
  useEffect(() => {
    if (isAuthenticated && !wasAuthenticated.current) {
      wasAuthenticated.current = true;
      setShowSplash(true);
      const timer = setTimeout(() => setShowSplash(false), 2500);
      return () => clearTimeout(timer);
    }
    if (!isAuthenticated) {
      wasAuthenticated.current = false;
    }
  }, [isAuthenticated]);

  // Show login page if not authenticated
  if (!authLoading && !isAuthenticated) {
    return <LoginPage />;
  }

  // Show loading screen with motivational phrases after login or during auth check
  if (authLoading || showSplash || !isLoaded) {
    return <LoadingScreen />;
  }

  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard': return <DashboardPage />;
      case 'atualizar': return <AtualizarDadosPage />;
      case 'estoque': return <EstoquePage />;
      case 'devolucao': return <DevolucaoPage />;
      case 'financeiro': return <FinanceiroPage />;
      case 'cadastro': return <CadastroPage />;
      case 'marketing': return <MarketingPage />;
      case 'configuracoes': return <ConfiguracoesPage />;
      case 'atendimento': return <AtendimentoPage />;
      case 'metas': return <MetasPage />;
      case 'usuarios': return <UserManagementPage onBack={() => setActiveModule('configuracoes')} />;
    }
  };

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
    <AuthProvider>
      <SheetsDataProvider>
        <AppContent />
      </SheetsDataProvider>
    </AuthProvider>
  );
};

export default Index;
