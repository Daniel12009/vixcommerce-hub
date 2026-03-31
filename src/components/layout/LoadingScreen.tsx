import { useState, useEffect } from 'react';

const quotes = [
  { text: 'Carregando seus dados...', emoji: '☕' },
  { text: 'Preparando o painel para você...', emoji: '🚀' },
  { text: 'Quem acompanha, cresce. Vamos lá!', emoji: '📈' },
  { text: 'Organizando tudo para você dominar o dia!', emoji: '💪' },
  { text: 'Conectando com suas informações...', emoji: '🔗' },
  { text: 'Sucesso é construído com dados e ação!', emoji: '🏆' },
  { text: 'Seu painel está quase pronto...', emoji: '⚡' },
  { text: 'Cada venda conta. Cada dado importa!', emoji: '🎯' },
  { text: 'Performance é resultado de consistência!', emoji: '🔥' },
  { text: 'Os melhores e-commerces usam dados!', emoji: '💎' },
];

export function LoadingScreen() {
  const [quoteIdx, setQuoteIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const initialDelay = setTimeout(() => {
      const interval = setInterval(() => {
        setFade(false);
        setTimeout(() => {
          setQuoteIdx(prev => (prev + 1) % quotes.length);
          setFade(true);
        }, 400);
      }, 3000);
      return () => clearInterval(interval);
    }, 2500);
    return () => clearTimeout(initialDelay);
  }, []);

  const quote = quotes[quoteIdx];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
    }}>
      {/* Logo */}
      <img
        src="/nexusiq-logo.png"
        alt="NexusIQ"
        style={{
          maxWidth: 280, height: 'auto', marginBottom: 40,
          filter: 'brightness(0) invert(1)',
          animation: 'pulse-glow 2s ease-in-out infinite',
        }}
      />

      {/* Spinner */}
      <div style={{
        width: 40, height: 40, marginBottom: 32,
        border: '3px solid rgba(255,255,255,0.1)',
        borderTopColor: '#6366f1',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />

      {/* Quote */}
      <div style={{
        textAlign: 'center', minHeight: 60,
        transition: 'opacity 0.4s ease',
        opacity: fade ? 1 : 0,
      }}>
        <span style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>
          {quote.emoji}
        </span>
        <p style={{
          color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: 500,
          margin: 0, maxWidth: 360,
        }}>
          {quote.text}
        </p>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 40px rgba(99, 102, 241, 0.4); }
          50% { box-shadow: 0 0 60px rgba(99, 102, 241, 0.6); }
        }
      `}</style>
    </div>
  );
}
