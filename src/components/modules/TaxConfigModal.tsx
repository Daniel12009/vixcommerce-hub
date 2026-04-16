import { useState, useEffect } from 'react';
import { Settings, X, Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TaxConfig {
  conta_id: string;
  regime: 'lucro_real' | 'simples';
  icms_pct: number;
  pis_cofins_pct: number;
  simples_pct: number;
}

interface TaxConfigRow {
  conta_id: string;
  regime: 'lucro_real' | 'simples';
  icms_pct: number | null;
  pis_cofins_pct: number | null;
  simples_pct: number | null;
  updated_at?: string | null;
}

interface MLAccount {
  id: string;
  nome: string;
}

const mlAccountTaxConfigTable = () => (supabase as any).from('ml_account_tax_config');

export function TaxConfigModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<MLAccount[]>([]);
  const [configs, setConfigs] = useState<Record<string, TaxConfig>>({});

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: accData, error: errAcc } = await supabase.from('ml_accounts').select('id, nome').eq('ativo', true).order('nome');
      if (errAcc) throw errAcc;
      setAccounts(accData || []);

      const { data: taxData, error: errTax } = await mlAccountTaxConfigTable().select('*');
      // If table doesn't exist yet gracefully ignore
      if (errTax && errTax.code !== '42P01') throw errTax;

      const confMap: Record<string, TaxConfig> = {};
      if (taxData) {
        (taxData as TaxConfigRow[]).forEach((t) => {
          confMap[t.conta_id] = {
            conta_id: t.conta_id,
            regime: t.regime,
            icms_pct: Number(t.icms_pct || 0),
            pis_cofins_pct: Number(t.pis_cofins_pct || 0),
            simples_pct: Number(t.simples_pct || 0),
          };
        });
      }
      setConfigs(confMap);
    } catch (err: any) {
      toast.error('Erro ao carregar configurações fiscais: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfigChange = (contaId: string, field: keyof TaxConfig, value: any) => {
    setConfigs(prev => {
      const current = prev[contaId] || { conta_id: contaId, regime: 'simples', icms_pct: 0, pis_cofins_pct: 0, simples_pct: 0 };
      return { ...prev, [contaId]: { ...current, [field]: value } };
    });
  };

  const handleSave = async (contaId: string) => {
    const conf = configs[contaId] || { conta_id: contaId, regime: 'simples', icms_pct: 0, pis_cofins_pct: 0, simples_pct: 0 };
    setSaving(true);
    try {
      const payload: TaxConfigRow = {
        conta_id: conf.conta_id,
        regime: conf.regime,
        icms_pct: conf.icms_pct,
        pis_cofins_pct: conf.pis_cofins_pct,
        simples_pct: conf.simples_pct,
        updated_at: new Date().toISOString()
      };

      const { error } = await mlAccountTaxConfigTable().upsert(payload, { onConflict: 'conta_id' });
      
      if (error) throw error;
      toast.success('Configuração fiscal salva com sucesso!');
    } catch (err: any) {
      toast.error('Erro ao salvar configuração: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-card w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl shadow-2xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
          <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-400" />
            Configuração Fiscal por Conta ML
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1 bg-background/50">
          {loading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Nenhuma conta do Mercado Livre ativa.</div>
          ) : (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground -mt-2">Configure o regime tributário e os impostos de cada conta para calcular o Lucro Líquido corretamente.</p>
              
              {accounts.map(acc => {
                const conf = configs[acc.id] || { conta_id: acc.id, regime: 'simples', icms_pct: 0, pis_cofins_pct: 0, simples_pct: 0 };
                return (
                  <div key={acc.id} className="p-4 bg-card border border-border rounded-xl shadow-sm mb-4">
                    <div className="flex items-center justify-between mb-3 border-b border-border pb-3">
                      <h4 className="font-semibold text-foreground">{acc.nome}</h4>
                      <button 
                        onClick={() => handleSave(acc.id)}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 text-indigo-500 text-xs font-semibold rounded-lg hover:bg-indigo-500/20 transition-colors disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="w-3 h-3 animate-spin"/> : <Save className="w-3 h-3" />}
                        Salvar Conta
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground">Regime Tributário</label>
                        <select 
                          value={conf.regime} 
                          onChange={(e) => handleConfigChange(acc.id, 'regime', e.target.value)}
                          className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background focus:ring-2 focus:ring-indigo-500/50"
                        >
                          <option value="simples">Simples Nacional</option>
                          <option value="lucro_real">Lucro Real / Presumido</option>
                        </select>
                      </div>

                      {conf.regime === 'simples' ? (
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-muted-foreground">Alíquota Simples (%)</label>
                          <input 
                            type="number" step="0.01" min="0" max="100"
                            value={conf.simples_pct} 
                            onChange={(e) => handleConfigChange(acc.id, 'simples_pct', parseFloat(e.target.value) || 0)}
                            className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background"
                          />
                        </div>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">ICMS (%)</label>
                            <input 
                              type="number" step="0.01" min="0" max="100"
                              value={conf.icms_pct} 
                              onChange={(e) => handleConfigChange(acc.id, 'icms_pct', parseFloat(e.target.value) || 0)}
                              className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">PIS/COFINS (%)</label>
                            <input 
                              type="number" step="0.01" min="0" max="100"
                              value={conf.pis_cofins_pct} 
                              onChange={(e) => handleConfigChange(acc.id, 'pis_cofins_pct', parseFloat(e.target.value) || 0)}
                              className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
