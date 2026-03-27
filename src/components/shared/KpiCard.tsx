import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import type { ReactNode } from 'react';

interface KpiCardProps {
  title: string;
  value: string;
  change?: number;
  icon: LucideIcon;
  delay?: number;
  extra?: ReactNode;
  subtitle?: string;
  trend?: string;
  valueColor?: string;
}

export function KpiCard({ title, value, change, icon: Icon, delay = 0, extra, subtitle, valueColor }: KpiCardProps) {
  return (
    <div
      className="bg-card border border-border rounded-xl p-3 md:p-5 vix-card-hover animate-fade-in overflow-hidden"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">{title}</p>
          <p className={`text-lg md:text-2xl font-bold mt-1 md:mt-2 animate-count-up truncate ${valueColor || 'text-foreground'}`}>{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          )}
          {change !== undefined && (
            <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${change >= 0 ? 'text-vix-success' : 'text-vix-danger'}`}>
              {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {change >= 0 ? '+' : ''}{change.toFixed(1)}% vs mês anterior
            </div>
          )}
          {extra && <div className="mt-1">{extra}</div>}
        </div>
        <div className="p-2 md:p-2.5 rounded-lg bg-primary/10 flex-shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
      </div>
    </div>
  );
}
