import { useState, useEffect, useRef } from 'react';
import { Menu, Shield } from 'lucide-react';
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
import { WelcomeModal } from '@/components/layout/WelcomeModal';
import { AtendimentoPage } from '@/components/modules/AtendimentoPage';
import { MetasPage } from '@/components/modules/MetasPage';
import { ComprasPage } from '@/components/modules/compras/ComprasPage';
import { MarketIntelligence } from '@/components/modules/mercado/MarketIntelligence';
import { TarefasPage } from '@/components/modules/TarefasPage';
import { SheetsDataProvider, useSheetsData } from '@/contexts/SheetsDataContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import type { ModuleName } from '@/lib/types';

function AppContent() {
  const [activeModule, setActiveModule] = useState<ModuleName>('dashboard');
  const { isLoaded } = useSheetsData();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [showSplash, setShowSplash] = useState(false);
  const wasAuthenticated = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  const checkAccess = (modId: string) => {
    if (user?.role === 'admin') return true;
    if (['dashboard', 'configuracoes', 'usuarios'].includes(modId)) return true;
    const allowed = user?.allowed_modules || [];
    return allowed.includes(modId);
  };

  const renderModule = () => {
    if (!checkAccess(activeModule)) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4 animate-in fade-in zoom-in duration-300">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
            <Shield className="w-8 h-8 text-red-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Acesso Restrito</h2>
            <p className="text-muted-foreground mt-1 max-w-sm mx-auto">Sua conta não tem permissão para visualizar este módulo. Solicite acesso a um administrador.</p>
          </div>
          <button onClick={() => setActiveModule('dashboard')} className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity">
            Voltar ao Início
          </button>
        </div>
      );
    }

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
      case 'compras': return <ComprasPage />;
      case 'mercado': return <MarketIntelligence />;
      case 'tarefas': return <TarefasPage />;
      case 'usuarios': return <UserManagementPage onBack={() => setActiveModule('configuracoes')} />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <WelcomeModal />
      <AppSidebar
        activeModule={activeModule}
        onModuleChange={setActiveModule}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Mobile top bar with hamburger */}
      <div className="fixed top-0 left-0 right-0 z-30 flex items-center gap-3 px-4 py-3 bg-background/95 backdrop-blur-sm border-b border-border lg:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
        >
          <Menu className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex items-center gap-2">
          <img src="/nexusiq-icon.png" alt="NexusIQ" className="w-7 h-7 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
          <span className="text-foreground font-semibold text-sm">NexusIQ</span>
        </div>
      </div>

      <main className="lg:ml-64 p-4 pt-16 lg:p-8 lg:pt-8">
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
