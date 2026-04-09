/**
 * PlanilhasConfigSection — full planilhas management UI (add, edit, import, preview)
 * Extracted from AtualizarDadosPage for use in Configurações → Planilhas tab.
 */
import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, FileSpreadsheet, Loader2, Download, Settings2, ArrowRight, Check, RefreshCw, Package, DollarSign, ShoppingCart } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import {
  type SheetConfig, type ModuloDestino,
  CAMPOS_POR_MODULO, loadSheetConfigs, saveSheetConfigs,
  saveSheetConfigsToCloud, loadSheetConfigsFromCloud,
  extractSpreadsheetId, parseSheetRowsWithFixos,
} from '@/lib/sheets-store';
import { saveToCloud, loadFromCloud, syncVendasIncremental } from '@/lib/persistence';

const moduloLabels: Record<ModuloDestino, string> = {
  estoque: 'Estoque',
  'estoque-full': 'Estoque Full (ML)',
  'estoque-tiny': 'Estoque Tiny (Local)',
  financeiro: 'Financeiro',
  vendas: 'Vendas / Pedidos',
  'vendas-7d': 'Vendas 7 Dias (Estoque)',
  performance: 'Performance Anúncios',
  ads: 'Performance ADS',
  devolucao: 'Devoluções',
  'marketplace-dia': 'Marketplace (Rentabilidade)',
  calculadora: 'Calculadora (CMV)',
  compras: 'Compras (S&OP)',
  atividades: 'Atividades (Equipe)',
};

const moduloColors: Record<ModuloDestino, string> = {
  estoque: 'bg-[hsl(var(--vix-info)/0.1)] text-[hsl(var(--vix-info))]',
  'estoque-full': 'bg-[hsl(var(--vix-info)/0.1)] text-[hsl(var(--vix-info))]',
  'estoque-tiny': 'bg-[hsl(200,80%,50%,0.1)] text-[hsl(200,80%,50%)]',
  financeiro: 'bg-[hsl(var(--vix-success)/0.1)] text-[hsl(var(--vix-success))]',
  vendas: 'bg-[hsl(var(--vix-warning)/0.1)] text-[hsl(var(--vix-warning))]',
  'vendas-7d': 'bg-[hsl(38,92%,50%,0.1)] text-[hsl(38,92%,50%)]',
  performance: 'bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]',
  ads: 'bg-[hsl(142,76%,36%,0.1)] text-[hsl(142,76%,36%)]',
  devolucao: 'bg-[hsl(0,72%,50%,0.1)] text-[hsl(0,72%,50%)]',
  'marketplace-dia': 'bg-[hsl(270,70%,55%,0.1)] text-[hsl(270,70%,55%)]',
  calculadora: 'bg-[hsl(220,70%,55%,0.1)] text-[hsl(220,70%,55%)]',
  compras: 'bg-[hsl(180,70%,55%,0.1)] text-[hsl(180,70%,55%)]',
  atividades: 'bg-rose-500/10 text-rose-500',
};

export function PlanilhasConfigSection() {
  const sheetsData = useSheetsData();

  // Google Sheets state
  const [sheetConfigs, setSheetConfigs] = useState<SheetConfig[]>(() => loadSheetConfigs());
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetInfo, setSheetInfo] = useState<{ title: string; sheets: string[] } | null>(null);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<string[][] | null>(null);
  const [importingConfig, setImportingConfig] = useState<string | null>(null);

  // New config form state
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const [newConfigAba, setNewConfigAba] = useState('');
  const [newConfigModulo, setNewConfigModulo] = useState<ModuloDestino>('estoque');
  const [newConfigMapping, setNewConfigMapping] = useState<Record<string, string>>({});
  const [newConfigLinhaInicial, setNewConfigLinhaInicial] = useState(1);
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [mappingHeaders, setMappingHeaders] = useState<string[]>([]);
  const [newConfigValoresFixos, setNewConfigValoresFixos] = useState<Record<string, string>>({});
  const [customColumns, setCustomColumns] = useState<{ id: string; targetName: string; selectedSourceColumn: string }[]>([]);

  // Persist configs to localStorage AND Supabase
  const cloudReady = useRef(false);
  useEffect(() => {
    saveSheetConfigs(sheetConfigs);
    if (cloudReady.current) {
      saveSheetConfigsToCloud(sheetConfigs);
    }
  }, [sheetConfigs]);

  // On mount: load configs from Supabase
  const hasLoadedCloud = useRef(false);
  useEffect(() => {
    if (hasLoadedCloud.current) return;
    hasLoadedCloud.current = true;
    loadSheetConfigsFromCloud().then(cloudConfigs => {
      let configs = (cloudConfigs && cloudConfigs.length > 0) ? cloudConfigs : loadSheetConfigs();
      if (!configs.find(c => c.moduloDestino === 'devolucao')) {
        const devolDefault: SheetConfig = {
          id: 'devolucao-default',
          url: 'https://docs.google.com/spreadsheets/d/10hZH2Nmc926zUHsJa5MHFYy3NJb40DgjNXyGEFByHoQ/edit',
          nome: 'Devoluções',
          spreadsheetId: '10hZH2Nmc926zUHsJa5MHFYy3NJb40DgjNXyGEFByHoQ',
          abaNome: 'TODOS',
          moduloDestino: 'devolucao',
          linhaInicial: 1,
          mapeamento: {
            dataPlanilha: 'DATA DA PLANILHA', plataforma: 'PLATAFORMA', dataAprovacao: 'data Aprovação',
            valorReembolso: 'Valor do Reembolso', pedido: 'PEDIDO', anuncio: 'ANÚNCIO',
            skuProduto: 'SKU PRODUTO', statusDevolucao: 'STATUS DA DEVOLUÇÃO',
            acaoAposDevolucao: 'AÇÃO APÓS DEVOLUÇÃO (SE NECESSÁRIO)',
            devolucaoGeradaPor: 'DEVOLUÇÃO GERADA POR (PLATAFORMA OU MELHOR ENVIO)',
            rastreioCorreios: 'RASTREIO CORREIOS', motivo: 'MOTIVO',
            detalhesMotivo: 'DETALHES DO MOTIVO', novoMotivo: 'NOVO MOTIVO', detalhe: 'DETALHE',
            setor: 'SETOR', custoDevolucao: 'CUSTO DEVOLUÇÃO',
            comissaoNaoDevolvida: 'COMISSÃO NÃO DEVOLVIDA', custo: 'CUSTO', quantidade: 'QTDE',
            situacaoMercadoria: 'SITUAÇÃO DA MERCADORIA', totalCustoMercadoria: 'TOTAL CUSTO MERCADORIA',
            formaReembolso: 'FORMA DE REEMBOLSO', dataReembolso: 'DATA REEMBOLSO',
            depositoDevolucao: 'DEPÓSITO DA DEVOLUÇÃO', notaFiscalDevolucao: 'NOTA FISCAL DEVOLUÇÃO',
            colaborador: 'COLABORADOR', retornoDevolucao: 'RETORNO DA DEVOLUÇÃO',
          },
        };
        configs = [...configs, devolDefault];
      }
      cloudReady.current = true;
      setSheetConfigs(configs);
    });
  }, []);

  // --- Handlers ---
  const handleLoadSheetInfo = async () => {
    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    if (!spreadsheetId) { toast.error('URL inválida. Cole a URL completa da planilha Google.'); return; }
    setLoadingSheet(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'info', spreadsheetId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSheetInfo({ title: data.properties?.title || 'Sem título', sheets: data.sheets?.map((s: any) => s.properties?.title) || [] });
      toast.success(`Planilha "${data.properties?.title}" conectada!`);
    } catch (err: any) { toast.error(`Erro: ${err.message}`); }
    finally { setLoadingSheet(false); }
  };

  const handleFetchHeadersForMapping = async (abaNome: string, existingMapping?: Record<string, string>, existingFixos?: Record<string, string>) => {
    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    if (!spreadsheetId) return;
    setLoadingSheet(true);
    try {
      const headerRow = newConfigLinhaInicial;
      const { data, error } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'read', spreadsheetId, range: `${abaNome}!${headerRow}:${headerRow}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const headers = data.values?.[0] || [];
      setMappingHeaders(headers);
      if (existingMapping) {
        setNewConfigMapping(existingMapping);
        setNewConfigValoresFixos(existingFixos || {});
        const camposPadraoKeys = CAMPOS_POR_MODULO[newConfigModulo].map(c => c.key);
        const mappedCustoms = Object.entries(existingMapping)
          .filter(([k]) => !camposPadraoKeys.includes(k))
          .map(([k, v]) => ({ id: `cust_${Date.now()}_${Math.random()}`, targetName: k, selectedSourceColumn: v }));
        setCustomColumns(mappedCustoms);
      } else {
        setNewConfigMapping({}); setNewConfigValoresFixos({}); setCustomColumns([]);
      }
      setShowMappingDialog(true);
    } catch (err: any) { toast.error(`Erro ao ler cabeçalhos: ${err.message}`); }
    finally { setLoadingSheet(false); }
  };

  const handleEditConfig = (config: SheetConfig) => {
    setEditingConfigId(config.id);
    setSheetUrl(config.url);
    setSheetInfo({ title: config.nome.split(' — ')[0], sheets: [config.abaNome] });
    setNewConfigAba(config.abaNome);
    setNewConfigModulo(config.moduloDestino);
    setNewConfigLinhaInicial(config.linhaInicial);
    handleFetchHeadersForMapping(config.abaNome, config.mapeamento, config.valoresFixos);
  };

  const handleSaveConfig = () => {
    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    if (!spreadsheetId || !newConfigAba || !newConfigModulo) return;
    const campos = CAMPOS_POR_MODULO[newConfigModulo];
    const obrigatorios = campos.filter(c => c.obrigatorio);
    const faltando = obrigatorios.filter(c => !newConfigMapping[c.key] && !newConfigValoresFixos[c.key]);
    if (faltando.length > 0) { toast.error(`Mapeie os campos obrigatórios: ${faltando.map(f => f.label).join(', ')}`); return; }
    const finalMapping = { ...newConfigMapping };
    customColumns.forEach(cc => {
      if (cc.targetName.trim() && cc.selectedSourceColumn && cc.selectedSourceColumn !== '__none__') {
        finalMapping[cc.targetName.trim()] = cc.selectedSourceColumn;
      }
    });
    const fixos: Record<string, string> = {};
    for (const [k, v] of Object.entries(newConfigValoresFixos)) { if (v.trim()) fixos[k] = v.trim(); }
    const config: SheetConfig = {
      id: editingConfigId ? editingConfigId : `${spreadsheetId}_${newConfigAba}_${Date.now()}`,
      url: sheetUrl, nome: `${sheetInfo?.title || 'Planilha'} — ${newConfigAba}`,
      spreadsheetId, abaNome: newConfigAba, moduloDestino: newConfigModulo,
      mapeamento: finalMapping, valoresFixos: Object.keys(fixos).length > 0 ? fixos : undefined,
      linhaInicial: newConfigLinhaInicial,
    };
    if (editingConfigId) {
      setSheetConfigs(prev => prev.map(c => c.id === editingConfigId ? config : c));
      toast.success(`Configuração atualizada: ${newConfigAba}`);
    } else {
      setSheetConfigs(prev => [...prev, config]);
      toast.success(`Configuração salva: ${newConfigAba} → ${moduloLabels[newConfigModulo]}`);
    }
    setShowMappingDialog(false); setEditingConfigId(null); setNewConfigMapping({}); setNewConfigValoresFixos({});
    setCustomColumns([]); setNewConfigAba(''); setSheetUrl(''); setSheetInfo(null);
  };

  const handleRemoveConfig = (id: string) => {
    setSheetConfigs(prev => prev.filter(c => c.id !== id));
    if (selectedConfig === id) setSelectedConfig(null);
  };

  const handleImportConfig = async (config: SheetConfig) => {
    setImportingConfig(config.id);
    try {
      const startRow = config.linhaInicial || 1;
      const { data, error } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'read', spreadsheetId: config.spreadsheetId, range: `${config.abaNome}!A${startRow}:BZ` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const allRows = data.values || [];
      if (allRows.length < 2) { toast.error('Planilha sem dados.'); return; }
      const headers = allRows[0];
      const rows = allRows.slice(1);
      const parsed = parseSheetRowsWithFixos(headers, rows, config.mapeamento, config.valoresFixos);
      if (config.moduloDestino === 'estoque') { sheetsData.setEstoqueFromSheet(parsed); saveToCloud('estoque_data', parsed); }
      else if (config.moduloDestino === 'estoque-full') { sheetsData.setEstoqueFullFromSheet(parsed); saveToCloud('estoque_full_data', parsed); }
      else if (config.moduloDestino === 'estoque-tiny') { sheetsData.setEstoqueTinyFromSheet(parsed); saveToCloud('estoque_tiny_data', parsed); }
      else if (config.moduloDestino === 'financeiro') { sheetsData.setFinanceiroFromSheet(parsed); saveToCloud('financeiro_data', parsed); }
      else if (config.moduloDestino === 'vendas') { sheetsData.setVendasFromSheet(parsed); syncVendasIncremental(parsed).catch(console.warn); }
      else if (config.moduloDestino === 'performance') {
        sheetsData.setPerformanceFromSheet(parsed, config.abaNome);
        const existing = await loadFromCloud<any[]>('performance_data') || [];
        const contaKey = config.abaNome;
        const merged = [...existing.filter((p: any) => p.conta !== contaKey), ...parsed.map(p => ({ ...p, conta: contaKey }))];
        saveToCloud('performance_data', merged);
      }
      else if (config.moduloDestino === 'ads') { sheetsData.setAdsFromSheet(parsed); saveToCloud('ads_data', parsed); }
      else if (config.moduloDestino === 'devolucao') { sheetsData.setDevolucaoFromSheet(parsed); saveToCloud('devolucao_data', parsed); }
      else if (config.moduloDestino === 'atividades') { sheetsData.setAtividadesFromSheet(parsed); saveToCloud('atividades_data', parsed); }
      setSheetConfigs(prev => prev.map(c => c.id === config.id ? { ...c, ultimaSync: new Date().toLocaleString('pt-BR') } : c));
      toast.success(`${parsed.length} linhas importadas para ${moduloLabels[config.moduloDestino]}!`);
    } catch (err: any) { toast.error(`Erro ao importar: ${err.message}`); }
    finally { setImportingConfig(null); }
  };

  const handlePreviewConfig = async (config: SheetConfig) => {
    setSelectedConfig(config.id);
    setLoadingSheet(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'read', spreadsheetId: config.spreadsheetId, range: `${config.abaNome}!A1:Z20` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPreviewData(data.values || []);
    } catch (err: any) { toast.error(`Erro: ${err.message}`); setPreviewData(null); }
    finally { setLoadingSheet(false); }
  };

  // Summary cards by module
  const moduleSummary = sheetConfigs.reduce<Record<string, number>>((acc, c) => {
    acc[c.moduloDestino] = (acc[c.moduloDestino] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      {sheetConfigs.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(moduleSummary).map(([mod, count]) => (
            <div key={mod} className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{count}</p>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${moduloColors[mod as ModuloDestino]}`}>
                {moduloLabels[mod as ModuloDestino]}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Configs list + Add new */}
        <div className="space-y-4">
          {/* Saved configs */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-foreground font-semibold text-sm mb-3 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              Fontes Configuradas ({sheetConfigs.length})
            </h3>
            {sheetConfigs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma fonte configurada. Conecte uma planilha abaixo.</p>
            ) : (
              <div className="space-y-2">
                {sheetConfigs.map(config => (
                  <div
                    key={config.id}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors border ${selectedConfig === config.id ? 'border-primary/30 bg-primary/5' : 'border-transparent hover:bg-muted'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button onClick={() => handlePreviewConfig(config)} className="flex-1 text-left">
                        <p className="font-medium text-foreground truncate text-xs">{config.nome}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${moduloColors[config.moduloDestino]}`}>
                            {moduloLabels[config.moduloDestino]}
                          </span>
                          <span className="text-[10px] text-muted-foreground">Aba: {config.abaNome}</span>
                          {config.mapeamento && (
                            <span className="text-[10px] text-muted-foreground">{Object.keys(config.mapeamento).length} cols</span>
                          )}
                        </div>
                        {config.ultimaSync && (
                          <p className="text-[10px] text-muted-foreground mt-1">Última sync: {config.ultimaSync}</p>
                        )}
                      </button>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => handleImportConfig(config)} disabled={importingConfig === config.id}
                          className="p-1 rounded hover:bg-primary/10 text-primary transition-colors" title="Importar dados">
                          {importingConfig === config.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => handleRemoveConfig(config.id)}
                          className="p-1 rounded hover:bg-[hsl(var(--vix-danger)/0.1)] text-muted-foreground hover:text-[hsl(var(--vix-danger))] transition-colors" title="Remover">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleEditConfig(config)} disabled={!!importingConfig}
                          className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="Editar mapeamento">
                          <Settings2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Import all button */}
            {sheetConfigs.length > 0 && (
              <button
                onClick={() => sheetConfigs.forEach(c => handleImportConfig(c))}
                disabled={!!importingConfig}
                className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${importingConfig ? 'animate-spin' : ''}`} />
                Importar Tudo
              </button>
            )}
          </div>

          {/* Connect new sheet */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-foreground font-semibold text-sm mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" />
              Adicionar Fonte
            </h3>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">URL da Planilha Google</Label>
                <Input
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={sheetUrl}
                  onChange={e => { setSheetUrl(e.target.value); setSheetInfo(null); }}
                  className="text-xs"
                />
              </div>
              <button
                onClick={handleLoadSheetInfo}
                disabled={!sheetUrl || loadingSheet}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50"
              >
                {loadingSheet && !showMappingDialog ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                Conectar Planilha
              </button>

              {/* After connection: pick tab + module */}
              {sheetInfo && (
                <div className="space-y-3 pt-3 border-t border-border">
                  <p className="text-xs font-medium text-foreground">{sheetInfo.title}</p>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Aba da Planilha</Label>
                    <Select value={newConfigAba} onValueChange={v => setNewConfigAba(v)}>
                      <SelectTrigger className="text-xs"><SelectValue placeholder="Selecione a aba" /></SelectTrigger>
                      <SelectContent>
                        {sheetInfo.sheets.filter(s => s.trim() !== '').map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Destino dos Dados</Label>
                    <Select value={newConfigModulo} onValueChange={v => setNewConfigModulo(v as ModuloDestino)}>
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="estoque">📦 Estoque</SelectItem>
                        <SelectItem value="estoque-full">📦 Estoque Full (ML)</SelectItem>
                        <SelectItem value="estoque-tiny">🏠 Estoque Tiny (Local)</SelectItem>
                        <SelectItem value="financeiro">💰 Financeiro</SelectItem>
                        <SelectItem value="vendas">🛒 Vendas / Pedidos</SelectItem>
                        <SelectItem value="performance">📊 Performance Anúncios</SelectItem>
                        <SelectItem value="ads">📈 Performance ADS</SelectItem>
                        <SelectItem value="devolucao">🔄 Devoluções</SelectItem>
                        <SelectItem value="marketplace-dia">📊 Marketplace (Rentabilidade)</SelectItem>
                        <SelectItem value="calculadora">🧮 Calculadora (CMV)</SelectItem>
                        <SelectItem value="compras">🛒 Compras (S&OP)</SelectItem>
                        <SelectItem value="atividades">👥 Atividades (Equipe)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Linha do Cabeçalho</Label>
                    <Input
                      type="number" min={1} value={newConfigLinhaInicial}
                      onChange={e => setNewConfigLinhaInicial(Math.max(1, parseInt(e.target.value) || 1))}
                      className="text-xs" placeholder="Ex: 7 (se dados começam na linha 7)"
                    />
                    <p className="text-[10px] text-muted-foreground">Linha onde estão os cabeçalhos das colunas</p>
                  </div>

                  <button
                    onClick={() => newConfigAba && handleFetchHeadersForMapping(newConfigAba)}
                    disabled={!newConfigAba || loadingSheet}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    Mapear Colunas
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Preview / Mapping Dialog */}
        <div className="lg:col-span-2 space-y-4">
          {/* Mapping Dialog */}
          {showMappingDialog && (
            <div className="bg-card border border-primary/20 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-foreground font-semibold text-sm">Mapear Colunas</h3>
                  <p className="text-xs text-muted-foreground">
                    Aba: <strong>{newConfigAba}</strong> → <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${moduloColors[newConfigModulo]}`}>{moduloLabels[newConfigModulo]}</span>
                  </p>
                </div>
              </div>

              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {CAMPOS_POR_MODULO[newConfigModulo].map(campo => {
                  const hasFixo = campo.key in newConfigValoresFixos;
                  const hasMapped = !!newConfigMapping[campo.key] && newConfigMapping[campo.key] !== '__none__';
                  return (
                    <div key={campo.key} className="space-y-1">
                      <div className="flex items-center gap-3">
                        <div className="w-1/3">
                          <span className="text-xs text-foreground">
                            {campo.label}
                            {campo.obrigatorio && <span className="text-[hsl(var(--vix-danger))] ml-0.5">*</span>}
                          </span>
                        </div>
                        <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <Select
                          value={hasFixo ? '__fixo__' : (newConfigMapping[campo.key] || '__none__')}
                          onValueChange={v => {
                            if (v === '__fixo__') {
                              setNewConfigMapping(prev => { const n = { ...prev }; delete n[campo.key]; return n; });
                              setNewConfigValoresFixos(prev => ({ ...prev, [campo.key]: prev[campo.key] || '' }));
                            } else {
                              setNewConfigValoresFixos(prev => { const n = { ...prev }; delete n[campo.key]; return n; });
                              setNewConfigMapping(prev => ({ ...prev, [campo.key]: v === '__none__' ? '' : v }));
                            }
                          }}
                        >
                          <SelectTrigger className="text-xs flex-1"><SelectValue placeholder="Selecione coluna" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Não mapear —</SelectItem>
                            <SelectItem value="__fixo__">📌 Valor Fixo</SelectItem>
                            {mappingHeaders.filter(h => h.trim() !== '').map(h => (
                              <SelectItem key={h} value={h}>{h}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {(hasMapped || hasFixo) && (
                          <Check className="w-4 h-4 text-[hsl(var(--vix-success))] flex-shrink-0" />
                        )}
                      </div>
                      {hasFixo && (
                        <div className="ml-[calc(33.33%+24px)]">
                          <Input
                            placeholder="Ex: VIAFLIX, GS, MONACO..."
                            value={newConfigValoresFixos[campo.key] || ''}
                            onChange={e => setNewConfigValoresFixos(prev => ({ ...prev, [campo.key]: e.target.value }))}
                            className="text-xs h-8"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Custom columns */}
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-foreground">Colunas Extras Personalizadas</h4>
                  <button
                    onClick={() => setCustomColumns(prev => [...prev, { id: `cust_${Date.now()}`, targetName: '', selectedSourceColumn: '' }])}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium bg-primary text-primary-foreground hover:opacity-90"
                  >
                    <Plus className="w-3 h-3" /> Adicionar Coluna
                  </button>
                </div>
                {customColumns.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhuma coluna extra adicionada.</p>
                ) : (
                  <div className="space-y-3">
                    {customColumns.map((col, idx) => (
                      <div key={col.id} className="flex items-center gap-2">
                        <Input placeholder="Nome do Campo" value={col.targetName}
                          onChange={e => setCustomColumns(prev => prev.map((c, i) => i === idx ? { ...c, targetName: e.target.value } : c))}
                          className="text-xs w-1/3" />
                        <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <Select value={col.selectedSourceColumn || '__none__'}
                          onValueChange={v => setCustomColumns(prev => prev.map((c, i) => i === idx ? { ...c, selectedSourceColumn: v === '__none__' ? '' : v } : c))}>
                          <SelectTrigger className="text-xs flex-1"><SelectValue placeholder="Selecione coluna" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Escolha a coluna —</SelectItem>
                            {mappingHeaders.filter(h => h.trim() !== '').map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <button onClick={() => setCustomColumns(prev => prev.filter((_, i) => i !== idx))}
                          className="p-1 rounded text-muted-foreground hover:text-[hsl(var(--vix-danger))] hover:bg-[hsl(var(--vix-danger)/0.1)] transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                <button
                  onClick={() => { setShowMappingDialog(false); setEditingConfigId(null); setNewConfigMapping({}); setNewConfigValoresFixos({}); setCustomColumns([]); setSheetUrl(''); setSheetInfo(null); }}
                  className="flex-1 px-3 py-2 rounded-lg border border-border text-foreground text-xs font-medium hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button onClick={handleSaveConfig}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
                  <Check className="w-3.5 h-3.5" /> Salvar Configuração
                </button>
              </div>

              <div className="mt-4 pt-3 border-t border-border">
                <p className="text-[10px] text-muted-foreground mb-2">Colunas encontradas na planilha:</p>
                <div className="flex flex-wrap gap-1">
                  {mappingHeaders.map(h => (
                    <span key={h} className="px-2 py-0.5 rounded-full bg-muted text-[10px] text-muted-foreground font-mono">{h}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Preview of selected config */}
          {selectedConfig && previewData && previewData.length > 0 && !showMappingDialog && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">Preview</p>
                  {(() => {
                    const cfg = sheetConfigs.find(c => c.id === selectedConfig);
                    return cfg ? (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${moduloColors[cfg.moduloDestino]}`}>
                        {moduloLabels[cfg.moduloDestino]}
                      </span>
                    ) : null;
                  })()}
                </div>
                <span className="text-xs text-muted-foreground">{previewData.length - 1} linhas (preview)</span>
              </div>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                    <tr className="border-b border-border">
                      {previewData[0]?.map((header, i) => {
                        const cfg = sheetConfigs.find(c => c.id === selectedConfig);
                        const isMapped = cfg && Object.values(cfg.mapeamento).includes(header);
                        return (
                          <th key={i} className={`text-left py-2.5 px-3 font-semibold text-xs whitespace-nowrap ${isMapped ? 'text-primary' : 'text-muted-foreground'}`}>
                            {header || `Col ${i + 1}`}
                            {isMapped && <span className="ml-1">✓</span>}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.slice(1).map((row, ri) => (
                      <tr key={ri} className="border-b border-border hover:bg-muted/30 transition-colors">
                        {previewData[0]?.map((_, ci) => (
                          <td key={ci} className="py-2 px-3 text-foreground text-xs whitespace-nowrap">
                            {row[ci] || ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Data status cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`bg-card border rounded-xl p-4 ${sheetsData.estoqueItems ? 'border-[hsl(var(--vix-success)/0.3)]' : 'border-border'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-[hsl(var(--vix-info))]" />
                  <span className="text-sm font-medium text-foreground">Estoque</span>
                </div>
                {sheetsData.estoqueItems ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[hsl(var(--vix-success))]">{sheetsData.estoqueItems.length} itens</span>
                    <button onClick={sheetsData.clearEstoque} className="text-[10px] text-muted-foreground hover:text-[hsl(var(--vix-danger))]">Limpar</button>
                  </div>
                ) : <span className="text-xs text-muted-foreground">—</span>}
              </div>
            </div>
            <div className={`bg-card border rounded-xl p-4 ${sheetsData.financeiroItems ? 'border-[hsl(var(--vix-success)/0.3)]' : 'border-border'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-[hsl(var(--vix-success))]" />
                  <span className="text-sm font-medium text-foreground">Financeiro</span>
                </div>
                {sheetsData.financeiroItems ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[hsl(var(--vix-success))]">{sheetsData.financeiroItems.length} itens</span>
                    <button onClick={sheetsData.clearFinanceiro} className="text-[10px] text-muted-foreground hover:text-[hsl(var(--vix-danger))]">Limpar</button>
                  </div>
                ) : <span className="text-xs text-muted-foreground">—</span>}
              </div>
            </div>
            <div className={`bg-card border rounded-xl p-4 ${sheetsData.vendasItems ? 'border-[hsl(var(--vix-success)/0.3)]' : 'border-border'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-[hsl(var(--vix-warning))]" />
                  <span className="text-sm font-medium text-foreground">Vendas / Pedidos</span>
                </div>
                {sheetsData.vendasItems ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[hsl(var(--vix-success))]">{sheetsData.vendasItems.length} vendas</span>
                    <button onClick={sheetsData.clearVendas} className="text-[10px] text-muted-foreground hover:text-[hsl(var(--vix-danger))]">Limpar</button>
                  </div>
                ) : <span className="text-xs text-muted-foreground">—</span>}
              </div>
            </div>
          </div>

          {/* Empty state */}
          {!selectedConfig && !showMappingDialog && sheetConfigs.length === 0 && (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <FileSpreadsheet className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-foreground font-semibold mb-2">Configure suas Fontes de Dados</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                1. Cole a URL da planilha Google → 2. Escolha a aba e o módulo destino → 3. Mapeie as colunas → 4. Clique em Importar
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
