import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface VixUser {
  id: string;
  username: string;
  nome: string;
  setor: string;
  role: 'admin' | 'manager' | 'viewer';
  ativo: boolean;
  allowed_modules?: string[];
}

interface AuthContextType {
  user: VixUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  allUsers: VixUser[];
  refreshUsers: () => Promise<void>;
  createUser: (data: { username: string; password: string; nome: string; setor: string; role: string; allowed_modules?: string[] }) => Promise<{ success: boolean; error?: string }>;
  updateUser: (id: string, data: Partial<{ nome: string; setor: string; role: string; ativo: boolean; password: string; allowed_modules: string[] }>) => Promise<{ success: boolean; error?: string }>;
  deleteUser: (id: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_KEY = 'vix_session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<VixUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<VixUser[]>([]);

  // Restore session on mount
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as VixUser;
        setUser(parsed);
      } catch {}
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const { data, error } = await (supabase as any)
        .from('vix_users')
        .select('*')
        .eq('username', username.toUpperCase())
        .eq('ativo', true)
        .maybeSingle();

      if (error) return { success: false, error: 'Erro ao conectar. Tente novamente.' };
      if (!data) return { success: false, error: 'Usuário não encontrado ou inativo.' };

      // Simple password check (plaintext for now — can be hashed later)
      if (data.password_hash !== password) {
        return { success: false, error: 'Senha incorreta.' };
      }

      const vixUser: VixUser = {
        id: data.id,
        username: data.username,
        nome: data.nome,
        setor: data.setor,
        role: data.role as VixUser['role'],
        ativo: data.ativo,
        allowed_modules: data.allowed_modules || [],
      };

      setUser(vixUser);
      localStorage.setItem(SESSION_KEY, JSON.stringify(vixUser));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro desconhecido' };
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
  }, []);

  const refreshUsers = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('vix_users')
        .select('id, username, nome, setor, role, ativo, allowed_modules, created_at')
        .order('created_at', { ascending: true });

      if (!error && data) {
        setAllUsers(data.map((u: any) => ({
          id: u.id,
          username: u.username,
          nome: u.nome,
          setor: u.setor,
          role: u.role,
          ativo: u.ativo,
          allowed_modules: u.allowed_modules || [],
        })));
      }
    } catch {}
  }, []);

  const createUser = useCallback(async (userData: { username: string; password: string; nome: string; setor: string; role: string; allowed_modules?: string[] }) => {
    try {
      const { error } = await (supabase as any)
        .from('vix_users')
        .insert({
          username: userData.username.toUpperCase(),
          password_hash: userData.password,
          nome: userData.nome,
          setor: userData.setor,
          role: userData.role,
          allowed_modules: userData.allowed_modules || [],
        });

      if (error) {
        if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
          return { success: false, error: 'Usuário já existe.' };
        }
        return { success: false, error: error.message };
      }
      await refreshUsers();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [refreshUsers]);

  const updateUser = useCallback(async (id: string, data: Partial<{ nome: string; setor: string; role: string; ativo: boolean; password: string; allowed_modules: string[] }>) => {
    try {
      const updateData: any = {};
      if (data.nome !== undefined) updateData.nome = data.nome;
      if (data.setor !== undefined) updateData.setor = data.setor;
      if (data.role !== undefined) updateData.role = data.role;
      if (data.ativo !== undefined) updateData.ativo = data.ativo;
      if (data.password) updateData.password_hash = data.password;
      if (data.allowed_modules !== undefined) updateData.allowed_modules = data.allowed_modules;

      const { error } = await (supabase as any)
        .from('vix_users')
        .update(updateData)
        .eq('id', id);

      if (error) return { success: false, error: error.message };

      // Update current session if editing self
      if (user?.id === id) {
        const updated = { ...user, ...data };
        delete (updated as any).password;
        setUser(updated as VixUser);
        localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
      }

      await refreshUsers();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [user, refreshUsers]);

  const deleteUser = useCallback(async (id: string) => {
    try {
      const { error } = await (supabase as any)
        .from('vix_users')
        .delete()
        .eq('id', id);

      if (error) return { success: false, error: error.message };
      await refreshUsers();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [refreshUsers]);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout,
      allUsers,
      refreshUsers,
      createUser,
      updateUser,
      deleteUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
