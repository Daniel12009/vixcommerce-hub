import { useState, useEffect, Fragment } from 'react';
import { useAuth, type VixUser } from '@/contexts/AuthContext';
import { UserPlus, Trash2, Edit3, Save, X, Shield, Eye, Users, ChevronLeft, ToggleLeft, ToggleRight } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  viewer: 'Visualizador',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-500/10 text-purple-400',
  manager: 'bg-blue-500/10 text-blue-400',
  viewer: 'bg-gray-500/10 text-gray-400',
};

const MODULOS_DISPONIVEIS = [
  { id: 'atualizar', label: '📈 Performance' },
  { id: 'estoque', label: '📦 Estoque' },
  { id: 'devolucao', label: '🔄 Devolução' },
  { id: 'financeiro', label: '💰 Financeiro' },
  { id: 'cadastro', label: '📄 Ficha Técnica' },
  { id: 'marketing', label: '📢 Ads / Marketing' },
  { id: 'atendimento', label: '💬 Atendimento' },
  { id: 'compras', label: '🛒 Compras S&OP' }
];

export function UserManagementPage({ onBack }: { onBack: () => void }) {
  const { user: currentUser, allUsers, refreshUsers, createUser, updateUser, deleteUser } = useAuth();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ username: '', password: '', nome: '', setor: '', role: 'viewer', allowed_modules: [] as string[] });
  const [editForm, setEditForm] = useState({ nome: '', setor: '', role: '', password: '', allowed_modules: [] as string[] });
  const [msg, setMsg] = useState('');

  useEffect(() => { refreshUsers(); }, [refreshUsers]);

  const handleCreate = async () => {
    if (!form.username.trim() || !form.password.trim() || !form.nome.trim()) {
      setMsg('Preencha usuário, senha e nome.');
      return;
    }
    const result = await createUser(form);
    if (result.success) {
      setForm({ username: '', password: '', nome: '', setor: '', role: 'viewer', allowed_modules: [] });
      setShowCreateForm(false);
      setMsg('Usuário criado com sucesso!');
      setTimeout(() => setMsg(''), 3000);
    } else {
      setMsg(result.error || 'Erro ao criar.');
    }
  };

  const handleStartEdit = (u: VixUser) => {
    setEditingId(u.id);
    setEditForm({ nome: u.nome, setor: u.setor, role: u.role, password: '', allowed_modules: u.allowed_modules || [] });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const data: any = { nome: editForm.nome, setor: editForm.setor, role: editForm.role, allowed_modules: editForm.allowed_modules };
    if (editForm.password.trim()) data.password = editForm.password;
    const result = await updateUser(editingId, data);
    if (result.success) {
      setEditingId(null);
      setMsg('Atualizado!');
      setTimeout(() => setMsg(''), 3000);
    } else {
      setMsg(result.error || 'Erro.');
    }
  };

  const handleToggleAtivo = async (u: VixUser) => {
    await updateUser(u.id, { ativo: !u.ativo });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;
    await deleteUser(id);
  };

  const isAdmin = currentUser?.role === 'admin';

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-muted transition-colors">
          <ChevronLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Gerenciamento de Usuários
          </h2>
          <p className="text-sm text-muted-foreground">Criar, editar e gerenciar acessos ao painel</p>
        </div>
      </div>

      {msg && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-primary/10 text-primary text-sm font-medium">
          {msg}
        </div>
      )}

      {/* Create User Button */}
      {isAdmin && (
        <div className="mb-6">
          {!showCreateForm ? (
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <UserPlus className="w-4 h-4" />
              Novo Usuário
            </button>
          ) : (
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Criar Novo Usuário</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Usuário *</label>
                  <input
                    value={form.username}
                    onChange={e => setForm(f => ({ ...f, username: e.target.value.toUpperCase() }))}
                    placeholder="Ex: MARIA"
                    className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-sm border-none outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Senha *</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Senha"
                    className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-sm border-none outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Nome Completo *</label>
                  <input
                    value={form.nome}
                    onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                    placeholder="Maria Silva"
                    className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-sm border-none outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Setor</label>
                  <input
                    value={form.setor}
                    onChange={e => setForm(f => ({ ...f, setor: e.target.value }))}
                    placeholder="Ex: ATENDIMENTO"
                    className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-sm border-none outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Permissão</label>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="px-3 py-2 rounded-lg bg-muted text-foreground text-sm border-none outline-none"
                >
                  <option value="admin">Administrador</option>
                  <option value="manager">Gerente</option>
                  <option value="viewer">Visualizador</option>
                </select>
              </div>

              {form.role !== 'admin' && (
                <div className="pt-2">
                  <label className="text-xs text-muted-foreground block mb-2 font-medium">Módulos Permitidos</label>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 bg-muted/30 p-3 rounded-lg border border-border">
                    {MODULOS_DISPONIVEIS.map(mod => (
                      <label key={mod.id} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={form.allowed_modules.includes(mod.id)}
                          onChange={e => {
                            if (e.target.checked) setForm(f => ({ ...f, allowed_modules: [...f.allowed_modules, mod.id] }));
                            else setForm(f => ({ ...f, allowed_modules: f.allowed_modules.filter(id => id !== mod.id) }));
                          }}
                          className="w-3.5 h-3.5 rounded border-border accent-primary bg-background"
                        />
                        <span className="text-xs text-foreground group-hover:text-primary transition-colors">{mod.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={handleCreate}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
                >
                  <Save className="w-3.5 h-3.5" />
                  Criar Usuário
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Users List */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Usuário</th>
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Nome</th>
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Setor</th>
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Permissão</th>
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-center">Status</th>
              {isAdmin && <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {allUsers.map(u => (
              <Fragment key={u.id}>
                <tr className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  {editingId === u.id ? (
                    <>
                      <td className="px-4 py-2.5 text-sm font-mono text-foreground">{u.username}</td>
                      <td className="px-4 py-2.5">
                        <input value={editForm.nome} onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))} className="px-2 py-1 rounded bg-muted text-foreground text-xs w-full outline-none" />
                      </td>
                      <td className="px-4 py-2.5">
                        <input value={editForm.setor} onChange={e => setEditForm(f => ({ ...f, setor: e.target.value }))} className="px-2 py-1 rounded bg-muted text-foreground text-xs w-full outline-none" />
                      </td>
                      <td className="px-4 py-2.5">
                        <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} className="px-2 py-1 rounded bg-muted text-foreground text-xs outline-none">
                          <option value="admin">Admin</option>
                          <option value="manager">Gerente</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </td>
                      <td className="px-4 py-2.5">
                        <input type="password" placeholder="Nova senha (opcional)" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} className="px-2 py-1 rounded bg-muted text-foreground text-xs w-full outline-none" />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={handleSaveEdit} className="p-1.5 rounded hover:bg-primary/10 text-primary"><Save className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setEditingId(null)} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2.5 text-sm font-mono font-semibold text-foreground">{u.username}</td>
                      <td className="px-4 py-2.5 text-sm text-foreground">{u.nome || '-'}</td>
                      <td className="px-4 py-2.5 text-sm text-foreground">{u.setor || '-'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${ROLE_COLORS[u.role] || ''}`}>
                          {ROLE_LABELS[u.role] || u.role}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {isAdmin ? (
                          <button onClick={() => handleToggleAtivo(u)} title={u.ativo ? 'Desativar' : 'Ativar'}>
                            {u.ativo
                              ? <ToggleRight className="w-5 h-5 text-emerald-400 inline" />
                              : <ToggleLeft className="w-5 h-5 text-red-400 inline" />
                            }
                          </button>
                        ) : (
                          <span className={`text-xs font-semibold ${u.ativo ? 'text-emerald-400' : 'text-red-400'}`}>
                            {u.ativo ? 'Ativo' : 'Inativo'}
                          </span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleStartEdit(u)} className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="Editar">
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {u.id !== currentUser?.id && (
                              <button onClick={() => handleDelete(u.id)} className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors" title="Excluir">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </>
                  )}
                </tr>

                {/* Linha expandida de edição dos modulos se estiver editando este usuário */}
                {editingId === u.id && (
                  <tr className="border-b border-border/50 bg-muted/5">
                    <td colSpan={6} className="px-4 py-3 border-l-4 border-l-primary/50">
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">Mapeamento de Acessos ({editForm.role === 'admin' ? 'Acesso Total Liberado' : 'Acesso Restrito'}):</span>
                        {editForm.role !== 'admin' ? (
                          <div className="flex flex-wrap gap-3 mt-1">
                            {MODULOS_DISPONIVEIS.map(mod => (
                              <label key={mod.id} className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editForm.allowed_modules.includes(mod.id)}
                                  onChange={e => {
                                    if (e.target.checked) setEditForm(f => ({ ...f, allowed_modules: [...f.allowed_modules, mod.id] }));
                                    else setEditForm(f => ({ ...f, allowed_modules: f.allowed_modules.filter(id => id !== mod.id) }));
                                  }}
                                  className="w-3.5 h-3.5 rounded border-border accent-primary"
                                />
                                <span className="text-[11px] text-foreground">{mod.label}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-emerald-400">Admins têm acesso a todos os módulos automaticamente.</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {allUsers.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                  Nenhum usuário cadastrado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
