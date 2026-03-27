import { Bell, Search } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 md:mb-8">
      <div className="min-w-0">
        <h2 className="text-xl md:text-2xl font-bold text-foreground truncate">{title}</h2>
        {subtitle && <p className="text-muted-foreground text-xs md:text-sm mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative flex-1 sm:flex-none">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Pesquisar SKU..."
            className="pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full sm:w-48 lg:w-64"
          />
        </div>
        <button className="relative p-2 rounded-lg hover:bg-secondary transition-colors flex-shrink-0">
          <Bell className="w-5 h-5 text-muted-foreground" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-vix-danger rounded-full" />
        </button>
      </div>
    </header>
  );
}
