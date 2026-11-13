-- ecommerce-cms-agentsam: portable provider-free preview table only
-- Never migrate or mutate legacy paid orders in existing standalone installations.
-- Requires accounts + cms_sites, and leaves products/Stripe unchanged.
CREATE TABLE IF NOT EXISTS cms_checkout_previews (
  id TEXT PRIMARY KEY DEFAULT ('cprev_' || lower(hex(randomblob(12)))),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  site_id TEXT NOT NULL REFERENCES cms_sites(id),
  customer_label TEXT NOT NULL DEFAULT 'customer123'
    CHECK (length(customer_label) BETWEEN 1 AND 120),
  selected_offer_sku TEXT,
  step TEXT NOT NULL DEFAULT 'choose-plan'
    CHECK (step IN ('choose-plan','start-trial','goals','setup','first-run')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','completed','abandoned')),
  journey_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(journey_json) AND json_type(journey_json)='object'),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_checkout_previews_account_site
  ON cms_checkout_previews(account_id, site_id, updated_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_checkout_preview_owned_insert
BEFORE INSERT ON cms_checkout_previews
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM cms_sites s
    WHERE s.id=NEW.site_id AND s.account_id=NEW.account_id AND s.status!='archived'
  ) THEN RAISE(ABORT,'checkout_preview_site_account_mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_checkout_preview_owner_update
BEFORE UPDATE ON cms_checkout_previews
BEGIN
  SELECT CASE WHEN NEW.account_id IS NOT OLD.account_id
      OR NEW.site_id IS NOT OLD.site_id
    THEN RAISE(ABORT,'checkout_preview_owner_immutable') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM cms_sites s
    WHERE s.id=NEW.site_id AND s.account_id=NEW.account_id AND s.status!='archived'
  ) THEN RAISE(ABORT,'checkout_preview_site_account_mismatch') END;
END;
