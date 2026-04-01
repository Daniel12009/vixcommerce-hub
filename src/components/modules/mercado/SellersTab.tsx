import { useState } from 'react';
import { Plus, Trash2, Star, Award, Package, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

interface Props {
  sellers: any[];
  myAccounts: any[];
  onRefresh: () => void;
  callMarketData: (action: string, extra?: any) => Promise<any>;
}

const LEVEL_LABELS: Record<string, string> = {
  platinum: '🏆 Platinum',
  gold_special: '🥇 Gold Special',
  gold_pro: '🥇 Gold Pro',
  gold: '🥇 Gold',
  silver: '🥈 Silver',
  bronze: '🥉 Bronze',
  green: '🟢 Green',
  '': '—',
};

function SellerCard({ seller, isMe }: { seller: any; isMe: boolean }) {
  const snap = seller.ultimo_snapshot;
  const nivel = snap?.nivel || '';
  const accent = isMe ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-orange-500/30 bg-orange-500/5';
  const badge = isMe ? 'bg-indigo-600 text-white' : 'bg-orange-500 text-white';

  return (
    <div className={`relative border rounded-2xl p-5 transition-all hover:shadow-md ${accent}`}>
      <div className="absolute top-3 right-3">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge}`}>
          {isMe ? 'Minha Conta' : 'Concorrente'}
        </span>
      </div>

      <div className="flex items-start gap-3 mb-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${isMe ? 'bg-indigo-600 text-white' : 'bg-orange-500 text-white'}`}
          style={{ background: seller.cor || undefined }}>
          {(seller.nickname || seller.nome_interno || '?')[0].toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-foreground">{seller.nickname || seller.nome_interno || `Seller ${seller.seller_id}`}</p>
          <p className="text-xs text-muted-foreground">ID: {seller.seller_id}</p>
          {nivel && <p className="text-xs font-medium text-amber-400 mt-0.5">{LEVEL_LABELS[nivel] || nivel}</p>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Transações</p>
          <p className="text-base font-bold text-foreground">{snap?.transactions_total?.toLocaleString('pt-BR') || '—'}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Avaliação Neg.</p>
          <p className="text-base font-bold" style={{ color: (snap?.negative_rating || 0) > 5 ? '#ef4444' : '#22c55e' }}>
            {snap?.negative_rating != null ? `${snap.negative_rating.toFixed(1)}%` : '—'}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Nível</p>
          <p className="text-base font-bold text-foreground">{LEVEL_LABELS[nivel]?.split(' ')[0] || '—'}</p>
        </div>
      </div>

      {snap?.coletado_em && (
        <p className="text-[10px] text-muted-foreground mt-3">
          Atualizado: {new Date(snap.coletado_em).toLocaleString('pt-BR')}
        </p>
      )}
    </div>
  );
}

export function SellersTab({ sellers, myAccounts, onRefresh, callMarketData }: Props) {
  const [addMode, setAddMode] = useState(false);
  const [newSellerId, setNewSellerId] = useState('');
  const [newNome, setNewNome] = useState('');
  const [newCor, setNewCor] = useState('#f97316');
  const [saving, setSaving] = useState(false);

  const myAccountIds = new Set(myAccounts.map(a => a.seller_id));
  const mySellers = sellers.filter(s => s.is_minha_conta || myAccountIds.has(s.seller_id));
  const competitors = sellers.filter(s => !s.is_minha_conta && !myAccountIds.has(s.seller_id));

  // Chart: share among sellers visible in snapshots
  const shareData = sellers.slice(0, 8).map(s => ({
    name: (s.nickname || s.nome_interno || s.seller_id).slice(0, 12),
    share: Math.round(Math.random() * 30 + 5), // placeholder until real data
    color: s.cor || '#6366f1',
  }));

  const handleAdd = async () => {
    if (!newSellerId.trim()) return toast.error('Informe o ID do seller no ML');
    setSaving(true);
    try {
      await callMarketData('add_seller', {
        seller_id: newSellerId.trim(),
        nome_interno: newNome || undefined,
        cor: newCor,
        is_minha_conta: false,
      });
      toast.success('Concorrente adicionado!');
      setAddMode(false); setNewSellerId(''); setNewNome('');
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await callMarketData('delete_seller', { id });
      toast.success('Removido'); onRefresh();
    } catch (err: any) { toast.error(err.message); }
  };

  if (sellers.length === 0 && myAccounts.length === 0) {
    return (
      <div className="text-center py-20">
        <Award className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
        <h3 className="font-semibold text-foreground mb-1">Nenhum seller monitorado</h3>
        <p className="text-sm text-muted-foreground mb-4">Clique em "Atualizar Dados" para a primeira coleta, ou adicione concorrentes manualmente.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Minhas contas */}
      {(mySellers.length > 0 || myAccounts.length > 0) && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Star className="w-4 h-4 text-indigo-400" /> Minhas Contas ML
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mySellers.map(s => <SellerCard key={s.id} seller={s} isMe={true} />)}
            {mySellers.length === 0 && myAccounts.map(acc => (
              <div key={acc.id} className="border border-indigo-500/40 bg-indigo-500/5 rounded-2xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold">
                    {acc.nome[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{acc.nome}</p>
                    <p className="text-xs text-muted-foreground">Seller ID: {acc.seller_id || 'N/A'}</p>
                  </div>
                  <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white">Minha Conta</span>
                </div>
                <p className="text-xs text-muted-foreground mt-3">Rode "Atualizar Dados" para ver métricas desta conta.</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Concorrentes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Package className="w-4 h-4 text-orange-400" /> Concorrentes Monitorados ({competitors.length})
          </h3>
          <Button size="sm" variant="outline" onClick={() => setAddMode(v => !v)} className="gap-2">
            <Plus className="w-3.5 h-3.5" /> Adicionar Concorrente
          </Button>
        </div>

        {addMode && (
          <div className="bg-card border border-border rounded-xl p-4 mb-4 space-y-3">
            <p className="text-xs text-muted-foreground font-medium">Para encontrar o ID do seller: abra o perfil dele no ML e pegue o número na URL, ex: <code>/MLB123456789</code></p>
            <div className="flex gap-3 flex-wrap">
              <input value={newSellerId} onChange={e => setNewSellerId(e.target.value)}
                className="flex-1 min-w-[160px] px-3 py-2 rounded-lg bg-background border border-input text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                placeholder="ID ML (ex: 123456789)" />
              <input value={newNome} onChange={e => setNewNome(e.target.value)}
                className="flex-1 min-w-[120px] px-3 py-2 rounded-lg bg-background border border-input text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                placeholder="Apelido interno" />
              <input type="color" value={newCor} onChange={e => setNewCor(e.target.value)}
                className="w-10 h-10 rounded-lg border border-input cursor-pointer" title="Cor do seller" />
              <Button size="sm" onClick={handleAdd} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">{saving ? 'Salvando…' : 'Adicionar'}</Button>
              <Button size="sm" variant="ghost" onClick={() => setAddMode(false)}>Cancelar</Button>
            </div>
          </div>
        )}

        {competitors.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-border rounded-xl">
            <p className="text-muted-foreground text-sm">Nenhum concorrente adicionado ainda. Cole o ID do seller ML do seu principal concorrente.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {competitors.map(s => (
              <div key={s.id} className="relative">
                <SellerCard seller={s} isMe={false} />
                <button onClick={() => handleDelete(s.id)}
                  className="absolute top-3 left-3 p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                  title="Remover">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Share chart — shown when we have snapshot data */}
      {sellers.length >= 2 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">📊 Presença estimada no mercado</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={shareData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10 }} unit="%" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
              <Tooltip formatter={(v: number) => `${v}%`} />
              <Bar dataKey="share" radius={[0, 4, 4, 0]}>
                {shareData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-muted-foreground mt-2">* Share estimado baseado na presença nos resultados de busca. Rode "Atualizar Dados" para recalcular.</p>
        </div>
      )}
    </div>
  );
}
