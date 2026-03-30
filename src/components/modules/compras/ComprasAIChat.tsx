import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, Settings2, Loader2, Maximize } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSheetsData } from '@/contexts/SheetsDataContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function ComprasAIChat() {
  const { comprasItems, vendasItems, estoqueItems } = useSheetsData();
  const [cbmLimit, setCbmLimit] = useState(69);
  const [daysHorizon, setDaysHorizon] = useState(30);
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleAnalise = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const systemPrompt = `Você é um especialista em planejamento de demanda, S&OP e otimização de compras com restrição logística (CBM).

Você possui três grandes objetivos que precisamos de um output:
1) Definir a quantidade ótima de compra por SKU maximizando o lucro total esperado, respeitando a limitação de espaço (CBM) disponível.
2) Criar uma visão auditável da demanda estimada do período
3) Criticar/complementar o exercício que o usuário mesmo criou baseado nas premissas dele para a compra do período, comparando com a sua sugestão com análises objetivas da diferença entre um e outro.

---
0. Parâmetros do Problema
Considere:
- Capacidade total disponível: [Máximo de ${cbmLimit} CBMs]
- Horizonte de planejamento: [a compra prevista é para ${daysHorizon} dias de vendas]

1. Coleta de Dados
Para cada SKU, analise os dados enviados no JSON.

2. Tratamento dos Dados
Identifique tendência, sazonalidade e outliers se possível.

3. Cálculo da Demanda
Média de venda diária e Demanda projetada no período.

4. Cálculo de Métricas de Otimização
Lucro Unitário = Receita (ou CustoProduto * (Margem/100))
Lucro por CBM = Lucro Unitário / CBM por unidade
Classifique os SKUs do maior para o menor lucro por CBM.

5. Restrições Operacionais
Garanta que SKUs com risco de ruptura tenham reposição mínima (Estoque Mínimo).

6. Otimização da Compra (Core do Problema)
Distribua o espaço disponível (CBM) da seguinte forma:
1. Reserve CBM para reposição mínima dos SKUs críticos.
2. Com o restante, priorize SKUs com maior lucro por CBM (algoritmo tipo "knapsack problem").

7. Output Final
Apresente a tabela final de recomendação e consolidação (CBM utilizado, Lucro esperado, Top SKUs por eficiência, SKUs que ficaram de fora).

8. Camada Estratégica
Onde há trade-offs, riscos e sugestões.
GERE SEU OUTPUT COMPLETAMENTE EM MARKDOWN FORMATADO, COM TABELAS (usando |) E NEGRITO ONDE APLICÁVEL. Formate como um relatório executivo requintado.`;

      // Compact context to avoid token limit
      const context_data = {
        compras: comprasItems?.map(d => ({
          sku: d.sku,
          cat: d.categoria,
          custo: d.custoProduto,
          vmd: d.mediaVendaDiaria,
          estoque: d.onHand,
          dias_rupu: d.diasParaRuptura,
          pedido_user: d.pedidoSugerido,
          cbm_tot_user: d.cbmTotal,
          lucro_cbm: d.lucroPorCBM,
          custo_tot_user: d.custoTotalPedido,
          jan: d.tendenciaMeses?.jan,
          fev: d.tendenciaMeses?.fev
        })) || [],
      };

      const { data, error } = await supabase.functions.invoke('ai-analyst', {
        body: { 
          mode: 'sop_knapsack', 
          question: 'Execute a otimização Knapsack com base no meu json atual de compras.', 
          context_data, 
          system_prompt: systemPrompt 
        },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });

      if (error) throw new Error(error.message);
      
      setResult(data?.answer || 'Sem reposta do assistente.');

    } catch (err: any) {
      setResult('Erro ao conectar com a IA: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 border-none shadow-xl bg-gradient-to-br from-indigo-900/40 via-background to-background relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10 mb-6 border-b border-border/50 pb-6">
        <div>
          <h2 className="text-xl font-black text-foreground flex items-center gap-2 tracking-tight">
            <Brain className="w-6 h-6 text-indigo-400" />
            Otimizador S&amp;OP Avançado
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            A IA analisará todos os seus SKUs, calculará a lucratividade por m³ e encontrará 
            a montagem perfeita do container (Algoritmo Knapsack) para maximizar seu lucro sem estourar o espaço.
          </p>
        </div>

        <div className="flex bg-card/50 backdrop-blur-sm p-4 rounded-xl border border-border/50 gap-6 items-center flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
              <Maximize className="w-3 h-3" /> Capacidade CBM
            </label>
            <div className="relative">
              <input 
                type="number" 
                value={cbmLimit}
                onChange={e => setCbmLimit(Number(e.target.value))}
                className="w-24 bg-background border border-input rounded-md px-3 py-1.5 text-sm font-semibold"
              />
              <span className="absolute right-3 top-1.5 text-xs text-muted-foreground font-medium">m³</span>
            </div>
          </div>
          
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
              <Settings2 className="w-3 h-3" /> Horizonte
            </label>
            <div className="relative">
              <input 
                type="number" 
                value={daysHorizon}
                onChange={e => setDaysHorizon(Number(e.target.value))}
                className="w-24 bg-background border border-input rounded-md px-3 py-1.5 text-sm font-semibold"
              />
              <span className="absolute right-3 top-1.5 text-xs text-muted-foreground font-medium">dias</span>
            </div>
          </div>

          <Button 
            onClick={handleAnalise} 
            disabled={loading || !comprasItems?.length}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 mt-5 md:mt-0"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Brain className="w-4 h-4 mr-2" />}
            {loading ? 'Calculando Knapsack...' : 'Montar Container'}
          </Button>
        </div>
      </div>

      {result && (
        <div className="prose prose-sm md:prose-base prose-invert prose-indigo max-w-none 
          bg-slate-950/50 rounded-xl p-6 border border-slate-800/50 
          prose-headings:text-indigo-300 prose-a:text-indigo-400 
          prose-th:bg-indigo-950/50 prose-th:p-3 prose-td:p-3 prose-tr:border-slate-800
          relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {result}
          </ReactMarkdown>
        </div>
      )}
    </Card>
  );
}
