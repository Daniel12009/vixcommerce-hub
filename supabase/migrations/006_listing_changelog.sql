-- Log de alterações em anúncios de marketplaces
CREATE TABLE IF NOT EXISTS listing_changelog (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id TEXT NOT NULL,
  marketplace TEXT NOT NULL DEFAULT 'ml',
  account_name TEXT NOT NULL,
  campo TEXT NOT NULL,
  valor_anterior TEXT,
  valor_novo TEXT,
  usuario TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE listing_changelog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read listing_changelog" ON listing_changelog FOR SELECT USING (true);
CREATE POLICY "Allow insert listing_changelog" ON listing_changelog FOR INSERT WITH CHECK (true);

CREATE INDEX idx_listing_changelog_item ON listing_changelog(item_id);
CREATE INDEX idx_listing_changelog_date ON listing_changelog(created_at DESC);
