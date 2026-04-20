import { useState, useEffect } from 'react';
import { FileSpreadsheet, Users, Key, Wifi, Loader2, CheckCircle, PlugZap, Zap, Clock } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserManagementPage } from '@/components/auth/UserManagementPage';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PlanilhasConfigSection } from './PlanilhasConfigSection';
import { ApiConfigSection } from './ApiConfigSection';
import { MarketplaceSourceConfig } from './MarketplaceSourceConfig';
import { SyncTestPanel } from './SyncTestPanel';
import { CronJobsTab } from './CronJobsTab';

export function ConfiguracoesPage() {
  const [tab, setTab] = useState('planilhas');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Planilhas, integrações e gerenciamento de usuários"
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-6 mt-6">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="planilhas"><FileSpreadsheet className="w-4 h-4 mr-1.5" /> Planilhas</TabsTrigger>
          {isAdmin && <TabsTrigger value="api"><Key className="w-4 h-4 mr-1.5" /> API / Tokens</TabsTrigger>}
          {isAdmin && <TabsTrigger value="usuarios"><Users className="w-4 h-4 mr-1.5" /> Usuários</TabsTrigger>}
          <TabsTrigger value="fonte"><PlugZap className="w-4 h-4 mr-1.5" /> Fonte de Dados</TabsTrigger>
          <TabsTrigger value="sync"><Zap className="w-4 h-4 mr-1.5" /> Sync Teste</TabsTrigger>
          {isAdmin && <TabsTrigger value="cron"><Clock className="w-4 h-4 mr-1.5" /> Cron Jobs</TabsTrigger>}
        </TabsList>

        {/* ═══ PLANILHAS TAB ═══ */}
        <TabsContent value="planilhas">
          <PlanilhasConfigSection />
        </TabsContent>

        {/* ═══ API / TOKENS TAB ═══ */}
        {isAdmin && (
          <TabsContent value="api">
            <ApiConfigSection />
          </TabsContent>
        )}

        {/* ═══ USUÁRIOS TAB ═══ */}
        {isAdmin && (
          <TabsContent value="usuarios">
            <UserManagementPage onBack={() => setTab('planilhas')} />
          </TabsContent>
        )}

        {/* ═══ FONTE DE DADOS TAB ═══ */}
        <TabsContent value="fonte">
          <MarketplaceSourceConfig />
        </TabsContent>

        {/* ═══ SYNC TESTE TAB ═══ */}
        <TabsContent value="sync">
          <SyncTestPanel />
        </TabsContent>

        {/* ═══ CRON JOBS TAB (admin only) ═══ */}
        {isAdmin && (
          <TabsContent value="cron">
            <CronJobsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
