import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Key, Link as LinkIcon, Loader2, Database, AlertCircle, Save, X, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Tipos para as contas
interface MLAccount {
  id: string; nome: string; seller_id: string; client_id: string; client_secret: string; access_token?: string; refresh_token?: string; ativo: boolean; cmv_spreadsheet_id?: string; cmv_sheet_tab?: string;
}
interface ShopeeAccount {
  id: string; nome: string; shop_id: string; partner_id: string; partner_key: string; access_token?: string; refresh_token?: string; ativo: boolean;
}
interface TinyAccount {
  id: string; nome: string; api_token: string; ativo: boolean;
}
interface OtherApiAccount {
  id: string; plataforma: string; nome: string; credentials: { app_key?: string; app_secret?: string; access_token?: string; [key: string]: any }; ativo: boolean;
}

export function ApiConfigSection() {
  const [loading, setLoading] = useState(true);
  const [mlAccounts, setMlAccounts] = useState<MLAccount[]>([]);
  const [shopeeAccounts, setShopeeAccounts] = useState<ShopeeAccount[]>([]);
  const [tinyAccounts, setTinyAccounts] = useState<TinyAccount[]>([]);
  const [otherAccounts, setOtherAccounts] = useState<OtherApiAccount[]>([]);

  // Modals/Forms state
  const [editingPlataforma, setEditingPlataforma] = useState<'ml' | 'shopee' | 'tiny' | 'other' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [mlRes, shopeeRes, tinyRes, otherRes] = await Promise.all([
        supabase.from('ml_accounts').select('*').order('nome'),
        supabase.from('shopee_accounts' as any).select('*').order('nome'),
        supabase.from('tiny_accounts' as any).select('*').order('nome'),
        supabase.from('other_api_accounts' as any).select('*').order('nome')
      ]);

      if (mlRes.error) throw mlRes.error;
      if (shopeeRes.error) throw shopeeRes.error;
      if (tinyRes.error) throw tinyRes.error;
      // if (otherRes.error) throw otherRes.error; // Ignoring error in case table isn't created yet for smooth UI

      setMlAccounts(mlRes.data || []);
      setShopeeAccounts((shopeeRes.data as any) || []);
      setTinyAccounts((tinyRes.data as any) || []);
      setOtherAccounts((otherRes.data as any) || []);
    } catch (err: any) {
      toast.error('Erro ao carregar contas de API: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (plataforma: 'ml' | 'shopee' | 'tiny' | 'other', account: any) => {
    setEditingPlataforma(plataforma);
    setEditingId(account ? account.id : null);
    setFormData(account ? { ...account } : { ativo: true });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlataforma) return;
    setSaving(true);
    const table = editingPlataforma === 'other' ? 'other_api_accounts' : `${editingPlataforma}_accounts`;
    
    try {
      if (editingId) {
        // Update
        const { error } = await supabase.from(table as any).update(formData).eq('id', editingId);
        if (error) throw error;
        toast.success('Integração atualizada com sucesso!');
      } else {
        // Insert
        const { error } = await supabase.from(table as any).insert(formData);
        if (error) throw error;
        toast.success('Integração adicionada com sucesso!');
      }
      
      setEditingPlataforma(null);
      setEditingId(null);
      setFormData({});
      loadData(); // recarrega a lista
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (plataforma: 'ml' | 'shopee' | 'tiny' | 'other', id: string) => {
    if (!confirm('Tem certeza que deseja remover esta integração? Se estiver sendo usada, os módulos vão falhar.')) return;
    const table = plataforma === 'other' ? 'other_api_accounts' : `${plataforma}_accounts`;
    try {
      const { error } = await supabase.from(table as any).delete().eq('id', id);
      if (error) throw error;
      toast.success('Integração removida!');
      loadData();
    } catch (err: any) {
      toast.error('Erro ao remover: ' + err.message);
    }
  };

  const PlatformCard = ({ title, icon: Icon, accounts, plataforma, colorClass }: any) => (
    <div className="bg-card border border-border rounded-xl mb-6 overflow-hidden animate-fade-in shadow-sm">
      <div className="px-6 py-4 flex items-center justify-between border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${colorClass}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">{accounts.length} contas conectadas ao Supabase</p>
          </div>
        </div>
        <button onClick={() => handleEdit(plataforma, null)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" /> Adicionar
        </button>
      </div>

      <div className="p-0">
        {accounts.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma integração {title} configurada.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/10 text-muted-foreground">
                <th className="px-6 py-3 text-left font-medium w-1/4">Nome da Conta</th>
                <th className="px-6 py-3 text-left font-medium w-1/4">Identificador Principal</th>
                <th className="px-6 py-3 text-left font-medium w-1/4">Status das Chaves</th>
                <th className="px-6 py-3 text-right font-medium w-1/4">Ações</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc: any) => (
                <tr key={acc.id} className="border-b border-border hover:bg-muted/30 transition-colors group">
                  <td className="px-6 py-4 font-semibold text-foreground flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${acc.ativo ? 'bg-[hsl(var(--vix-success))]' : 'bg-[hsl(var(--vix-danger))]'}`} />
                    {acc.nome} {acc.ativo ? '' : <span className="text-xs text-muted-foreground font-normal">(Inativo)</span>}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground font-mono text-xs">
                    {plataforma === 'ml' && (acc.seller_id || <span className="text-xs text-[hsl(var(--vix-warning))] relative flex items-center group-hover:block">Falta ID <AlertCircle className="inline w-3 h-3 ml-1"/></span>)}
                    {plataforma === 'shopee' && acc.shop_id}
                    {plataforma === 'tiny' && (acc.api_token ? '••••••••' + acc.api_token.slice(-4) : 'Sem token')}
                    {plataforma === 'other' && (
                      <span className="capitalize">{acc.plataforma}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-xs">
                    {plataforma === 'ml' || plataforma === 'shopee' ? (
                      <div className="flex flex-col gap-1">
                        <span className={acc.access_token ? 'text-[hsl(var(--vix-success))] font-medium' : 'text-muted-foreground'}>
                          {acc.access_token ? '✓ Token Válido' : '⚠️ Faltam Tokens'}
                        </span>
                        {plataforma === 'ml' && (
                          <span className={acc.cmv_spreadsheet_id ? 'text-[hsl(var(--vix-success))] font-medium' : 'text-muted-foreground opacity-80'}>
                            {acc.cmv_spreadsheet_id ? '✓ Planilha CMV' : '⚠️ Sem Planilha CMV'}
                          </span>
                        )}
                      </div>
                    ) : null}
                    {plataforma === 'tiny' && <span className="text-[hsl(var(--vix-success))] font-medium">✓ Chave Fixa configurada</span>}
                    {plataforma === 'other' && <span className="text-[hsl(var(--vix-success))] font-medium">✓ Credenciais salvas</span>}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEdit(plataforma, acc)} className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors" title="Editar Integração"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(plataforma, acc.id)} className="p-1.5 rounded-lg text-[hsl(var(--vix-danger))] hover:bg-[hsl(var(--vix-danger)/0.1)] transition-colors" title="Remover"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  if (loading) return <div className="p-12 text-center animate-fade-in"><Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" /></div>;

  return (
    <div className="animate-fade-in max-w-5xl mx-auto pb-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">APIs & Integrações</h2>
          <p className="text-muted-foreground text-sm mt-1">Gerencie chaves, tokens e contas conectadas diretamente ao banco Supabase.</p>
        </div>
      </div>

      <PlatformCard title="Mercado Livre" icon={Database} accounts={mlAccounts} plataforma="ml" colorClass="bg-[hsl(45,100%,50%,0.2)] text-[#fbbc04]" />
      <PlatformCard title="Tiny ERP" icon={Key} accounts={tinyAccounts} plataforma="tiny" colorClass="bg-[hsl(200,80%,50%,0.2)] text-[hsl(200,80%,50%)]" />
      <PlatformCard title="Shopee" icon={LinkIcon} accounts={shopeeAccounts} plataforma="shopee" colorClass="bg-[hsl(16,100%,60%,0.2)] text-[hsl(16,100%,60%)]" />
      <PlatformCard title="Outras Integrações (Shein, TikTok...)" icon={Database} accounts={otherAccounts} plataforma="other" colorClass="bg-primary/20 text-primary" />

      {/* MODAL / FORM INLINE */}
      {editingPlataforma && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
              <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" />
                {editingId ? 'Editar Integração' : 'Nova Integração'}
              </h3>
              <button onClick={() => setEditingPlataforma(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Nome da Conta / Loja <span className="text-[hsl(var(--vix-danger))]">*</span></label>
                <input required type="text" value={formData.nome || ''} onChange={e => setFormData({ ...formData, nome: e.target.value })} className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="Ex: Via Flix" />
              </div>

              {editingPlataforma === 'ml' && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                      Seller ID / User ID <a href="https://developers.mercadolivre.com.br/" target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5"><ExternalLink className="w-3 h-3" /> Devs</a>
                    </label>
                    <input type="text" value={formData.seller_id || ''} onChange={e => setFormData({ ...formData, seller_id: e.target.value })} className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background font-mono" placeholder="Ex: 897654321" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">Client ID (APP ID) <span className="text-[hsl(var(--vix-danger))]">*</span></label>
                    <input required type="text" value={formData.client_id || ''} onChange={e => setFormData({ ...formData, client_id: e.target.value })} className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background font-mono" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">Client Secret <span className="text-[hsl(var(--vix-danger))]">*</span></label>
                    <input required type="text" value={formData.client_secret || ''} onChange={e => setFormData({ ...formData, client_secret: e.target.value })} className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background font-mono" />
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-2 pt-2 border-t border-border">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Access Token</label>
                      <input type="text" value={formData.access_token || ''} onChange={e => setFormData({ ...formData, access_token: e.target.value })} className="w-full text-xs px-2 py-1.5 rounded-lg border border-border bg-background font-mono opacity-80" placeholder="APP_USR-..." />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Refresh Token</label>
                      <input type="text" value={formData.refresh_token || ''} onChange={e => setFormData({ ...formData, refresh_token: e.target.value })} className="w-full text-xs px-2 py-1.5 rounded-lg border border-border bg-background font-mono opacity-80" placeholder="TG-..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-2 pt-2 border-t border-border">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1" title="Copie o ID longo que fica na URL da URL da Planilha Google (depois de /d/)">ID da Planilha CMV <AlertCircle className="w-3 h-3" /></label>
                      <input type="text" value={formData.cmv_spreadsheet_id || ''} onChange={e => setFormData({ ...formData, cmv_spreadsheet_id: e.target.value })} className="w-full text-xs px-2 py-1.5 rounded-lg border border-border bg-background font-mono" placeholder="Ex: 1aB2c..." />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Aba do CMV</label>
                      <input type="text" value={formData.cmv_sheet_tab || ''} onChange={e => setFormData({ ...formData, cmv_sheet_tab: e.target.value })} className="w-full text-xs px-2 py-1.5 rounded-lg border border-border bg-background font-mono" placeholder="Ex: CMV (Padrão)" />
                    </div>
                  </div>
                </>
              )}

              {editingPlataforma === 'shopee' && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">Shop ID <span className="text-[hsl(var(--vix-danger))]">*</span></label>
                    <input required type="text" value={formData.shop_id || ''} onChange={e => setFormData({ ...formData, shop_id: e.target.value })} className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background font-mono" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">Partner ID <span className="text-[hsl(var(--vix-danger))]">*</span></label>
                    <input required type="text" value={formData.partner_id || ''} onChange={e => setFormData({ ...formData, partner_id: e.target.value })} className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background font-mono" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">Partner Key (Secret) <span className="text-[hsl(var(--vix-danger))]">*</span></label>
                    <input required type="text" value={formData.partner_key || ''} onChange={e => setFormData({ ...formData, partner_key: e.target.value })} className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background font-mono" />
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-2 pt-2 border-t border-border">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Access Token</label>
                      <input type="text" value={formData.access_token || ''} onChange={e => setFormData({ ...formData, access_token: e.target.value })} className="w-full text-xs px-2 py-1.5 rounded-lg border border-border bg-background font-mono opacity-80" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Refresh Token</label>
                      <input type="text" value={formData.refresh_token || ''} onChange={e => setFormData({ ...formData, refresh_token: e.target.value })} className="w-full text-xs px-2 py-1.5 rounded-lg border border-border bg-background font-mono opacity-80" />
                    </div>
                  </div>
                </>
              )}

              {editingPlataforma === 'tiny' && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">API Token <span className="text-[hsl(var(--vix-danger))]">*</span></label>
                  <input required type="text" value={formData.api_token || ''} onChange={e => setFormData({ ...formData, api_token: e.target.value })} className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background font-mono" placeholder="Token do Tiny ERP" />
                </div>
              )}

              {editingPlataforma === 'other' && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">Plataforma <span className="text-[hsl(var(--vix-danger))]">*</span></label>
                    <select
                      required
                      value={formData.plataforma || ''}
                      onChange={e => setFormData({ ...formData, plataforma: e.target.value })}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="" disabled>Selecione a plataforma</option>
                      <option value="shein">Shein</option>
                      <option value="tiktok">TikTok Shop</option>
                      <option value="amazon">Amazon</option>
                      <option value="magalu">Magalu</option>
                      <option value="americanas">Americanas</option>
                      <option value="custom">Outra (Personalizada)</option>
                    </select>
                  </div>
                  
                  {formData.plataforma === 'amazon' ? (
                    <>
                      <div className="space-y-1 mt-3">
                        <label className="text-xs font-semibold text-foreground flex items-center justify-between">Seller ID (Merchant Token) <span className="text-[hsl(var(--vix-danger))]">*</span></label>
                        <input required type="text" value={formData.credentials?.seller_id || ''} onChange={e => setFormData({ ...formData, credentials: { ...formData.credentials, seller_id: e.target.value } })} className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background font-mono" placeholder="A3XXXXXXX" />
                      </div>
                      <div className="space-y-1 mt-2">
                        <label className="text-xs font-semibold text-foreground flex items-center justify-between">LWA Client ID (App ID) <span className="text-[hsl(var(--vix-danger))]">*</span></label>
                        <input required type="text" value={formData.credentials?.client_id || ''} onChange={e => setFormData({ ...formData, credentials: { ...formData.credentials, client_id: e.target.value } })} className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background font-mono" placeholder="amzn1.application-oa2-client..." />
                      </div>
                      <div className="space-y-1 mt-2">
                        <label className="text-xs font-semibold text-foreground flex items-center justify-between">LWA Client Secret <span className="text-[hsl(var(--vix-danger))]">*</span></label>
                        <input required type="password" value={formData.credentials?.client_secret || ''} onChange={e => setFormData({ ...formData, credentials: { ...formData.credentials, client_secret: e.target.value } })} className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background font-mono" />
                      </div>
                      <div className="space-y-1 mt-2 border-t border-border pt-2">
                        <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Refresh Token Oauth <span className="text-[hsl(var(--vix-danger))]">*</span></label>
                        <input required type="text" value={formData.credentials?.refresh_token || ''} onChange={e => setFormData({ ...formData, credentials: { ...formData.credentials, refresh_token: e.target.value } })} className="w-full text-xs px-2 py-1.5 rounded-lg border border-border bg-background font-mono opacity-80" placeholder="Atzr|..." />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-1 mt-3">
                        <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                          App Key / ID <span className="text-[10px] text-muted-foreground font-normal">(Opcional)</span>
                        </label>
                        <input
                          type="text"
                          value={formData.credentials?.app_key || ''}
                          onChange={e => setFormData({ ...formData, credentials: { ...formData.credentials, app_key: e.target.value } })}
                          className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background font-mono"
                          placeholder="Chave pública, Key ou Client ID"
                        />
                      </div>
                      <div className="space-y-1 mt-2">
                        <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                          App Secret / Token <span className="text-[10px] text-muted-foreground font-normal">(Opcional)</span>
                        </label>
                        <input
                          type="password"
                          value={formData.credentials?.app_secret || ''}
                          onChange={e => setFormData({ ...formData, credentials: { ...formData.credentials, app_secret: e.target.value } })}
                          className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background font-mono"
                          placeholder="Chave secreta, Access Token ou Api Key"
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-2">
                        Diferentes plataformas exigem diferentes chaves. Preencha apenas os campos que a sua plataforma externa solicitar.
                      </p>
                    </>
                  )}
                </>
              )}

              <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" id="ativoChec" checked={formData.ativo} onChange={e => setFormData({ ...formData, ativo: e.target.checked })} className="accent-primary" />
                <label htmlFor="ativoChec" className="text-sm font-medium text-foreground cursor-pointer">Integração Ativa</label>
              </div>

              <div className="flex gap-3 pt-6">
                <button type="button" onClick={() => setEditingPlataforma(null)} className="flex-1 px-4 py-2 border border-border text-foreground text-sm font-semibold rounded-lg hover:bg-muted transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {editingId ? 'Salvar' : 'Adicionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
