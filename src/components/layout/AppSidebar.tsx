import { BarChart3, Package, DollarSign, FileText, Megaphone, Activity, Settings, RotateCcw, LogOut } from 'lucide-react';
import type { ModuleName } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';

interface AppSidebarProps {
  activeModule: ModuleName;
  onModuleChange: (module: ModuleName) => void;
}

const modules = [
  { id: 'dashboard' as ModuleName, label: 'Dashboard', icon: BarChart3 },
  { id: 'atualizar' as ModuleName, label: 'Performance', icon: Activity },
  { id: 'estoque' as ModuleName, label: 'Estoque', icon: Package },
  { id: 'devolucao' as ModuleName, label: 'Devolução', icon: RotateCcw },
  { id: 'financeiro' as ModuleName, label: 'Financeiro', icon: DollarSign },
  { id: 'cadastro' as ModuleName, label: 'Ficha Técnica', icon: FileText },
  { id: 'marketing' as ModuleName, label: 'Ads / Marketing', icon: Megaphone },
];

export function AppSidebar({ activeModule, onModuleChange }: AppSidebarProps) {
  const { user, logout } = useAuth();

  const initials = user?.nome
    ? user.nome.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : user?.username?.slice(0, 2) || 'U';

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-lg vix-gradient flex items-center justify-center">
          <span className="text-sidebar-primary-foreground font-bold text-sm">VP</span>
        </div>
        <div>
          <h1 className="text-sidebar-primary-foreground font-bold text-lg leading-tight">VixPainel</h1>
          <p className="text-sidebar-foreground text-xs opacity-60">Gestão E-commerce</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {modules.map((mod) => {
          const isActive = activeModule === mod.id;
          const Icon = mod.icon;
          return (
            <button
              key={mod.id}
              onClick={() => onModuleChange(mod.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {mod.label}
            </button>
          );
        })}
      </nav>

      {/* Footer - User info */}
      <div className="px-3 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center">
            <span className="text-sidebar-accent-foreground text-xs font-semibold">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sidebar-primary-foreground text-sm font-medium truncate">{user?.nome || user?.username || 'Usuário'}</p>
            <p className="text-sidebar-foreground text-xs opacity-60">{user?.setor || 'Sem setor'}</p>
          </div>
          <div className="flex items-center gap-1">
            {user?.role === 'admin' && (
              <button
                onClick={() => onModuleChange('usuarios')}
                className="p-1 rounded hover:bg-sidebar-accent transition-colors"
                title="Gerenciar Usuários"
              >
                <Settings className="w-4 h-4 text-sidebar-foreground opacity-60 hover:opacity-100 transition-opacity" />
              </button>
            )}
            <button
              onClick={logout}
              className="p-1 rounded hover:bg-sidebar-accent transition-colors"
              title="Sair"
            >
              <LogOut className="w-4 h-4 text-sidebar-foreground opacity-40 hover:opacity-100 transition-opacity" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
