-- RPC for SKU-level profitability analysis
DROP FUNCTION IF EXISTS get_marketplace_sku(date, date, text[]);

CREATE OR REPLACE FUNCTION get_marketplace_sku(
  p_data_ini date, 
  p_data_fim date, 
  p_contas text[] DEFAULT NULL
)
RETURNS TABLE (
  sku text,
  faturamento_bruto numeric,
  liquido numeric,
  quantidade bigint,
  ads numeric,
  cmv numeric,
  comissao numeric,
  frete numeric,
  pedidos int,
  dev_qtd bigint
) AS $$
  WITH base_vendas AS (
    SELECT 
      v.data,
      v.conta,
      v.conta_id,
      v.sku,
      v.numero_pedido,
      v.quantidade,
      v.valor_total,
      v.comissao,
      v.frete,
      c.cmv_simples,
      c.cmv_lucro_real,
      t.regime,
      t.icms_pct,
      t.pis_cofins_pct,
      t.simples_pct,
      SUM(v.valor_total) OVER (PARTITION BY v.data, v.conta) as faturamento_total_dia
    FROM vendas_db v
    LEFT JOIN cmv_db c ON c.sku = v.sku AND c.conta = v.conta
    LEFT JOIN ml_account_tax_config t ON t.conta_id = v.conta_id
    WHERE v.data >= p_data_ini AND v.data <= p_data_fim
      AND (p_contas IS NULL OR v.conta = ANY(p_contas))
  ),
  daily_ads AS (
    SELECT data_ref, conta, investimento, faturamento_real
    FROM (
        SELECT data_ref, conta, investimento,
               SUM(investimento) OVER (PARTITION BY data_ref, conta) as faturamento_real -- this is actually just for joining
        FROM ads_db
        WHERE data_ref >= p_data_ini AND data_ref <= p_data_fim
    ) sub
  )
  SELECT
    b.sku,
    SUM(b.valor_total) AS faturamento_bruto,
    SUM(
      b.valor_total 
      - COALESCE(b.comissao, 0)
      - COALESCE(b.frete, 0)
      - CASE WHEN b.regime = 'lucro_real' THEN (COALESCE(b.cmv_lucro_real, 0) * b.quantidade)
             ELSE (COALESCE(b.cmv_simples, 0) * b.quantidade) END
      - (COALESCE(a.investimento, 0) * (b.valor_total / NULLIF(b.faturamento_total_dia, 0)))
      - CASE WHEN b.regime = 'lucro_real' THEN (COALESCE(b.icms_pct, 0) + COALESCE(b.pis_cofins_pct, 0))/100.0 * b.valor_total
             WHEN b.regime = 'simples' THEN COALESCE(b.simples_pct, 0)/100.0 * b.valor_total
             ELSE 0 END
    ) AS liquido,
    SUM(b.quantidade)::bigint AS quantidade,
    SUM(COALESCE(a.investimento, 0) * (b.valor_total / NULLIF(b.faturamento_total_dia, 0))) AS ads,
    SUM(CASE WHEN b.regime = 'lucro_real' THEN (COALESCE(b.cmv_lucro_real, 0) * b.quantidade)
             ELSE (COALESCE(b.cmv_simples, 0) * b.quantidade) END) AS cmv,
    SUM(COALESCE(b.comissao, 0)) AS comissao,
    SUM(COALESCE(b.frete, 0)) AS frete,
    COUNT(DISTINCT b.numero_pedido)::int AS pedidos,
    SUM(CASE WHEN b.origem ILIKE '%cancel%' OR b.origem ILIKE '%devol%' THEN b.quantidade ELSE 0 END)::bigint AS dev_qtd
  FROM base_vendas b
  LEFT JOIN ads_db a ON a.data_ref = b.data AND a.conta = b.conta
  GROUP BY b.sku;
$$ LANGUAGE sql STABLE;
