import { RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';

export function DevolucaoPage() {
  return (
    <div>
      <PageHeader
        title="Devolução"
        subtitle="Controle de devoluções e trocas de produtos"
      />
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: 400, gap: 16,
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: 20,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: 0.8,
        }}>
          <RotateCcw size={36} color="#fff" />
        </div>
        <h2 style={{ color: 'var(--foreground)', fontSize: 22, fontWeight: 600, margin: 0 }}>
          Módulo em construção
        </h2>
        <p style={{ color: 'var(--muted-foreground)', fontSize: 14, maxWidth: 400, textAlign: 'center', margin: 0 }}>
          O módulo de devoluções está sendo preparado. Em breve você poderá gerenciar suas devoluções e trocas diretamente pelo painel.
        </p>
      </div>
    </div>
  );
}
