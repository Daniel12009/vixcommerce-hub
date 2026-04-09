import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Trash2 } from 'lucide-react';

interface CompetitorItem {
  id: string;
  item_id: string;
  label: string;
}

interface Props { sellerId: string; }

export function CompetitorItemsManager({ sellerId }: Props) {
  const [items, setItems] = useState<CompetitorItem[]>([]);
  const [newItemId, setNewItemId] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    (supabase
      .from('ml_competitor_items' as any)
      .select('*') as any)
      .eq('seller_id', sellerId)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => setItems((data as CompetitorItem[]) ?? []));
  }, [sellerId]);

  const add = async () => {
    if (!newItemId.trim() || !newLabel.trim()) return;
    setAdding(true);
    const { data } = await (supabase
      .from('ml_competitor_items' as any) as any)
      .insert({
        seller_id: sellerId,
        item_id: newItemId.trim().toUpperCase(),
        label: newLabel.trim(),
      })
      .select()
      .single();
    if (data) setItems(prev => [data as CompetitorItem, ...prev]);
    setNewItemId('');
    setNewLabel('');
    setAdding(false);
  };

  const remove = async (id: string) => {
    await (supabase.from('ml_competitor_items' as any) as any).update({ active: false }).eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-4">
      <p className="text-sm font-medium text-foreground mb-1">Concorrentes monitorados</p>
      <p className="text-xs text-muted-foreground mb-4">
        Adicione o ID de produtos do ML dos seus concorrentes. A IA analisa as perguntas e respostas
        públicas desses itens para sugerir templates.
      </p>

      {/* Lista */}
      {items.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {items.map(item => (
            <div key={item.id} className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-mono">
                  {item.item_id}
                </span>
                <span className="text-sm text-foreground">{item.label}</span>
              </div>
              <button
                onClick={() => remove(item.id)}
                className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                title="Remover"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Form */}
      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex-1 min-w-32">
          <p className="text-[10px] text-muted-foreground mb-1">Item ID do ML</p>
          <input
            type="text"
            placeholder="Ex: MLB903218023"
            value={newItemId}
            onChange={e => setNewItemId(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
          />
        </div>
        <div className="flex-[1.4] min-w-40">
          <p className="text-[10px] text-muted-foreground mb-1">Apelido</p>
          <input
            type="text"
            placeholder="Ex: Concorrente A — Torneiras"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <button
          onClick={add}
          disabled={adding || !newItemId.trim() || !newLabel.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 text-xs font-medium hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          {adding ? 'Adicionando...' : 'Adicionar'}
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground mt-2">
        O item_id está na URL: mercadolivre.com.br/p/<strong>MLB903218023</strong>
      </p>
    </div>
  );
}
