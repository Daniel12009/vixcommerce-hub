-- Migration 009: Add source_mode to shopee_accounts
-- Allows toggling between Tiny ERP and Shopee API direct for data sync

ALTER TABLE shopee_accounts ADD COLUMN IF NOT EXISTS source_mode TEXT DEFAULT 'tiny';
-- Values: 'tiny' (default, via Tiny ERP) | 'api' (direct Shopee API)

COMMENT ON COLUMN shopee_accounts.source_mode IS 'Data source mode: tiny = Tiny ERP, api = Shopee API direct';
