-- Remove a restrição única apenas do numero_pedido para permitir múltiplos SKUs no mesmo pedido
ALTER TABLE vendas_db DROP CONSTRAINT IF EXISTS vendas_db_numero_pedido_key;

-- Adiciona restrição composta (numero_pedido + sku) para manter controle de duplicatas nível item
ALTER TABLE vendas_db ADD CONSTRAINT vendas_db_numero_pedido_sku_key UNIQUE (numero_pedido, sku);
