export type AdDraftStatus = 'pending' | 'generating' | 'done' | 'error';

export interface AdDraftField<T = string> {
  value: T;
  status: AdDraftStatus;
  aiGenerated: boolean;
  note?: string; // observação do agente de compliance ou SEO
}

export interface AdDraft {
  // Identificação
  sku: string;
  marketplace: 'ml'; // expandir futuramente

  // Agente de Pesquisa
  market_research: {
    status: AdDraftStatus;
    top_competitors: { title: string; price: number }[];
    price_range: { min: number; max: number; avg: number };
    category_trends: string[];
  };

  // Agente de Estratégia
  strategy: {
    status: AdDraftStatus;
    positioning: string; // ex: "melhor preço", "autoridade de marca"
    price_suggestion: number;
    key_differentials: string[];
  };

  // Agente Copywriter
  copy: {
    status: AdDraftStatus;
    title: AdDraftField; // max 60 chars para ML
    description: AdDraftField;
    highlights: AdDraftField<string[]>; // bullet points
  };

  // Agente SEO
  seo: {
    status: AdDraftStatus;
    primary_keywords: string[];
    secondary_keywords: string[];
    title_optimized: AdDraftField; // título com keywords integradas
  };

  // Agente Compliance
  compliance: {
    status: AdDraftStatus;
    approved: boolean;
    issues: string[]; // lista de problemas encontrados
    category_id: string; // categoria ML sugerida
    category_name: string;
  };

  // Estado geral
  overall_status: AdDraftStatus;
  error?: string;
  created_at: string;
}

export function createEmptyAdDraft(sku: string): AdDraft {
  const empty = <T>(val: T): AdDraftField<T> => ({
    value: val,
    status: 'pending',
    aiGenerated: false,
  });

  return {
    sku,
    marketplace: 'ml',
    market_research: { status: 'pending', top_competitors: [], price_range: { min: 0, max: 0, avg: 0 }, category_trends: [] },
    strategy: { status: 'pending', positioning: '', price_suggestion: 0, key_differentials: [] },
    copy: {
      status: 'pending',
      title: empty(''),
      description: empty(''),
      highlights: empty([]),
    },
    seo: { status: 'pending', primary_keywords: [], secondary_keywords: [], title_optimized: empty('') },
    compliance: { status: 'pending', approved: false, issues: [], category_id: '', category_name: '' },
    overall_status: 'pending',
    created_at: new Date().toISOString(),
  };
}
