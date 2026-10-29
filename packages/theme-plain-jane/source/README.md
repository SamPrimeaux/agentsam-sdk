# Plain Jane Journal — Starter Pack

## 1. Point `cms.config.ts` at a Site

Configure your target site slug, active theme, and API endpoint in `/cms.config.ts`:

```ts
export const cmsConfig = {
  siteSlug: "plain-jane-journal", // Must match cms_sites.slug
  themeSlug: "plain-jane",         // Must match cms_themes.slug
  apiBase: "/api/cms",             // External CMS API base endpoint
};
```

When running in preview or without a live backend, the built-in fixture adapter automatically serves the starter pack pages.

---

## 2. Apply the Seed

### Local SQLite (with parameter bindings)
```bash
sqlite3 local.db \
  ".parameter set :account_id 'acc_123'" \
  ".parameter set :site_slug 'plain-jane-journal'" \
  ".read seed/plain-jane-journal.sql"
```

### Cloudflare D1 (Wrangler)
Because `wrangler d1 execute --file` does not natively bind named SQL parameters, interpolate the parameters via `sed` before execution:

```bash
sed -e "s/:account_id/'acc_123'/g" -e "s/:site_slug/'plain-jane-journal'/g" seed/plain-jane-journal.sql > seed/seed.tmp.sql
npx wrangler d1 execute my-d1-db --file=seed/seed.tmp.sql
rm seed/seed.tmp.sql
```

The script is fully idempotent (`INSERT OR IGNORE`) and ends with a `SELECT COUNT(*)` table verification block.

---

## 3. Add a New Section

### Step A: Definition Row (SQL)
```sql
INSERT INTO cms_definitions (
  account_id, definition_key, version, origin, status, kind, settings_schema_json, allowed_blocks_json, max_blocks
) VALUES (
  :account_id,
  'journal-newsletter-banner',
  '1.0.0',
  'app',
  'active',
  'section',
  json('{"type":"object","properties":{"headline":{"type":"string","title":"Headline","default":"Subscribe","group":"content"}}}'),
  json('["journal-text-block"]'),
  5
);
```

### Step B: Component Implementation (`src/render/registry.tsx`)
```tsx
import type { CMSSectionProps } from "./registry";

export function JournalNewsletterSection({ section }: CMSSectionProps<{ headline?: string }>) {
  const data = section.section_data || {};
  return (
    <section
      data-section-id={section.id}
      data-definition-key={section.definition_key}
      data-template-sku={section.template_sku || "tpl-journal-newsletter-default"}
      className="mx-auto max-w-4xl px-4 py-12 border-t border-[var(--border-divider)] text-center"
    >
      <h3 className="font-serif text-3xl text-[var(--text)]">{data.headline || "Subscribe to the journal"}</h3>
    </section>
  );
}
```

### Step C: Register in Registry (`src/render/registry.tsx`)
```tsx
componentRegistry.set("journal-newsletter-banner", JournalNewsletterSection);
```
