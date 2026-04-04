import { useState, useEffect } from 'react';
import { FileSpreadsheet, Users, Key, Wifi, Loader2, CheckCircle, PlugZap, Zap } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserManagementPage } from '@/components/auth/UserManagementPage';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { PlanilhasConfigSection } from './PlanilhasConfigSection';
import { ApiConfigSection } from './ApiConfigSection';
import { MarketplaceSourceConfig } from './MarketplaceSourceConfig';
import { SyncTestPanel } from './SyncTestPanel';

export function ConfiguracoesPage() {
  const [tab, setTab] = useState('planilhas');
  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Planilhas, integrações e gerenciamento de usuários"
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-6 mt-6">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="planilhas"><FileSpreadsheet className="w-4 h-4 mr-1.5" /> Planilhas</TabsTrigger>
          <TabsTrigger value="api"><Key className="w-4 h-4 mr-1.5" /> API / Tokens</TabsTrigger>
          <TabsTrigger value="usuarios"><Users className="w-4 h-4 mr-1.5" /> Usuários</TabsTrigger>
          <TabsTrigger value="fonte"><PlugZap className="w-4 h-4 mr-1.5" /> Fonte de Dados</TabsTrigger>
          <TabsTrigger value="sync"><Zap className="w-4 h-4 mr-1.5" /> Sync Teste</TabsTrigger>
        </TabsList>

        {/* ═══ PLANILHAS TAB ═══ */}
        <TabsContent value="planilhas">
          <PlanilhasConfigSection />
        </TabsContent>

        {/* ═══ API / TOKENS TAB ═══ */}
        <TabsContent value="api">
          <ApiConfigSection />
        </TabsContent>

        {/* ═══ USUÁRIOS TAB ═══ */}
        <TabsContent value="usuarios">
          <UserManagementPage onBack={() => setTab('planilhas')} />
        </TabsContent>

        {/* ═══ FONTE DE DADOS TAB ═══ */}
        <TabsContent value="fonte">
          <MarketplaceSourceConfig />
        </TabsContent>

        {/* ═══ SYNC TESTE TAB ═══ */}
        <TabsContent value="sync">
          <SyncTestPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
