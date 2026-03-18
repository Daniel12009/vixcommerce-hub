interface StatusBadgeProps {
  status: 'green' | 'yellow' | 'red' | 'Ativo' | 'Inativo' | 'Rascunho';
}

const config = {
  green: { label: 'Saudável', classes: 'stock-green' },
  yellow: { label: 'Atenção', classes: 'stock-yellow' },
  red: { label: 'Crítico', classes: 'stock-red' },
  Ativo: { label: 'Ativo', classes: 'stock-green' },
  Inativo: { label: 'Inativo', classes: 'stock-red' },
  Rascunho: { label: 'Rascunho', classes: 'stock-yellow' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const { label, classes } = config[status];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${classes}`}>
      {label}
    </span>
  );
}
