-- Phase 1 Migration: Architecture for Vendas, CMV, ADS and Taxes

-- 1. Create central table for Vendas
CREATE TABLE IF NOT EXISTS vendas_db (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_pedido text UNIQUE NOT NULL,
  data          date NOT NULL,
  conta         text NOT NULL,
  conta_id      uuid REFERENCES ml_accounts(id),
  sku           text,
  quantidade    int NOT NULL DEFAULT 1,
  valor_total   numeric(12,2) NOT NULL,
  comissao      numeric(12,2) DEFAULT 0,
  frete         numeric(12,2) DEFAULT 0,
  marketplace   text,
  origem        text,
  payload       jsonb,
  synced_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendas_db_data ON vendas_db(data);
CREATE INDEX IF NOT EXISTS idx_vendas_db_conta ON vendas_db(conta);

-- 2. Create table for CMV
CREATE TABLE IF NOT EXISTS cmv_db (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku             text NOT NULL,
  conta           text NOT NULL,
  cmv_simples     numeric(12,2) NOT NULL DEFAULT 0,
  cmv_lucro_real  numeric(12,2) NOT NULL DEFAULT 0,
  spreadsheet_id  text,
  synced_at       timestamptz DEFAULT now(),
  UNIQUE(sku, conta)
);

-- 3. Create table for ML Account Tax Config
CREATE TABLE IF NOT EXISTS ml_account_tax_config (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id       uuid REFERENCES ml_accounts(id) UNIQUE,
  regime         text NOT NULL CHECK (regime IN ('lucro_real','simples')),
  icms_pct       numeric(5,2) DEFAULT 0,
  pis_cofins_pct numeric(5,2) DEFAULT 0,
  simples_pct    numeric(5,2) DEFAULT 0,
  updated_at     timestamptz DEFAULT now()
);

-- 4. Create table for ADS
CREATE TABLE IF NOT EXISTS ads_db (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_ref     date NOT NULL,
  conta        text NOT NULL,
  conta_id     uuid REFERENCES ml_accounts(id),
  investimento numeric(12,2) DEFAULT 0,
  receita      numeric(12,2) DEFAULT 0,
  cliques      int DEFAULT 0,
  roas         numeric(8,4) DEFAULT 0,
  synced_at    timestamptz DEFAULT now(),
  UNIQUE(data_ref, conta)
);

-- 5. Alter ml_accounts to add configuration fields
ALTER TABLE ml_accounts ADD COLUMN IF NOT EXISTS cmv_spreadsheet_id text;
ALTER TABLE ml_accounts ADD COLUMN IF NOT EXISTS cmv_sheet_tab text DEFAULT 'CMV';

-- 6. Create the Postgres RPC function `get_marketplace_dia`
DROP FUNCTION IF EXISTS get_marketplace_dia(date, date, text[]);

CREATE OR REPLACE FUNCTION get_marketplace_dia(
  p_data_ini date, 
  p_data_fim date, 
  p_contas text[] DEFAULT NULL
)
RETURNS TABLE (
  data date, 
  origem text, 
  faturamento_bruto numeric,
  lucro_liquido numeric, 
  impostos numeric, 
  ads numeric,
  cmv numeric, 
  comissao numeric, 
  pedidos int
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
  )
  SELECT
    b.data,
    b.conta AS origem,
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
    ) AS lucro_liquido,
    SUM(
      CASE WHEN b.regime = 'lucro_real' THEN (COALESCE(b.icms_pct, 0) + COALESCE(b.pis_cofins_pct, 0))/100.0 * b.valor_total
           WHEN b.regime = 'simples' THEN COALESCE(b.simples_pct, 0)/100.0 * b.valor_total
           ELSE 0 END
    ) AS impostos,
    SUM(COALESCE(a.investimento, 0) * (b.valor_total / NULLIF(b.faturamento_total_dia, 0))) AS ads,
    SUM(CASE WHEN b.regime = 'lucro_real' THEN (COALESCE(b.cmv_lucro_real, 0) * b.quantidade)
             ELSE (COALESCE(b.cmv_simples, 0) * b.quantidade) END) AS cmv,
    SUM(COALESCE(b.comissao, 0)) AS comissao,
    COUNT(DISTINCT b.numero_pedido)::int AS pedidos
  FROM base_vendas b
  LEFT JOIN ads_db a ON a.data_ref = b.data AND a.conta = b.conta
  GROUP BY b.data, b.conta;
$$ LANGUAGE sql STABLE;
