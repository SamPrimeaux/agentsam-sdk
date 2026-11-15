-- agentsam-engine: d1
-- Canonical platform commerce ownership. This D1 database's existing orders
-- table was verified empty before rollout (2026-11-13).
-- Never infer account ownership from a customer email or a client-provided ID.
-- Existing standalone Fuel N Free Time uses its own separate D1 migration path.
ALTER TABLE orders ADD COLUMN account_id TEXT REFERENCES accounts(id);
ALTER TABLE orders ADD COLUMN site_id TEXT REFERENCES cms_sites(id);

CREATE INDEX IF NOT EXISTS idx_orders_account_site_created
  ON orders(account_id, site_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_orders_site_status
  ON orders(site_id, status, created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_orders_owned_insert
BEFORE INSERT ON orders
BEGIN
  SELECT CASE
    WHEN NEW.account_id IS NULL OR length(trim(NEW.account_id)) = 0
      OR NEW.site_id IS NULL OR length(trim(NEW.site_id)) = 0
    THEN RAISE(ABORT, 'orders_account_site_required')
  END;
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM cms_sites s
      WHERE s.id = NEW.site_id
        AND s.account_id = NEW.account_id
        AND s.status != 'archived'
    ) THEN RAISE(ABORT, 'orders_site_account_mismatch')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_orders_immutable_owner
BEFORE UPDATE OF account_id, site_id ON orders
BEGIN
  SELECT CASE WHEN
    NEW.account_id IS NOT OLD.account_id
    OR NEW.site_id IS NOT OLD.site_id
    THEN RAISE(ABORT, 'orders_owner_immutable')
  END;
END;

-- The provider-free onboarding journey stores test decisions, not orders.
-- Its state can never be "paid" and cannot carry provider/card credentials.
-- All read/write endpoints MUST also verify an authenticated account session.
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
