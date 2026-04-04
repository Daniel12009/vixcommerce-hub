import { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const CONTAS = [
  { value: 'viaflix', label: 'Via Flix (VIAFLIX)' },
  { value: 'gs', label: 'GS Torneiras (GS)' },
  { value: 'decarion', label: 'Decarion (MONACO)' },
];

const ML_EXPORT_URL = 'https://www.mercadolivre.com.br/inventory/full/manage';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export function EstoqueFullUpload() {
  const [conta, setConta] = useState('viaflix');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<{
    sucesso: boolean;
    mensagem: string;
    linhas?: number;
  } | null>(null);

  const handleUpload = async () => {
    if (!file) { toast.error('Selecione um arquivo .xlsx'); return; }
    if (!file.name.endsWith('.xlsx')) { toast.error('Somente arquivos .xlsx são aceitos'); return; }

    setLoading(true);
    setResultado(null);

    try {
      const formData = new FormData();
      formData.append('conta', conta);
      formData.append('file', file);

      const res = await fetch(`${SUPABASE_URL}/functions/v1/estoque-full-upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_KEY}` },
        body: formData,
      });

      const data = await res.json();
      setResultado(data);

      if (data.sucesso) {
        toast.success(data.mensagem);
        setFile(null);
        const input = document.getElementById('estoque-file-input') as HTMLInputElement;
        if (input) input.value = '';
      } else {
        toast.error(data.mensagem);
      }
    } catch (e: any) {
      const msg = `Erro ao enviar: ${e.message}`;
      setResultado({ sucesso: false, mensagem: msg });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto animate-fade-in">
      {/* Instrução */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">
              Como exportar o arquivo do Mercado Livre
            </p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Acesse o portal do ML → <strong>Estoque Full → Gestão de Estoque</strong></li>
              <li>Clique em <strong>"Exportar"</strong> e baixe o arquivo <code className="bg-muted px-1 rounded">.xlsx</code></li>
              <li>Selecione a conta correspondente abaixo e faça o upload</li>
            </ol>
            <a
              href={ML_EXPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-2 transition-colors"
            >
              Abrir portal do ML <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Formulário */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Upload className="w-4 h-4 text-[hsl(var(--vix-success))]" />
          Importar Planilha de Estoque Full
        </h3>

        <div className="space-y-4">
          {/* Select conta */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              1. Selecione a Conta
            </label>
            <select
              value={conta}
              onChange={e => setConta(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {CONTAS.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* File input */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              2. Arquivo Excel (.xlsx)
            </label>
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                file
                  ? 'border-[hsl(var(--vix-success)/0.5)] bg-[hsl(var(--vix-success)/0.05)]'
                  : 'border-border hover:border-muted-foreground/50 hover:bg-muted/20'
              }`}
              onClick={() => document.getElementById('estoque-file-input')?.click()}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={e => {
                e.preventDefault();
                e.stopPropagation();
                const droppedFile = e.dataTransfer.files?.[0];
                if (droppedFile?.name.endsWith('.xlsx')) setFile(droppedFile);
                else toast.error('Somente arquivos .xlsx são aceitos');
              }}
            >
              <input
                id="estoque-file-input"
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] || null)}
              />
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-[hsl(var(--vix-success))]" />
                  <span className="text-sm font-medium text-foreground">{file.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({(file.size / 1024).toFixed(0)} KB)
                  </span>
                </div>
              ) : (
                <>
                  <Upload className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Clique para selecionar ou arraste o arquivo .xlsx
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    O arquivo será processado no servidor (não salvo localmente)
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Botão */}
          <button
            onClick={handleUpload}
            disabled={loading || !file}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[hsl(var(--vix-success))] text-white font-semibold text-sm hover:opacity-90 disabled:opacity-40 transition-all"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Processando...</>
            ) : (
              <><Upload className="w-4 h-4" /> Enviar e Atualizar Planilha</>
            )}
          </button>
        </div>
      </div>

      {/* Resultado */}
      {resultado && (
        <div className={`rounded-xl p-4 border ${
          resultado.sucesso
            ? 'border-[hsl(var(--vix-success)/0.3)] bg-[hsl(var(--vix-success)/0.05)]'
            : 'border-[hsl(var(--vix-danger)/0.3)] bg-[hsl(var(--vix-danger)/0.05)]'
        }`}>
          <div className="flex items-start gap-3">
            {resultado.sucesso
              ? <CheckCircle2 className="w-5 h-5 text-[hsl(var(--vix-success))] flex-shrink-0 mt-0.5" />
              : <XCircle className="w-5 h-5 text-[hsl(var(--vix-danger))] flex-shrink-0 mt-0.5" />
            }
            <div>
              <p className={`text-sm font-medium ${
                resultado.sucesso ? 'text-[hsl(var(--vix-success))]' : 'text-[hsl(var(--vix-danger))]'
              }`}>
                {resultado.mensagem}
              </p>
              {resultado.sucesso && resultado.linhas && (
                <p className="text-xs text-muted-foreground mt-1">
                  Dados das outras contas foram preservados automaticamente.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="text-xs text-muted-foreground bg-muted/20 rounded-xl p-4 border border-border">
        <p className="font-medium mb-1.5">ℹ️ Como funciona</p>
        <ul className="space-y-0.5 list-disc list-inside">
          <li>O upload substitui <strong>apenas</strong> os dados da conta selecionada</li>
          <li>Dados das outras contas são preservados automaticamente</li>
          <li>Destino: planilha <code className="bg-muted px-1 rounded text-[10px]">Full_Estoque</code> (ID separado da mestra)</li>
          <li>Colunas: SKU, Tamanho, Status, Entrada pendente, Transferência, Devoluções, Aptas, Espaço Full</li>
        </ul>
      </div>
    </div>
  );
}
