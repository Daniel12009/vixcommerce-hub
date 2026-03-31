import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LogIn, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Preencha todos os campos.');
      return;
    }
    setError('');
    setLoading(true);

    // Small delay for visual feedback (feels like validating)
    await new Promise(r => setTimeout(r, 800));

    const result = await login(username.trim(), password);
    if (!result.success) {
      setError(result.error || 'Erro ao fazer login.');
      setLoading(false);
    }
    // If success, stay loading — splash screen will take over
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
        top: '20%', left: '50%', transform: 'translateX(-50%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%', maxWidth: 400, padding: '0 24px',
        position: 'relative', zIndex: 1,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <img
            src="/nexusiq-logo.png"
            alt="NexusIQ"
            style={{
              maxWidth: 280, height: 'auto', margin: '0 auto 16px',
              display: 'block',
              filter: 'brightness(0) invert(1)',
            }}
          />
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{
          background: 'rgba(30, 41, 59, 0.8)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          borderRadius: 16, padding: 32,
          opacity: loading ? 0.85 : 1,
          transition: 'opacity 0.3s',
          pointerEvents: loading ? 'none' : 'auto',
        }}>
          <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: '0 0 24px', textAlign: 'center' }}>
            Entrar no Painel
          </h2>

          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 20,
              animation: 'shake 0.4s ease-in-out',
            }}>
              <AlertCircle style={{ width: 16, height: 16, color: '#ef4444', flexShrink: 0 }} />
              <span style={{ color: '#fca5a5', fontSize: 13 }}>{error}</span>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>
              Usuário
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value.toUpperCase())}
              placeholder="Usuário"
              autoFocus
              disabled={loading}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10,
                background: loading ? 'rgba(15, 23, 42, 0.3)' : 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                color: '#fff', fontSize: 14, outline: 'none',
                transition: 'border-color 0.2s, background 0.3s',
                boxSizing: 'border-box',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(99, 102, 241, 0.5)'}
              onBlur={e => e.target.style.borderColor = 'rgba(99, 102, 241, 0.2)'}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>
              Senha
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Senha"
                disabled={loading}
                style={{
                  width: '100%', padding: '12px 44px 12px 14px', borderRadius: 10,
                  background: loading ? 'rgba(15, 23, 42, 0.3)' : 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(99, 102, 241, 0.2)',
                  color: '#fff', fontSize: 14, outline: 'none',
                  transition: 'border-color 0.2s, background 0.3s',
                  boxSizing: 'border-box',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(99, 102, 241, 0.5)'}
                onBlur={e => e.target.style.borderColor = 'rgba(99, 102, 241, 0.2)'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                disabled={loading}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                }}
              >
                {showPassword
                  ? <EyeOff style={{ width: 18, height: 18, color: 'rgba(255,255,255,0.4)' }} />
                  : <Eye style={{ width: 18, height: 18, color: 'rgba(255,255,255,0.4)' }} />
                }
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
              background: loading
                ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
                : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', fontSize: 14, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.3s',
              boxShadow: loading
                ? '0 4px 30px rgba(99, 102, 241, 0.5)'
                : '0 4px 20px rgba(99, 102, 241, 0.3)',
            }}
            onMouseDown={e => !loading && ((e.target as HTMLElement).style.transform = 'scale(0.98)')}
            onMouseUp={e => (e.target as HTMLElement).style.transform = 'scale(1)'}
          >
            {loading ? (
              <>
                <Loader2 style={{ width: 18, height: 18, animation: 'spin 0.8s linear infinite' }} />
                Validando...
              </>
            ) : (
              <>
                <LogIn style={{ width: 18, height: 18 }} />
                Entrar
              </>
            )}
          </button>
        </form>

        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center', marginTop: 24 }}>
          NexusIQ © 2026 · Gestão E-commerce
        </p>
      </div>

      <style>{`
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 40px rgba(99, 102, 241, 0.4); }
          50% { box-shadow: 0 0 60px rgba(99, 102, 241, 0.6); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
