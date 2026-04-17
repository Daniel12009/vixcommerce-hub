
CREATE OR REPLACE FUNCTION public.get_marketplace_sku_estoque(
  p_data_ini date,
  p_data_fim date,
  p_contas text[] DEFAULT NULL
)
RETURNS TABLE(sku text, conta text, quantidade numeric)
LANGUAGE sql
STABLE
AS $$
  SELECT
    UPPER(TRIM(v.sku)) AS sku,
    v.conta AS conta,
    SUM(v.quantidade)::numeric AS quantidade
  FROM vendas_items v
  WHERE parse_data_venda(v.data) BETWEEN p_data_ini AND p_data_fim
    AND v.sku IS NOT NULL
    AND v.sku <> ''
    AND (p_contas IS NULL OR v.conta = ANY(p_contas))
  GROUP BY UPPER(TRIM(v.sku)), v.conta
$$;
