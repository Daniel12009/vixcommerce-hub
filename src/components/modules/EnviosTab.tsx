import { useState, useMemo, useEffect, useCallback } from 'react';
import { Plus, Upload, Truck, Loader2, Check, X, Search, Package, CheckCircle2, Clock, Trash2, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { KpiCard } from '@/components/shared/KpiCard';

// Cast needed because envios_full tables aren't in the auto-generated types yet
const db = supabase as any;

const SPREADSHEET_ID = '1kvT5gvCKuUZbWFY4T0ZHR1Y4kuIE2P6Ae5m2MfJV7u4';
const SHEET_IMPORT = 'Página1';  // Tab to READ/import from (team's original)
const SHEET_SYNC = 'VIX_BACKUP'; // Tab to WRITE to (app mirror, doesn't touch Página1)

interface EnvioItem {
  id?: string;
  sku: string;
  quantidade: number;
}

interface Envio {
  id: string;
  envio_numero: string;
  data_inicio: string;
  data_coleta: string;
  preparado: boolean;
  coletado: boolean;
  caixas: number;
  conta: string;
  local: string;
  created_at: string;
  items: EnvioItem[];
}

export function EnviosTab() {
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingEnvio, setEditingEnvio] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [filterConta, setFilterConta] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pendente' | 'preparado' | 'coletado'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // New envio form state
  const [formEnvio, setFormEnvio] = useState({
    envio_numero: '',
    data_inicio: new Date().toISOString().split('T')[0],
    data_coleta: '',
    caixas: 0,
    conta: '',
    local: '',
  });
  const [formItems, setFormItems] = useState<EnvioItem[]>([{ sku: '', quantidade: 0 }]);
  const [saving, setSaving] = useState(false);

  // Load envios from Supabase — returns fresh data
  const loadEnvios = useCallback(async (): Promise<Envio[]> => {
    try {
      const { data: enviosData, error: enviosErr } = await db
        .from('envios_full')
        .select('*')
        .order('data_inicio', { ascending: false });

      if (enviosErr) throw enviosErr;

      const { data: itemsData, error: itemsErr } = await db
        .from('envios_full_items')
        .select('*');

      if (itemsErr) throw itemsErr;

      const enviosWithItems: Envio[] = (enviosData || []).map((e: any) => ({
        ...e,
        items: (itemsData || []).filter((i: any) => i.envio_id === e.id),
      }));

      setEnvios(enviosWithItems);
      setError('');
      return enviosWithItems;
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar envios');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEnvios();
  }, [loadEnvios]);

  // Contas list
  const contas = useMemo(() => {
    const set = new Set<string>();
    envios.forEach(e => { if (e.conta) set.add(e.conta); });
    return Array.from(set).sort();
  }, [envios]);

  // Filtered envios
  const filteredEnvios = useMemo(() => {
    return envios.filter(e => {
      if (filterConta !== 'all' && e.conta !== filterConta) return false;
      if (filterStatus === 'pendente' && (e.preparado || e.coletado)) return false;
      if (filterStatus === 'preparado' && !e.preparado) return false;
      if (filterStatus === 'coletado' && !e.coletado) return false;
      if (searchTerm) {
        const term = searchTerm.toUpperCase();
        const matchEnvio = (e.envio_numero || '').toUpperCase().includes(term);
        const matchSku = e.items.some(i => i.sku.toUpperCase().includes(term));
        if (!matchEnvio && !matchSku) return false;
      }
      return true;
    });
  }, [envios, filterConta, filterStatus, searchTerm]);

  // KPIs
  const totalEnvios = envios.length;
  const pendentes = envios.filter(e => !e.preparado && !e.coletado).length;
  const preparados = envios.filter(e => e.preparado && !e.coletado).length;
  const coletados = envios.filter(e => e.coletado).length;
  const totalUnidades = envios.reduce((s, e) => s + e.items.reduce((ss, i) => ss + i.quantidade, 0), 0);

  // Format ISO date to DD/MM/YYYY for sheet
  function toSheetDate(iso: string | null): string {
    if (!iso) return '';
    const parts = iso.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return iso;
  }

  // Sync ALL envios to sheet (full rewrite to VIX_BACKUP tab)
  const syncAllToSheet = async (freshData: Envio[]) => {
    try {
      // Ensure the sync tab exists
      try {
        await supabase.functions.invoke('google-sheets', {
          body: { action: 'create_sheet', spreadsheetId: SPREADSHEET_ID, sheetTitle: SHEET_SYNC },
        });
      } catch { /* ignore if already exists */ }

      const header = ['FEITO', 'DATA DE INICIO', 'DATA DE COLETA', 'COLETADO', 'ENVIO', 'sku', 'UN', 'CAIXAS', 'CONTA', 'LOCAL'];
      const rows: string[][] = [header];

      for (const envio of freshData) {
        if (envio.items.length === 0) {
          rows.push([
            envio.preparado ? 'TRUE' : 'FALSE',
            toSheetDate(envio.data_inicio), toSheetDate(envio.data_coleta),
            envio.coletado ? 'TRUE' : 'FALSE',
            envio.envio_numero || '', '', '0',
            String(envio.caixas || 0), envio.conta || '', envio.local || '',
          ]);
        } else {
          envio.items.forEach((item, idx) => {
            if (idx === 0) {
              rows.push([
                envio.preparado ? 'TRUE' : 'FALSE',
                toSheetDate(envio.data_inicio), toSheetDate(envio.data_coleta),
                envio.coletado ? 'TRUE' : 'FALSE',
                envio.envio_numero || '', item.sku, String(item.quantidade),
                String(envio.caixas || 0), envio.conta || '', envio.local || '',
              ]);
            } else {
              rows.push(['', '', '', '', '', item.sku, String(item.quantidade), '', '', '']);
            }
          });
        }
      }

      // Pad with empty rows up to 2000 to clear any old data below
      const totalRows = Math.max(rows.length, 2000);
      while (rows.length < totalRows) {
        rows.push(['', '', '', '', '', '', '', '', '', '']);
      }

      await supabase.functions.invoke('google-sheets', {
        body: {
          action: 'write',
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_SYNC}!A1:J${totalRows}`,
          values: rows,
        },
      });
      console.log('Sheet sync complete:', rows.length, 'rows written');
    } catch (err) {
      console.warn('Sheet sync failed (non-critical):', err);
    }
  };

  // Toggle checkbox
  const toggleField = async (envioId: string, field: 'preparado' | 'coletado', value: boolean) => {
    const update: any = { [field]: value };
    if (field === 'coletado' && value) update.preparado = true;

    const { error: err } = await db.from('envios_full').update(update).eq('id', envioId);
    if (err) {
      console.error('Update error:', err);
      return;
    }
    const updated = envios.map(e => e.id === envioId ? { ...e, ...update } : e);
    setEnvios(updated);
    syncAllToSheet(updated);
  };

  // Open edit modal
  const openEdit = (envio: Envio) => {
    setEditingEnvio(envio.id);
    setFormEnvio({
      envio_numero: envio.envio_numero || '',
      data_inicio: envio.data_inicio || '',
      data_coleta: envio.data_coleta || '',
      caixas: envio.caixas || 0,
      conta: envio.conta || '',
      local: envio.local || '',
    });
    setFormItems(envio.items.length > 0 ? envio.items.map(i => ({ sku: i.sku, quantidade: i.quantidade })) : [{ sku: '', quantidade: 0 }]);
    setShowModal(true);
  };

  // Open new modal
  const openNew = () => {
    setEditingEnvio(null);
    setFormEnvio({ envio_numero: '', data_inicio: new Date().toISOString().split('T')[0], data_coleta: '', caixas: 0, conta: '', local: '' });
    setFormItems([{ sku: '', quantidade: 0 }]);
    setShowModal(true);
  };

  // Save (create or update) envio
  const saveEnvio = async () => {
    if (!formEnvio.envio_numero.trim()) return;
    const validItems = formItems.filter(i => i.sku.trim() && i.quantidade > 0);
    if (validItems.length === 0) return;

    setSaving(true);
    try {
      if (editingEnvio) {
        // UPDATE existing envio
        const { error: updErr } = await db.from('envios_full').update({
          envio_numero: formEnvio.envio_numero.trim(),
          data_inicio: formEnvio.data_inicio || null,
          data_coleta: formEnvio.data_coleta || null,
          caixas: formEnvio.caixas,
          conta: formEnvio.conta.trim().toUpperCase(),
          local: formEnvio.local.trim(),
        }).eq('id', editingEnvio);
        if (updErr) throw updErr;

        // Replace items: delete old, insert new
        await db.from('envios_full_items').delete().eq('envio_id', editingEnvio);
        const itemInserts = validItems.map(i => ({
          envio_id: editingEnvio,
          sku: i.sku.trim().toUpperCase(),
          quantidade: i.quantidade,
        }));
        await db.from('envios_full_items').insert(itemInserts);
      } else {
        // CREATE new envio
        const { data: newEnvio, error: envErr } = await db.from('envios_full').insert({
          envio_numero: formEnvio.envio_numero.trim(),
          data_inicio: formEnvio.data_inicio || null,
          data_coleta: formEnvio.data_coleta || null,
          caixas: formEnvio.caixas,
          conta: formEnvio.conta.trim().toUpperCase(),
          local: formEnvio.local.trim(),
          preparado: false,
          coletado: false,
        }).select().single();
        if (envErr) throw envErr;

        const itemInserts = validItems.map(i => ({
          envio_id: newEnvio.id,
          sku: i.sku.trim().toUpperCase(),
          quantidade: i.quantidade,
        }));
        await db.from('envios_full_items').insert(itemInserts);
      }

      setShowModal(false);
      setEditingEnvio(null);
      setFormEnvio({ envio_numero: '', data_inicio: new Date().toISOString().split('T')[0], data_coleta: '', caixas: 0, conta: '', local: '' });
      setFormItems([{ sku: '', quantidade: 0 }]);
      const freshData = await loadEnvios();
      syncAllToSheet(freshData);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar envio');
    } finally {
      setSaving(false);
    }
  };

  // Import from sheet
  const importFromSheet = async () => {
    setImporting(true);
    setError('');
    try {
      const { data, error: sheetErr } = await supabase.functions.invoke('google-sheets', {
        body: {
          action: 'read',
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_IMPORT}!A:J`,
        },
      });
      if (sheetErr) throw sheetErr;

      const rows = data?.values || [];
      if (rows.length <= 1) {
        setError('Planilha vazia ou sem dados');
        return;
      }

      // Parse grouped rows: when column E (envio) has a value, it's a new envio
      const envioGroups: any[] = [];
      let currentGroup: any = null;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue; // skip empty rows

        const feitoVal = String(row[0] || '').toUpperCase().trim();
        const feito = feitoVal === 'TRUE' || feitoVal === 'VERDADEIRO';
        const dataInicio = row[1] || '';
        const dataColeta = row[2] || '';
        const coletadoVal = String(row[3] || '').toUpperCase().trim();
        const coletado = coletadoVal === 'TRUE' || coletadoVal === 'VERDADEIRO';
        const envioNum = String(row[4] || '').trim();
        const sku = String(row[5] || '').trim();
        const un = parseInt(String(row[6] || '0').replace(/[^\d]/g, '')) || 0;
        const caixas = parseInt(String(row[7] || '0').replace(/[^\d]/g, '')) || 0;
        const conta = String(row[8] || '').trim();
        const local = String(row[9] || '').trim();

        if (envioNum) {
          // New envio group
          currentGroup = {
            envio_numero: envioNum,
            data_inicio: parseDate(dataInicio),
            data_coleta: parseDate(dataColeta),
            preparado: feito,
            coletado: coletado,
            caixas,
            conta: conta.toUpperCase(),
            local,
            items: [] as { sku: string; quantidade: number }[],
          };
          envioGroups.push(currentGroup);
        }

        if (currentGroup && sku) {
          currentGroup.items.push({ sku: sku.toUpperCase(), quantidade: un });
        }
      }

      console.log(`Parsed ${envioGroups.length} envios, ${envioGroups.reduce((s: number, g: any) => s + g.items.length, 0)} items total`);

      // Clear existing data
      await db.from('envios_full_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await db.from('envios_full').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      // Generate client-side UUIDs so we know the mapping BEFORE insert
      const envioInserts = envioGroups.map((g: any) => ({
        id: crypto.randomUUID(), // client-generated ID — guarantees correct mapping
        envio_numero: g.envio_numero,
        data_inicio: g.data_inicio,
        data_coleta: g.data_coleta,
        preparado: g.preparado,
        coletado: g.coletado,
        caixas: g.caixas,
        conta: g.conta,
        local: g.local,
      }));

      // Build ALL items using pre-generated IDs (before any insert)
      const allItems: { envio_id: string; sku: string; quantidade: number }[] = [];
      envioGroups.forEach((group: any, idx: number) => {
        if (group.items.length > 0) {
          group.items.forEach((item: any) => {
            allItems.push({
              envio_id: envioInserts[idx].id, // use the pre-generated UUID
              sku: item.sku,
              quantidade: item.quantidade,
            });
          });
        }
      });

      console.log(`Prepared ${envioInserts.length} envios, ${allItems.length} items`);

      // BATCH insert envios (chunks of 200)
      const BATCH_SIZE = 200;
      for (let i = 0; i < envioInserts.length; i += BATCH_SIZE) {
        const chunk = envioInserts.slice(i, i + BATCH_SIZE);
        const { error: batchErr } = await db.from('envios_full').insert(chunk);
        if (batchErr) {
          console.error('Batch envio insert error:', batchErr);
          throw batchErr;
        }
      }

      console.log(`Inserted ${envioInserts.length} envios`);

      // BATCH insert items (chunks of 500)
      for (let i = 0; i < allItems.length; i += 500) {
        const itemChunk = allItems.slice(i, i + 500);
        const { error: itemErr } = await db.from('envios_full_items').insert(itemChunk);
        if (itemErr) {
          console.error('Batch item insert error:', itemErr);
        }
      }

      console.log(`Inserted ${allItems.length} items total`);

      const freshData = await loadEnvios();
      setError('');
      // Sync organized copy to VIX_BACKUP
      await syncAllToSheet(freshData);
    } catch (err: any) {
      setError(err.message || 'Erro ao importar planilha');
    } finally {
      setImporting(false);
    }
  };

  // Delete envio
  const deleteEnvio = async (id: string) => {
    if (!confirm('Excluir este envio?')) return;
    await db.from('envios_full_items').delete().eq('envio_id', id);
    await db.from('envios_full').delete().eq('id', id);
    const updated = envios.filter(e => e.id !== id);
    setEnvios(updated);
    syncAllToSheet(updated);
  };

  // Parse date helper — handles DD/MM/YYYY, DD\MM\YYYY, and various malformed formats
  function parseDate(str: string): string | null {
    if (!str || !str.trim()) return null;
    const s = str.trim().replace(/\\/g, '/'); // normalize backslashes
    // Try DD/MM/YYYY (allow missing separators like 13/082025 or 03/092025)
    const m = s.match(/^(\d{1,2})\/?(\d{1,2})\/?(\d{4})$/);
    if (m) {
      return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    // Try standard DD/MM/YYYY with separators
    const parts = s.split('/').filter(p => p.length > 0);
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
      return `${year}-${month}-${day}`;
    }
    // Try ISO format
    if (s.includes('-')) return s.split('T')[0];
    return null;
  }

  function formatDateBR(str: string | null): string {
    if (!str) return '—';
    const d = new Date(str + 'T12:00:00');
    return d.toLocaleDateString('pt-BR');
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard title="Total Envios" value={String(totalEnvios)} icon={Package} delay={0} />
        <KpiCard title="Pendentes" value={String(pendentes)} icon={Clock} delay={50} />
        <KpiCard title="Preparados" value={String(preparados)} icon={Check} delay={100} />
        <KpiCard title="Coletados" value={String(coletados)} icon={CheckCircle2} delay={150} />
        <KpiCard title="Total UN" value={String(totalUnidades)} icon={Truck} delay={200} />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" /> Novo Envio
        </button>

        <button onClick={importFromSheet} disabled={importing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50">
          {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {importing ? 'Importando...' : 'Importar da Planilha'}
        </button>

        {contas.length > 0 && (
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
            <span className="text-xs text-muted-foreground font-medium">Conta:</span>
            <select value={filterConta} onChange={e => setFilterConta(e.target.value)}
              className="text-sm bg-transparent border-none outline-none font-semibold text-primary cursor-pointer">
              <option value="all">Todas</option>
              {contas.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}

        <div className="flex items-center gap-1">
          {(['all', 'pendente', 'preparado', 'coletado'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === s ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
              {{ all: 'Todos', pendente: '⏳ Pendente', preparado: '📦 Preparado', coletado: '✅ Coletado' }[s]}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input type="text" placeholder="Buscar envio ou SKU..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="pl-8 pr-3 py-2 h-9 text-sm bg-card border border-border rounded-lg focus:ring-1 focus:ring-primary outline-none" />
        </div>

        <span className="text-xs text-muted-foreground ml-auto">{filteredEnvios.length} envios</span>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-[hsl(var(--vix-danger)/0.1)] border border-[hsl(var(--vix-danger)/0.2)] text-sm text-[hsl(var(--vix-danger))]">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredEnvios.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center animate-fade-in">
          <Truck className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
          <h3 className="text-lg font-semibold mb-2">Nenhum envio encontrado</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Clique em <strong>"Novo Envio"</strong> para registrar ou <strong>"Importar da Planilha"</strong> para trazer os dados existentes.
          </p>
        </div>
      ) : (
        /* Table */
        <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-center px-3 py-2.5 font-medium text-muted-foreground w-10">✅</th>
                  <th className="text-center px-3 py-2.5 font-medium text-muted-foreground w-10">📦</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Data Início</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Data Coleta</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Envio</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">SKU</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">UN</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Caixas</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Conta</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Local</th>
                  <th className="text-center px-3 py-2.5 font-medium text-muted-foreground w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredEnvios.map(envio => (
                  envio.items.length > 0 ? envio.items.map((item, idx) => (
                    <tr key={`${envio.id}-${idx}`}
                      className={`border-b border-border hover:bg-muted/30 transition-colors ${
                        envio.coletado ? 'opacity-60' : envio.preparado ? 'bg-[hsl(var(--vix-success)/0.03)]' : ''
                      }`}>
                      {idx === 0 ? (
                        <>
                          <td className="px-3 py-2 text-center" rowSpan={envio.items.length}>
                            <input type="checkbox" checked={envio.coletado}
                              onChange={e => toggleField(envio.id, 'coletado', e.target.checked)}
                              className="w-4 h-4 rounded cursor-pointer accent-[hsl(var(--vix-success))]" title="Coletado" />
                          </td>
                          <td className="px-3 py-2 text-center" rowSpan={envio.items.length}>
                            <input type="checkbox" checked={envio.preparado}
                              onChange={e => toggleField(envio.id, 'preparado', e.target.checked)}
                              disabled={envio.coletado}
                              className={`w-4 h-4 rounded cursor-pointer accent-[hsl(var(--vix-info))] ${envio.coletado ? 'opacity-40 cursor-not-allowed' : ''}`} title="Preparado" />
                          </td>
                          <td className="px-3 py-2 text-xs text-foreground" rowSpan={envio.items.length}>{formatDateBR(envio.data_inicio)}</td>
                          <td className="px-3 py-2 text-xs text-foreground" rowSpan={envio.items.length}>{formatDateBR(envio.data_coleta)}</td>
                          <td className="px-3 py-2 font-mono text-xs font-semibold text-primary" rowSpan={envio.items.length}>{envio.envio_numero}</td>
                        </>
                      ) : null}
                      <td className="px-3 py-2 font-mono text-xs font-semibold">{item.sku}</td>
                      <td className="px-3 py-2 text-right text-foreground font-medium">{item.quantidade}</td>
                      {idx === 0 ? (
                        <>
                          <td className="px-3 py-2 text-right text-foreground" rowSpan={envio.items.length}>{envio.caixas || '—'}</td>
                          <td className="px-3 py-2 text-xs" rowSpan={envio.items.length}>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              envio.conta === 'VIA' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                              envio.conta === 'GS' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                              envio.conta === 'MONACO' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                              'bg-muted text-muted-foreground'
                            }`}>{envio.conta}</span>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground" rowSpan={envio.items.length}>{envio.local || '—'}</td>
                          <td className="px-3 py-2 text-center" rowSpan={envio.items.length}>
                            <div className="flex items-center gap-1 justify-center">
                              {!envio.coletado && (
                                <button onClick={() => openEdit(envio)} className="p-1 rounded hover:bg-primary/10 transition-colors" title="Editar">
                                  <Pencil className="w-3.5 h-3.5 text-primary" />
                                </button>
                              )}
                              {!envio.coletado && (
                                <button onClick={() => deleteEnvio(envio.id)} className="p-1 rounded hover:bg-[hsl(var(--vix-danger)/0.1)] transition-colors" title="Excluir">
                                  <Trash2 className="w-3.5 h-3.5 text-[hsl(var(--vix-danger))]" />
                                </button>
                              )}
                            </div>
                          </td>
                        </>
                      ) : null}
                    </tr>
                  )) : (
                    <tr key={envio.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={envio.coletado} onChange={e => toggleField(envio.id, 'coletado', e.target.checked)}
                          className="w-4 h-4 rounded cursor-pointer" />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={envio.preparado} onChange={e => toggleField(envio.id, 'preparado', e.target.checked)}
                          className="w-4 h-4 rounded cursor-pointer" />
                      </td>
                      <td className="px-3 py-2 text-xs">{formatDateBR(envio.data_inicio)}</td>
                      <td className="px-3 py-2 text-xs">{formatDateBR(envio.data_coleta)}</td>
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-primary">{envio.envio_numero}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground" colSpan={2}>Sem itens</td>
                      <td className="px-3 py-2 text-right">{envio.caixas || '—'}</td>
                      <td className="px-3 py-2 text-xs">{envio.conta}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{envio.local || '—'}</td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => deleteEnvio(envio.id)} className="p-1 rounded hover:bg-[hsl(var(--vix-danger)/0.1)] transition-colors">
                          <Trash2 className="w-3.5 h-3.5 text-[hsl(var(--vix-danger))]" />
                        </button>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* NEW ENVIO MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-fade-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-lg font-semibold">{editingEnvio ? 'Editar Envio' : 'Novo Envio Full'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-muted transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Nº Envio (ML)</label>
                  <input type="text" value={formEnvio.envio_numero} onChange={e => setFormEnvio(p => ({ ...p, envio_numero: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-muted border border-border rounded-lg focus:ring-1 focus:ring-primary outline-none" placeholder="Ex: 5759" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Caixas</label>
                  <input type="number" min={0} value={formEnvio.caixas} onChange={e => setFormEnvio(p => ({ ...p, caixas: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 text-sm bg-muted border border-border rounded-lg focus:ring-1 focus:ring-primary outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Data Início</label>
                  <input type="date" value={formEnvio.data_inicio} onChange={e => setFormEnvio(p => ({ ...p, data_inicio: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-muted border border-border rounded-lg focus:ring-1 focus:ring-primary outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Data Coleta</label>
                  <input type="date" value={formEnvio.data_coleta} onChange={e => setFormEnvio(p => ({ ...p, data_coleta: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-muted border border-border rounded-lg focus:ring-1 focus:ring-primary outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Conta</label>
                  <select value={formEnvio.conta} onChange={e => setFormEnvio(p => ({ ...p, conta: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-muted border border-border rounded-lg focus:ring-1 focus:ring-primary outline-none">
                    <option value="">Selecione</option>
                    <option value="VIA">VIA</option>
                    <option value="GS">GS</option>
                    <option value="MONACO">MONACO</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Local (Depósito)</label>
                  <input type="text" value={formEnvio.local} onChange={e => setFormEnvio(p => ({ ...p, local: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-muted border border-border rounded-lg focus:ring-1 focus:ring-primary outline-none" placeholder="Ex: DP1" />
                </div>
              </div>

              {/* SKU items */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">SKUs</label>
                <div className="space-y-2">
                  {formItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input type="text" placeholder="SKU (ex: FC-62)" value={item.sku}
                        onChange={e => { const n = [...formItems]; n[idx].sku = e.target.value; setFormItems(n); }}
                        className="flex-1 px-3 py-2 text-sm bg-muted border border-border rounded-lg focus:ring-1 focus:ring-primary outline-none font-mono" />
                      <input type="number" placeholder="UN" min={0} value={item.quantidade || ''}
                        onChange={e => { const n = [...formItems]; n[idx].quantidade = parseInt(e.target.value) || 0; setFormItems(n); }}
                        className="w-20 px-3 py-2 text-sm bg-muted border border-border rounded-lg focus:ring-1 focus:ring-primary outline-none text-right" />
                      {formItems.length > 1 && (
                        <button onClick={() => setFormItems(p => p.filter((_, i) => i !== idx))} className="p-1.5 rounded hover:bg-[hsl(var(--vix-danger)/0.1)] transition-colors">
                          <X className="w-4 h-4 text-[hsl(var(--vix-danger))]" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setFormItems(p => [...p, { sku: '', quantidade: 0 }])}
                    className="flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                    <Plus className="w-3 h-3" /> Adicionar SKU
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm rounded-lg bg-muted hover:bg-muted/80 transition-colors">Cancelar</button>
              <button onClick={saveEnvio} disabled={saving || !formEnvio.envio_numero.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
