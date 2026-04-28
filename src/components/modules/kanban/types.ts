export interface KanbanProject {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  created_by_email: string;
  created_at: string;
  updated_at: string;
  archived: boolean;
  position: number;
}

export interface KanbanColumn {
  id: string;
  project_id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
}

export interface KanbanLabel {
  id: string;
  name: string;
  color: string;
}

export interface KanbanChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface KanbanCard {
  id: string;
  column_id: string;
  project_id: string;
  title: string;
  description: string;
  assigned_to_email: string;
  points: number;
  due_date: string | null;
  labels: KanbanLabel[];
  checklist: KanbanChecklistItem[];
  position: number;
  created_by_email: string;
  created_at: string;
  updated_at: string;
  completed: boolean;
}

export interface KanbanComment {
  id: string;
  card_id: string;
  author_email: string;
  body: string;
  created_at: string;
}

export const PROJECT_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#64748b',
];

export const PROJECT_ICONS = [
  'Folder', 'Megaphone', 'Truck', 'Package', 'ShoppingCart',
  'Users', 'BarChart3', 'Settings', 'Zap', 'Target',
  'Briefcase', 'Rocket', 'Heart', 'Star', 'Globe',
];

export const LABEL_COLORS = [
  { name: 'Verde', value: '#22c55e' },
  { name: 'Amarelo', value: '#eab308' },
  { name: 'Laranja', value: '#f97316' },
  { name: 'Vermelho', value: '#ef4444' },
  { name: 'Roxo', value: '#8b5cf6' },
  { name: 'Azul', value: '#3b82f6' },
  { name: 'Rosa', value: '#ec4899' },
  { name: 'Cinza', value: '#64748b' },
];
