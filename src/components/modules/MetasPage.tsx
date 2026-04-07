import { useState, useEffect, useMemo } from 'react';
import { Target, TrendingUp, DollarSign, Package, ShoppingCart, Award, Plus, Trash2, Save, X} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { KpiCard } from '@/components/shared/KpiCard';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import { formatBRL } from '@/lib/utils-vix';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { saveToCloud, loadFromCloud } from '@/lib/persistence';
import { useAuth } from '@/contexts/AuthContext';

interface Meta {
  id: string;
  nome: string;
  tipo: 'vendas_qtd' | 'vendas_valor' | 'receita' | 'devolucao_max' | 'devolucao_taxa' | 'ticket_medio' | 'ads_investimento' | 'acos' | 'custom';
  meta: number;
  periodo: 'diario' | 'semanal' | 'mensal';
  formato: 'inteiro' | 'porcentagem' | 'monetario';
  usuario?: string; // 'todos' ou username
}

const TIPO_LABELS: Record<string, string> = {
  vendas_qtd: 'Vendas (Qtd)',
  vendas_valor: 'Vendas (R$)',
  receita: 'Receita Total',
  devolucao_max: 'Devoluções Máx (Qtd)',
  devolucao_taxa: 'Taxa Devolução (%)',
  ticket_medio: 'Ticket Médio',
  ads_investimento: 'Investimento Ads (R$)',
  acos: 'ACOS / Custo Ads (%)',
  custom: 'Personalizado',
};

const TIPO_ICONS: Record<string, any> = {
  vendas_qtd: ShoppingCart,
  vendas_valor: DollarSign,
  receita: TrendingUp,
  devolucao_max: Package,
  devolucao_taxa: Package,
  ticket_medio: Award,
  ads_investimento: Target,
  acos: TrendingUp,
  custom: Target,
};

const FORMATO_LABELS: Record<string, string> = {
  inteiro: 'Valor Inteiro (Qtd)',
  porcentagem: 'Porcentagem (%)',
  monetario: 'Monetário (R$)',
};

const PERIODO_LABELS: Record<string, string> = {
  diario: 'Diário',
  semanal: 'Semanal',
  mensal: 'Mensal',
};

const defaultMetas: Meta[] = [
  { id: 'vendas_qty_mensal', nome: 'Vendas Mensais (Qtd)', tipo: 'vendas_qtd', meta: 500, periodo: 'mensal', formato: 'inteiro', usuario: 'todos' },
  { id: 'vendas_valor_mensal', nome: 'Faturamento Mensal', tipo: 'vendas_valor', meta: 100000, periodo: 'mensal', formato: 'monetario', usuario: 'todos' },
  { id: 'ticket_medio_mensal', nome: 'Ticket Médio', tipo: 'ticket_medio', meta: 200, periodo: 'mensal', formato: 'monetario', usuario: 'todos' },
  { id: 'devolucao_taxa_mensal', nome: 'Taxa Devoluções', tipo: 'devolucao_taxa', meta: 3, periodo: 'mensal', formato: 'porcentagem', usuario: 'todos' },
  { id: 'acos_mensal', nome: 'Meta de ACOS', tipo: 'acos', meta: 15, periodo: 'mensal', formato: 'porcentagem', usuario: 'todos' },
];

export function MetasPage() {
  const { user, allUsers } = useAuth();
  const canManage = user?.role === 'admin' || user?.role === 'manager';
  const { vendasItems, devolucaoItems, adsItems } = useSheetsData();
  const [metas, setMetas] = useState<Meta[]>(defaultMetas);
  const [showAdd, setShowAdd] = useState(false);
  const [newMeta, setNewMeta] = useState<Meta>({ id: '', nome: '', tipo: 'vendas_qtd', meta: 0, periodo: 'mensal', formato: 'inteiro', usuario: 'todos' });
  const [loaded, setLoaded] = useState(false);

  // Load/save metas from cloud
  useEffect(() => {
    loadFromCloud<Meta[]>('metas_config').then(data => {
      if (data && data.length > 0) setMetas(data);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) saveToCloud('metas_config', metas);
  }, [metas, loaded]);

  // Calculate actual values
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const parseDate = (str: string): Date | null => {
    if (!str) return null;
    const s = str.trim();
    const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmyMatch) return new Date(+dmyMatch[3], +dmyMatch[2] - 1, +dmyMatch[1]);
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return new Date(+isoMatch[1], +isoMatch[2] - 1, +isoMatch[3]);
    const num = Number(s);
    if (!isNaN(num) && num > 30000 && num < 60000) return new Date((num - 25569) * 86400000);
    return null;
  };

  const getActual = (meta: Meta): number => {
    const limitDate = meta.periodo === 'diario' ? startOfDay 
                    : meta.periodo === 'semanal' ? startOfWeek 
                    : startOfMonth;

    const filterDates = (items: any[], field: string) => 
      items.filter(item => {
        const d = parseDate(item[field] || '');
        return d && d >= limitDate;
      });

    const v = filterDates(vendasItems || [], 'data');
    const d = filterDates(devolucaoItems || [], 'dataPlanilha');
    const a = filterDates(adsItems || [], 'dataRef');

    const vQtd = v.length;
    const vVal = v.reduce((acc, curr) => acc + (curr.valorTotal || 0), 0);
    const dQtd = d.length;
    const adsVal = a.reduce((acc, curr) => acc + (curr.investimento || 0), 0);

    const ticketMedio = vQtd > 0 ? vVal / vQtd : 0;
    const devTaxa = vQtd > 0 ? (dQtd / vQtd) * 100 : 0;
    const acos = vVal > 0 ? (adsVal / vVal) * 100 : 0;

    switch (meta.tipo) {
      case 'vendas_qtd': return vQtd;
      case 'vendas_valor': return vVal;
      case 'receita': return vVal;
      case 'devolucao_max': return dQtd;
      case 'devolucao_taxa': return devTaxa;
      case 'ticket_medio': return ticketMedio;
      case 'ads_investimento': return adsVal;
      case 'acos': return acos;
      default: return 0;
    }
  };

  const getProgress = (meta: Meta): number => {
    const actual = getActual(meta);
    if (meta.meta === 0) return 0;
    if (meta.tipo === 'devolucao_max' || meta.tipo === 'devolucao_taxa' || meta.tipo === 'acos') {
      // Reverse: lower is better
      const pct = (actual / meta.meta) * 100;
      if (pct > 150) return 0; // Very bad
      return Math.max(0, 100 - (pct > 100 ? pct - 100 : 0)); // Visual mapping
    }
    return Math.min(100, (actual / meta.meta) * 100);
  };

  const getColor = (pct: number, isReverse: boolean = false): string => {
    if (isReverse) {
      if (pct >= 70) return '#22c55e';
      if (pct >= 40) return '#f59e0b';
      return '#ef4444';
    }
    if (pct >= 80) return '#22c55e';
    if (pct >= 50) return '#f59e0b';
    return '#ef4444';
  };

  const formatValue = (val: number, meta: Meta): string => {
    if (meta.formato === 'monetario') return formatBRL(val);
    if (meta.formato === 'porcentagem') return val.toFixed(1).replace('.', ',') + '%';
    return val.toLocaleString('pt-BR');
  };

  const chartData = metas.map(m => ({
    name: m.nome.length > 20 ? m.nome.substring(0, 18) + '...' : m.nome,
    meta: m.meta,
    atual: getActual(m),
    pct: Math.round(getProgress(m)),
  }));

  const handleAdd = () => {
    if (!newMeta.nome || newMeta.meta <= 0) return;
    setMetas(prev => [...prev, { ...newMeta, id: `custom_${Date.now()}` }]);
    setNewMeta({ id: '', nome: '', tipo: 'vendas_qtd', meta: 0, periodo: 'mensal', formato: 'inteiro', usuario: 'todos' });
    setShowAdd(false);
  };

  const visibleMetas = metas.filter(m => canManage || !m.usuario || m.usuario === 'todos' || m.usuario === user?.username);

  const handleRemove = (id: string) => {
    setMetas(prev => prev.filter(m => m.id !== id));
  };

  return (
    <div>
      <PageHeader
        title="Metas"
        subtitle={`Acompanhamento de objetivos · ${visibleMetas.length} metas visíveis`}
      />

      {/* Progress Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {visibleMetas.map(m => {
          const pct = getProgress(m);
          const actual = getActual(m);
          const isReverse = m.tipo === 'devolucao_max';
          const color = getColor(pct, isReverse);
          const Icon = TIPO_ICONS[m.tipo] || Target;

          return (
            <div key={m.id} className="bg-card border border-border rounded-xl p-3 md:p-5 relative group">
              {canManage && (
                <button
                  onClick={() => handleRemove(m.id)}
                  className="absolute top-3 right-3 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
                  <Icon className="w-4.5 h-4.5" style={{ color }} />
                </div>
                <div>
                  <p className="text-sm text-foreground font-semibold">{m.nome}</p>
                  <p className="text-[10px] text-muted-foreground flex gap-1">
                    <span>{PERIODO_LABELS[m.periodo]}</span>
                    {canManage && m.usuario && m.usuario !== 'todos' && (
                      <span className="text-indigo-400 font-bold">• {m.usuario}</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-end justify-between mb-2">
                <div>
                  <p className="text-2xl font-bold" style={{ color }}>{formatValue(actual, m)}</p>
                  <p className="text-[10px] text-muted-foreground">Meta: {formatValue(m.meta, m)}</p>
                </div>
                <p className="text-lg font-bold" style={{ color }}>{Math.round(pct)}%</p>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-muted rounded-full h-2.5">
                <div
                  className="h-2.5 rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    background: `linear-gradient(90deg, ${color}80, ${color})`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Chart */}
      <div className="bg-card border border-border rounded-xl p-3 md:p-5 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Progresso Geral</h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis dataKey="name" type="category" width={160} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                formatter={(v: number, name: string) => [v.toLocaleString('pt-BR'), name === 'atual' ? 'Atual' : 'Meta']}
              />
              <Legend />
              <Bar dataKey="meta" name="Meta" fill="hsl(var(--muted-foreground))" radius={[0, 4, 4, 0]} opacity={0.3} />
              <Bar dataKey="atual" name="Atual" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={getColor(entry.pct)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground text-sm text-center py-10">Sem metas configuradas</p>
        )}
      </div>

      {/* Add Meta */}
      {canManage && (
        <div className="bg-card border border-border rounded-xl p-3 md:p-5">
          {!showAdd ? (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
            >
              <Plus className="w-4 h-4" /> Nova Meta
            </button>
          ) : (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Adicionar Meta</h3>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div className="col-span-2">
                <label className="text-[10px] text-muted-foreground block mb-1">Nome</label>
                <input value={newMeta.nome} onChange={e => setNewMeta(prev => ({ ...prev, nome: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-xs outline-none" placeholder="Ex: Vendas Semanal" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Tipo</label>
                <select value={newMeta.tipo} onChange={e => setNewMeta(prev => ({ ...prev, tipo: e.target.value as Meta['tipo'] }))} className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-xs outline-none">
                  {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Formato</label>
                <select value={newMeta.formato} onChange={e => setNewMeta(prev => ({ ...prev, formato: e.target.value as Meta['formato'] }))} className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-xs outline-none">
                  {Object.entries(FORMATO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Valor Meta</label>
                <input type="number" value={newMeta.meta || ''} onChange={e => setNewMeta(prev => ({ ...prev, meta: Number(e.target.value) }))} className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-xs outline-none" placeholder="500" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Período</label>
                <select value={newMeta.periodo} onChange={e => setNewMeta(prev => ({ ...prev, periodo: e.target.value as Meta['periodo'] }))} className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-xs outline-none">
                  {Object.entries(PERIODO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Atribuir a</label>
                <select value={newMeta.usuario || 'todos'} onChange={e => setNewMeta(prev => ({ ...prev, usuario: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-xs outline-none">
                  <option value="todos">Todos</option>
                  {allUsers.map((u: any) => (
                    <option key={u.username} value={u.username}>{u.nome || u.username}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAdd} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90">
                <Save className="w-3.5 h-3.5" /> Salvar
              </button>
              <button onClick={() => setShowAdd(false)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:text-foreground">
                <X className="w-3.5 h-3.5" /> Cancelar
              </button>
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
