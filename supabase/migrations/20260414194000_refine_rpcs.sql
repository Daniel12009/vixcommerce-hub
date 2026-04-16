-- Refined RPC for SKU-level profitability analysis
DROP FUNCTION IF EXISTS get_marketplace_sku(date, date, text[]);

CREATE OR REPLACE FUNCTION get_marketplace_sku(
  p_data_ini date, 
  p_data_fim date, 
  p_contas text[] DEFAULT NULL
)
RETURNS TABLE (
  sku text,
  marketplace text,
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
      v.marketplace,
      v.numero_pedido,
      v.quantidade,
      v.valor_total,
      v.comissao,
      v.frete,
      v.payload,
      COALESCE(v.embalagem, 0) as embalagem,
      COALESCE(v.ads_valor, 0) as ads_valor,
      c.cmv_simples,
      c.cmv_lucro_real,
      t.regime,
      t.icms_pct,
      t.pis_cofins_pct,
      t.simples_pct,
      SUM(CASE WHEN (v.payload->>'status') NOT ILIKE '%cancel%' AND (v.payload->>'status') NOT ILIKE '%devol%' THEN v.valor_total ELSE 0 END) OVER (PARTITION BY v.data, v.conta) as faturamento_total_dia
    FROM vendas_db v
    LEFT JOIN cmv_db c ON c.sku = v.sku AND c.conta = v.conta
    LEFT JOIN ml_account_tax_config t ON t.conta_id = v.conta_id
    WHERE v.data >= p_data_ini AND v.data <= p_data_fim
      AND (p_contas IS NULL OR v.conta = ANY(p_contas))
  )
  SELECT
    b.sku,
    MAX(b.marketplace) as marketplace,
    SUM(CASE WHEN (b.payload->>'status') NOT ILIKE '%cancel%' AND (b.payload->>'status') NOT ILIKE '%devol%' THEN b.valor_total ELSE 0 END) AS faturamento_bruto,
    SUM(
      CASE WHEN (b.payload->>'status') NOT ILIKE '%cancel%' AND (b.payload->>'status') NOT ILIKE '%devol%' THEN
        b.valor_total 
        - COALESCE(b.comissao, 0)
        - COALESCE(b.frete, 0)
        - CASE WHEN b.regime = 'lucro_real' THEN (COALESCE(b.cmv_lucro_real, 0) * b.quantidade)
               ELSE (COALESCE(b.cmv_simples, 0) * b.quantidade) END
        - (COALESCE(a.investimento, 0) * (b.valor_total / NULLIF(b.faturamento_total_dia, 0)))
        - b.ads_valor
        - b.embalagem
        - CASE WHEN b.regime = 'lucro_real' THEN (COALESCE(b.icms_pct, 0) + COALESCE(b.pis_cofins_pct, 0))/100.0 * b.valor_total
               WHEN b.regime = 'simples' THEN COALESCE(b.simples_pct, 0)/100.0 * b.valor_total
               ELSE 0 END
      ELSE 0 END
    ) AS liquido,
    SUM(CASE WHEN (b.payload->>'status') NOT ILIKE '%cancel%' AND (b.payload->>'status') NOT ILIKE '%devol%' THEN b.quantidade ELSE 0 END)::bigint AS quantidade,
    SUM(CASE WHEN (b.payload->>'status') NOT ILIKE '%cancel%' AND (b.payload->>'status') NOT ILIKE '%devol%' THEN
        (COALESCE(a.investimento, 0) * (b.valor_total / NULLIF(b.faturamento_total_dia, 0))) + b.ads_valor
      ELSE 0 END) AS ads,
    SUM(CASE WHEN (b.payload->>'status') NOT ILIKE '%cancel%' AND (b.payload->>'status') NOT ILIKE '%devol%' THEN
        CASE WHEN b.regime = 'lucro_real' THEN (COALESCE(b.cmv_lucro_real, 0) * b.quantidade)
             ELSE (COALESCE(b.cmv_simples, 0) * b.quantidade) END
      ELSE 0 END) AS cmv,
    SUM(CASE WHEN (b.payload->>'status') NOT ILIKE '%cancel%' AND (b.payload->>'status') NOT ILIKE '%devol%' THEN COALESCE(b.comissao, 0) ELSE 0 END) AS comissao,
    SUM(CASE WHEN (b.payload->>'status') NOT ILIKE '%cancel%' AND (b.payload->>'status') NOT ILIKE '%devol%' THEN COALESCE(b.frete, 0) ELSE 0 END) AS frete,
    COUNT(DISTINCT CASE WHEN (b.payload->>'status') NOT ILIKE '%cancel%' AND (b.payload->>'status') NOT ILIKE '%devol%' THEN b.numero_pedido ELSE NULL END)::int AS pedidos,
    SUM(CASE WHEN (b.payload->>'status') ILIKE '%cancel%' OR (b.payload->>'status') ILIKE '%devol%' THEN b.quantidade ELSE 0 END)::bigint AS dev_qtd
  FROM base_vendas b
  LEFT JOIN ads_db a ON a.data_ref = b.data AND a.conta = b.conta
  GROUP BY b.sku;
$$ LANGUAGE sql STABLE;

-- Update get_marketplace_dia too
CREATE OR REPLACE FUNCTION get_marketplace_dia(
  p_data_ini date, 
  p_data_fim date, 
  p_contas text[] DEFAULT NULL
)
  returns table (
    data date, 
    conta text,
    marketplace text,
    faturamento_bruto numeric,
    lucro_liquido numeric, 
    impostos numeric, 
    ads numeric,
    cmv numeric, 
    comissao numeric, 
    pedidos int,
    quantidade bigint
  ) as $$
    with base_vendas as (
      select 
        v.data,
        v.conta,
        v.marketplace,
        v.conta_id,
        v.sku,
        v.numero_pedido,
        v.quantidade,
        v.valor_total,
        v.comissao,
        v.frete,
        v.payload,
        COALESCE(v.embalagem, 0) as embalagem,
        COALESCE(v.ads_valor, 0) as ads_valor,
        c.cmv_simples,
        c.cmv_lucro_real,
        t.regime,
        t.icms_pct,
        t.pis_cofins_pct,
        t.simples_pct,
        SUM(case when (v.payload->>'status') NOT ILIKE '%cancel%' AND (v.payload->>'status') NOT ILIKE '%devol%' then v.valor_total else 0 end) over (partition by v.data, v.conta) as faturamento_total_dia
      from vendas_db v
      left join cmv_db c on c.sku = v.sku and c.conta = v.conta
      left join ml_account_tax_config t on t.conta_id = v.conta_id
      where v.data >= p_data_ini and v.data <= p_data_fim
        and (p_contas is null or v.conta = any(p_contas))
    )
    select
      b.data,
      b.conta,
      b.marketplace,
      SUM(case when (b.payload->>'status') NOT ILIKE '%cancel%' AND (b.payload->>'status') NOT ILIKE '%devol%' then b.valor_total else 0 end) as faturamento_bruto,
      SUM(
        case when (b.payload->>'status') NOT ILIKE '%cancel%' AND (b.payload->>'status') NOT ILIKE '%devol%' then
          b.valor_total 
          - COALESCE(b.comissao, 0)
          - COALESCE(b.frete, 0)
          - case when b.regime = 'lucro_real' then (COALESCE(b.cmv_lucro_real, 0) * b.quantidade)
                 else (COALESCE(b.cmv_simples, 0) * b.quantidade) end
          - (COALESCE(a.investimento, 0) * (b.valor_total / NULLIF(b.faturamento_total_dia, 0)))
          - b.ads_valor
          - b.embalagem
          - case when b.regime = 'lucro_real' then (COALESCE(b.icms_pct, 0) + COALESCE(b.pis_cofins_pct, 0))/100.0 * b.valor_total
                 when b.regime = 'simples' then COALESCE(b.simples_pct, 0)/100.0 * b.valor_total
                 else 0 end
        else 0 end
      ) as lucro_liquido,
      SUM(
        case when (b.payload->>'status') NOT ILIKE '%cancel%' AND (b.payload->>'status') NOT ILIKE '%devol%' then
          case when b.regime = 'lucro_real' then (COALESCE(b.icms_pct, 0) + COALESCE(b.pis_cofins_pct, 0))/100.0 * b.valor_total
               when b.regime = 'simples' then COALESCE(b.simples_pct, 0)/100.0 * b.valor_total
               else 0 end
        else 0 end
      ) as impostos,
      SUM(case when (b.payload->>'status') NOT ILIKE '%cancel%' AND (b.payload->>'status') NOT ILIKE '%devol%' then
          (COALESCE(a.investimento, 0) * (b.valor_total / NULLIF(b.faturamento_total_dia, 0))) + b.ads_valor
        else 0 end ) as ads,
      SUM(case when (b.payload->>'status') NOT ILIKE '%cancel%' AND (b.payload->>'status') NOT ILIKE '%devol%' then
          case when b.regime = 'lucro_real' then (COALESCE(b.cmv_lucro_real, 0) * b.quantidade)
               else (COALESCE(b.cmv_simples, 0) * b.quantidade) end
        else 0 end) as cmv,
      SUM(case when (b.payload->>'status') NOT ILIKE '%cancel%' AND (b.payload->>'status') NOT ILIKE '%devol%' then COALESCE(b.comissao, 0) else 0 end) as comissao,
      COUNT(DISTINCT case when (b.payload->>'status') NOT ILIKE '%cancel%' AND (b.payload->>'status') NOT ILIKE '%devol%' then b.numero_pedido else NULL end)::int as pedidos,
      SUM(case when (b.payload->>'status') NOT ILIKE '%cancel%' AND (b.payload->>'status') NOT ILIKE '%devol%' then b.quantidade else 0 end)::bigint as quantidade
    from base_vendas b
    left join ads_db a on a.data_ref = b.data and a.conta = b.conta
    group by b.data, b.conta, b.marketplace;
  $$ language sql stable;
