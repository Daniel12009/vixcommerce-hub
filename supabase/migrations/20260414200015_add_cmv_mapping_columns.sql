ALTER TABLE ml_accounts ADD COLUMN IF NOT EXISTS cmv_header_row int DEFAULT 1;
ALTER TABLE ml_accounts ADD COLUMN IF NOT EXISTS cmv_col_sku text DEFAULT 'A';
ALTER TABLE ml_accounts ADD COLUMN IF NOT EXISTS cmv_col_simples text DEFAULT 'B';
ALTER TABLE ml_accounts ADD COLUMN IF NOT EXISTS cmv_col_lucro_real text DEFAULT 'C';
