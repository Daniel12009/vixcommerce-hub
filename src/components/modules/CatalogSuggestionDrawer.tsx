import { useState } from 'react';
import { X, Sparkles, Loader2, CheckCircle, AlertTriangle, BookOpen, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onClose: () => void;
  accountId: string;
  accountName: string;
}

export function CatalogSuggestionDrawer({ open, onClose, accountId, accountName }: Props) {
  const [form, setForm] = useState({
    title: '',
    brand: '',
    ean: '',
    category_id: '',
    description: '',
    picture_urls: '',
    model: '',
    color: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: string; suggestion_id?: string; message?: string } | null>(null);
  const [error, setError] = useState('');

  function set(field: string, val: string) {
    setForm(prev => ({ ...prev, [field]: val }));
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.brand.trim() || !form.category_id.trim()) {
      setError('Preencha Título, Marca e Categoria antes de enviar.');
      return;
    }
    setSubmitting(true);
    setError('');
    setResult(null);

    try {
      // Build catalog_suggestion payload per ML Brand Central API
      const attributes: { id: string; value_name: string }[] = [
        { id: 'BRAND', value_name: form.brand.trim() },
      ];
      if (form.model.trim()) attributes.push({ id: 'MODEL', value_name: form.model.trim() });
      if (form.color.trim()) attributes.push({ id: 'COLOR', value_name: form.color.trim() });

      const pictures = form.picture_urls
        .split('\n')
        .map(u => u.trim())
        .filter(Boolean)
        .map(url => ({ source: url }));

      const payload: any = {
        title: form.title.trim(),
        category_id: form.category_id.trim(),
        attributes,
      };
      if (form.description.trim()) payload.description = { plain_text: form.description.trim() };
      if (form.ean.trim()) payload.domain_attributes = [{ id: 'GTIN', values: [{ name: form.ean.trim() }] }];
      if (pictures.length > 0) payload.pictures = pictures;

      const { data, error: fnError } = await supabase.functions.invoke('mercado-livre', {
        body: {
          action: 'create_catalog_suggestion',
          suggestion: payload,
          account_id: accountId,
        },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.message || data.error);

      setResult({
        status: data?.status || 'UNDER_REVIEW',
        suggestion_id: data?.id || data?.suggestion_id,
        message: data?.message,
      });
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar sugestão.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setForm({ title: '', brand: '', ean: '', category_id: '', description: '', picture_urls: '', model: '', color: '' });
    setResult(null);
    setError('');
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <div className="w-full max-w-2xl h-full bg-background border-l border-border flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-xl">🗂</span>
            <span className="font-semibold text-foreground">Criar Produto no Catálogo ML</span>
            <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted">Brand Central</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Account */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-blue-400/5 border-blue-400/20">
          <BookOpen className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <p className="text-xs text-blue-300">
            Sugestão enviada para revisão do Mercado Livre na conta <strong>{accountName || accountId}</strong>. Aprovação pode levar horas a dias.
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {result ? (
            <div className="space-y-4">
              <div className="px-4 py-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex flex-col gap-2">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle className="w-5 h-5" />
                  Sugestão enviada com sucesso!
                </div>
                {result.suggestion_id && (
                  <p className="text-sm">ID da sugestão: <span className="font-mono font-bold">{result.suggestion_id}</span></p>
                )}
                <p className="text-sm">Status: <span className="font-semibold">{result.status}</span></p>
                <p className="text-xs text-emerald-300/70">
                  Acompanhe o status em Mercado Livre Seller Central → Catálogo → Minhas sugestões.
                </p>
                {result.suggestion_id && (
                  <a
                    href={`https://www.mercadolivre.com.br/seller/catalog/suggestions/${result.suggestion_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline"
                  >
                    Ver sugestão no ML <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                Nova sugestão
              </button>
            </div>
          ) : (
            <>
              {/* Título */}
              <div>
                <label className="text-[11px] font-semibold uppercase text-muted-foreground flex justify-between">
                  Título do Produto * <span>{form.title.length}/60</span>
                </label>
                <input
                  maxLength={60}
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                  placeholder="Ex: Torneira Banheiro Monocomando Cromada"
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-muted text-sm text-foreground outline-none border border-border focus:border-blue-500/50"
                />
              </div>

              {/* Marca + Modelo */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Marca *</label>
                  <input
                    value={form.brand}
                    onChange={e => set('brand', e.target.value)}
                    placeholder="Ex: Docol, Deca, Lorenzetti"
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-muted text-sm text-foreground outline-none border border-border focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Modelo</label>
                  <input
                    value={form.model}
                    onChange={e => set('model', e.target.value)}
                    placeholder="Ex: Fit 00404306"
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-muted text-sm text-foreground outline-none border border-border focus:border-blue-500/50"
                  />
                </div>
              </div>

              {/* Categoria + EAN */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Categoria ML *</label>
                  <input
                    value={form.category_id}
                    onChange={e => set('category_id', e.target.value)}
                    placeholder="Ex: MLB5726 (ID da categoria)"
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-muted text-sm text-foreground outline-none border border-border focus:border-blue-500/50"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Use o ID da categoria ML (ex: MLB5726)</p>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">EAN / GTIN (opcional)</label>
                  <input
                    value={form.ean}
                    onChange={e => set('ean', e.target.value)}
                    placeholder="Ex: 7896123456789"
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-muted text-sm text-foreground outline-none border border-border focus:border-blue-500/50"
                  />
                </div>
              </div>

              {/* Cor */}
              <div>
                <label className="text-[11px] font-semibold uppercase text-muted-foreground">Cor (opcional)</label>
                <input
                  value={form.color}
                  onChange={e => set('color', e.target.value)}
                  placeholder="Ex: Cromado, Preto Fosco"
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-muted text-sm text-foreground outline-none border border-border focus:border-blue-500/50"
                />
              </div>

              {/* Descrição */}
              <div>
                <label className="text-[11px] font-semibold uppercase text-muted-foreground flex justify-between">
                  Descrição <span>{form.description.length}/3000</span>
                </label>
                <textarea
                  maxLength={3000}
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  rows={4}
                  placeholder="Descreva o produto em detalhes..."
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-muted text-sm text-foreground outline-none resize-y border border-border focus:border-blue-500/50"
                />
              </div>

              {/* Fotos */}
              <div>
                <label className="text-[11px] font-semibold uppercase text-muted-foreground">URLs das Fotos (uma por linha)</label>
                <textarea
                  value={form.picture_urls}
                  onChange={e => set('picture_urls', e.target.value)}
                  rows={3}
                  placeholder="https://..."
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-muted text-sm text-foreground outline-none resize-y border border-border focus:border-blue-500/50"
                />
              </div>

              {/* Info box */}
              <div className="px-3 py-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-blue-300 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-blue-400" />
                <span>
                  <strong>Revisão do ML:</strong> Após enviar, o Mercado Livre analisa e decide se aprova a criação do produto no catálogo. Aprovado, você receberá um <strong>catalog_product_id</strong> para vincular seus anúncios.
                </span>
              </div>

              {error && (
                <p className="text-red-400 text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />{error}
                </p>
              )}

              {/* Botão enviar */}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {submitting ? 'Enviando sugestão...' : 'Enviar para Aprovação do ML'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
