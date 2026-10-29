-- ============================================================================
-- Plain Jane Journal — Production Starter Pack Seed
-- Target: SQLite & Cloudflare D1
-- Idempotency: INSERT OR IGNORE / ON CONFLICT DO NOTHING
-- Dependency Order:
--   1. cms_themes
--   2. cms_definitions
--   3. cms_component_templates
--   4. cms_sites
--   5. cms_collections
--   6. cms_navigation_menus
--   7. cms_global_settings
--   8. cms_assets
--   9. cms_pages
--   10. cms_page_sections
--   11. cms_section_blocks
--   12. Table Count Verification Block
-- Bound Parameters: :account_id, :site_slug
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. THEME: Plain Jane
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO cms_themes (
  slug,
  name,
  theme_family,
  visibility,
  status,
  css_vars_json,
  tokens_json,
  typography_json,
  motion_json,
  wcag_scores,
  contrast_flags,
  config,
  workspace_id
) VALUES (
  'plain-jane',
  'Plain Jane',
  'light',
  'public',
  'active',
  json('{
    "--bg": "#F9F8F6",
    "--text": "#1A1A1A",
    "--text-muted": "#4A4A4A",
    "--accent": "#D96C4A",
    "--border-subtle": "rgba(26, 26, 26, 0.05)",
    "--border-divider": "rgba(26, 26, 26, 0.10)",
    "--border-input": "rgba(26, 26, 26, 0.20)",
    "--overlay-scrim": "rgba(26, 26, 26, 0.60)",
    "--hero-gradient": "rgba(26, 26, 26, 0.80)",
    "--lightbox-bg": "rgba(26, 26, 26, 0.95)",
    "--selection-bg": "rgba(217, 108, 74, 0.20)"
  }'),
  json('{
    "radius": {
      "none": "0px",
      "sm": "2px",
      "full": "9999px"
    },
    "spacing": {
      "xs": "4px",
      "sm": "8px",
      "md": "16px",
      "lg": "24px",
      "xl": "32px",
      "2xl": "48px",
      "3xl": "64px",
      "4xl": "96px"
    },
    "shadows": {
      "subtle": "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
      "card": "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
      "overlay": "0 25px 50px -12px rgba(0, 0, 0, 0.25)"
    }
  }'),
  json('{
    "font_sans": "\"DM Sans\", ui-sans-serif, system-ui, sans-serif",
    "font_serif": "\"Playfair Display\", ui-serif, Georgia, Cambria, \"Times New Roman\", Times, serif",
    "scale": {
      "xs": "0.75rem",
      "sm": "0.875rem",
      "base": "1rem",
      "lg": "1.125rem",
      "xl": "1.25rem",
      "2xl": "1.5rem",
      "3xl": "1.875rem",
      "4xl": "2.25rem",
      "5xl": "3rem",
      "6xl": "3.75rem",
      "7xl": "4.5rem"
    }
  }'),
  json('{
    "easing": [0.16, 1, 0.3, 1],
    "durations": {
      "fast": "0.3s",
      "normal": "0.6s",
      "slow": "0.8s"
    }
  }'),
  json('{
    "text_on_bg": { "ratio": 16.51, "level": "AAA", "status": "pass" },
    "text_muted_on_bg": { "ratio": 8.42, "level": "AAA", "status": "pass" },
    "accent_on_bg": { "ratio": 3.42, "level": "AA_LARGE", "status": "warning" },
    "accent_on_text": { "ratio": 4.83, "level": "AA", "status": "pass" }
  }'),
  json('{
    "warning_accent_on_light": "Accent (#D96C4A) on Paper (#F9F8F6) is 3.42:1. Use for headings, links, borders, and graphical accents. Primary body text uses ink (#1A1A1A)."
  }'),
  '{}',
  NULL
);

-- ----------------------------------------------------------------------------
-- 2. DEFINITIONS (With complete settings_schema_json for generic form renderers)
-- ----------------------------------------------------------------------------

-- Sections & Navigation
INSERT OR IGNORE INTO cms_definitions (
  account_id, definition_key, version, origin, status, kind, settings_schema_json, allowed_blocks_json, max_blocks
) VALUES
  (:account_id, 'journal-header', '1.0.0', 'app', 'active', 'navigation',
   json('{
     "type": "object",
     "properties": {
       "brand_name": { "type": "string", "title": "Brand Name", "default": "JANE DOE", "maxLength": 60, "group": "branding" }
     }
   }'),
   json('["journal-nav-link"]'), 10),

  (:account_id, 'journal-footer', '1.0.0', 'app', 'active', 'navigation',
   json('{
     "type": "object",
     "properties": {
       "brand_name": { "type": "string", "title": "Brand Wordmark", "default": "JANE DOE", "group": "branding" },
       "brand_bio": { "type": "string", "title": "Brand Bio", "default": "Documenting the quiet moments between the noise.", "group": "branding" },
       "copyright_holder": { "type": "string", "title": "Copyright Name", "default": "Jane Doe", "group": "legal" },
       "attribution_text": { "type": "string", "title": "Attribution Statement", "default": "Original editorial starter pack.", "group": "legal" }
     }
   }'),
   json('["journal-nav-link"]'), 20),

  (:account_id, 'journal-home-hero', '1.0.0', 'app', 'active', 'section',
   json('{
     "type": "object",
     "properties": {
       "title_prefix": { "type": "string", "title": "Title Prefix", "default": "Notes on a ", "group": "typography" },
       "title_highlight": { "type": "string", "title": "Highlighted Word", "default": "quieter", "group": "typography" },
       "title_suffix": { "type": "string", "title": "Title Suffix", "default": " life.", "group": "typography" },
       "subtitle": { "type": "string", "title": "Lead Subtitle", "default": "Essays, photography, and reflections on finding meaning in the spaces between the noise.", "group": "typography" }
     },
     "required": ["title_highlight"]
   }'),
   json('["journal-article-card"]'), 1),

  (:account_id, 'journal-latest-entries', '1.0.0', 'app', 'active', 'section',
   json('{
     "type": "object",
     "properties": {
       "section_title": { "type": "string", "title": "Section Title", "default": "Latest Entries", "group": "header" },
       "view_all_label": { "type": "string", "title": "View All Label", "default": "View All", "group": "header" },
       "view_all_path": { "type": "string", "title": "View All URL", "default": "#", "group": "navigation" }
     }
   }'),
   json('["journal-article-card"]'), 24),

  (:account_id, 'journal-post-hero', '1.0.0', 'app', 'active', 'section',
   json('{
     "type": "object",
     "properties": {
       "show_gradient": { "type": "boolean", "title": "Show Bottom Gradient Scrim", "default": true, "group": "display" },
       "min_height": { "type": "string", "title": "Minimum Height", "default": "500px", "group": "layout" }
     }
   }'),
   json('[]'), 0),

  (:account_id, 'journal-post-body', '1.0.0', 'app', 'active', 'section',
   json('{
     "type": "object",
     "properties": {
       "prose_width": {
         "type": "string",
         "title": "Prose Column Width",
         "enum": ["max-w-2xl", "max-w-3xl", "max-w-4xl"],
         "default": "max-w-3xl",
         "group": "layout"
       }
     }
   }'),
   json('["journal-lead-paragraph","journal-text-block","journal-heading-block","journal-quote-embed","journal-image-embed","journal-gallery-embed","journal-author-bio"]'), 50),

  (:account_id, 'journal-about-profile', '1.0.0', 'app', 'active', 'section',
   json('{
     "type": "object",
     "properties": {
       "portrait_asset_id": { "type": "string", "title": "Portrait Asset ID", "default": "asset-author-portrait", "group": "media" },
       "heading": { "type": "string", "title": "Profile Heading", "default": "About Jane", "group": "content" },
       "bio_quote": { "type": "string", "title": "Lead Quote", "default": "Documenting the quiet moments between the noise.", "group": "content" },
       "inquiries_title": { "type": "string", "title": "Inquiries Title", "default": "Connect & Inquiries", "group": "content" },
       "email": { "type": "string", "title": "Email Address", "format": "email", "default": "hello@janedoe.com", "group": "contact" },
       "twitter": { "type": "string", "title": "Twitter Handle", "default": "@janedoe", "group": "contact" },
       "instagram": { "type": "string", "title": "Instagram Handle", "default": "@jane.captures", "group": "contact" }
     }
   }'),
   json('["journal-text-block"]'), 10),

  (:account_id, 'journal-photo-gallery', '1.0.0', 'app', 'active', 'section',
   json('{
     "type": "object",
     "properties": {
       "title": { "type": "string", "title": "Gallery Title", "default": "Selected Works", "group": "content" },
       "description": { "type": "string", "title": "Curatorial Description", "default": "A collection of moments captured across different cities and landscapes.", "group": "content" },
       "columns": { "type": "integer", "title": "Max Columns", "enum": [2, 3, 4], "default": 4, "group": "layout" }
     }
   }'),
   json('["journal-photo-item"]'), 100);

-- Blocks
INSERT OR IGNORE INTO cms_definitions (
  account_id, definition_key, version, origin, status, kind, settings_schema_json, allowed_blocks_json, max_blocks
) VALUES
  (:account_id, 'journal-article-card', '1.0.0', 'app', 'active', 'block',
   json('{
     "type": "object",
     "properties": {
       "slug": { "type": "string", "title": "Target Post Slug", "group": "link" },
       "title": { "type": "string", "title": "Article Title", "maxLength": 140, "group": "content" },
       "excerpt": { "type": "string", "title": "Excerpt Summary", "maxLength": 300, "group": "content" },
       "date": { "type": "string", "title": "Publication Date Display", "group": "metadata" },
       "read_time": { "type": "string", "title": "Read Time", "default": "5 min read", "group": "metadata" },
       "category": { "type": "string", "title": "Category Label", "default": "Travel", "group": "metadata" },
       "cover_asset_id": { "type": "string", "title": "Cover Image Asset ID", "group": "media" },
       "author_name": { "type": "string", "title": "Author Name", "default": "Jane Doe", "group": "author" },
       "author_avatar_asset_id": { "type": "string", "title": "Author Avatar Asset ID", "default": "asset-author-avatar", "group": "author" },
       "featured": { "type": "boolean", "title": "Featured Mode (Horizontal layout)", "default": false, "group": "layout" }
     },
     "required": ["slug", "title"]
   }'),
   json('[]'), 0),

  (:account_id, 'journal-lead-paragraph', '1.0.0', 'app', 'active', 'block',
   json('{
     "type": "object",
     "properties": {
       "text": { "type": "string", "title": "Lead Text (Italic Serif)", "group": "typography" }
     },
     "required": ["text"]
   }'),
   json('[]'), 0),

  (:account_id, 'journal-text-block', '1.0.0', 'app', 'active', 'block',
   json('{
     "type": "object",
     "properties": {
       "text": { "type": "string", "title": "Paragraph Body Text", "group": "typography" },
       "html": { "type": "string", "title": "Optional Rich HTML", "group": "advanced" }
     },
     "required": ["text"]
   }'),
   json('[]'), 0),

  (:account_id, 'journal-heading-block', '1.0.0', 'app', 'active', 'block',
   json('{
     "type": "object",
     "properties": {
       "text": { "type": "string", "title": "Heading Text", "group": "content" },
       "level": { "type": "integer", "title": "Heading Level", "enum": [2, 3, 4], "default": 2, "group": "structure" }
     },
     "required": ["text"]
   }'),
   json('[]'), 0),

  (:account_id, 'journal-quote-embed', '1.0.0', 'app', 'active', 'block',
   json('{
     "type": "object",
     "properties": {
       "quote": { "type": "string", "title": "Quote Body", "group": "content" },
       "author": { "type": "string", "title": "Quote Attribution", "group": "content" },
       "source": { "type": "string", "title": "Source Citation", "group": "content" }
     },
     "required": ["quote"]
   }'),
   json('[]'), 0),

  (:account_id, 'journal-image-embed', '1.0.0', 'app', 'active', 'block',
   json('{
     "type": "object",
     "properties": {
       "asset_id": { "type": "string", "title": "Media Asset ID", "group": "media" },
       "alt": { "type": "string", "title": "Accessible Alt Text", "group": "accessibility" },
       "caption": { "type": "string", "title": "Figure Caption", "group": "content" },
       "size": { "type": "string", "title": "Display Width", "enum": ["default", "wide", "full"], "default": "default", "group": "layout" }
     },
     "required": ["asset_id"]
   }'),
   json('[]'), 0),

  (:account_id, 'journal-gallery-embed', '1.0.0', 'app', 'active', 'block',
   json('{
     "type": "object",
     "properties": {
       "caption": { "type": "string", "title": "Gallery Overall Caption", "group": "content" }
     }
   }'),
   json('[]'), 0),

  (:account_id, 'journal-author-bio', '1.0.0', 'app', 'active', 'block',
   json('{
     "type": "object",
     "properties": {
       "name": { "type": "string", "title": "Author Full Name", "default": "Jane Doe", "group": "bio" },
       "bio": { "type": "string", "title": "Biographical Paragraph", "group": "bio" },
       "avatar_asset_id": { "type": "string", "title": "Avatar Asset ID", "default": "asset-author-avatar", "group": "media" },
       "twitter": { "type": "string", "title": "Twitter Username", "group": "social" },
       "instagram": { "type": "string", "title": "Instagram Username", "group": "social" }
     },
     "required": ["name", "bio"]
   }'),
   json('[]'), 0),

  (:account_id, 'journal-photo-item', '1.0.0', 'app', 'active', 'block',
   json('{
     "type": "object",
     "properties": {
       "asset_id": { "type": "string", "title": "Photo Asset ID", "group": "media" },
       "alt": { "type": "string", "title": "Alt Description", "group": "accessibility" },
       "caption": { "type": "string", "title": "Hover Caption", "group": "content" },
       "width": { "type": "integer", "title": "Intrinsic Width", "default": 1200, "group": "dimensions" },
       "height": { "type": "integer", "title": "Intrinsic Height", "default": 800, "group": "dimensions" }
     },
     "required": ["asset_id"]
   }'),
   json('[]'), 0),

  (:account_id, 'journal-nav-link', '1.0.0', 'app', 'active', 'block',
   json('{
     "type": "object",
     "properties": {
       "label": { "type": "string", "title": "Link Label", "group": "link" },
       "path": { "type": "string", "title": "URL / Path", "group": "link" },
       "is_external": { "type": "boolean", "title": "External Window Target", "default": false, "group": "link" }
     },
     "required": ["label", "path"]
   }'),
   json('[]'), 0);

-- ----------------------------------------------------------------------------
-- 3. COMPONENT TEMPLATES (With stable SKUs, preview_json, tags, compatibility)
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO cms_component_templates (
  sku, template_name, template_type, category, label, status, is_system,
  definition_id, definition_key, definition_version, item_type, template_data,
  preview_json, tags, compatibility_json, responsive_schema_json, data_bindings_json
)
SELECT
  'tpl-journal-home-hero-default', 'Journal Home Hero', 'editorial', 'hero', 'Editorial Hero', 'active', 0,
  d.id, d.definition_key, d.version, 'section',
  json('{"title_prefix":"Notes on a ","title_highlight":"quieter","title_suffix":" life.","subtitle":"Essays, photography, and reflections on finding meaning in the spaces between the noise."}'),
  json('{"description":"Editorial header with serif display title and embedded featured article card","aspect_ratio":"16:9"}'),
  json('["journal","starter","hero"]'),
  json('["blog","work"]'),
  json('{"mobile":{"title_size":"text-5xl"},"tablet":{"title_size":"text-6xl"},"desktop":{"title_size":"text-7xl"}}'),
  json('{"source":"cms_pages","filter":{"page_type":"post"},"limit":1,"order":"published_at desc"}')
FROM cms_definitions d
WHERE d.account_id=:account_id AND d.definition_key='journal-home-hero' AND d.version='1.0.0';

INSERT OR IGNORE INTO cms_component_templates (
  sku, template_name, template_type, category, label, status, is_system,
  definition_id, definition_key, definition_version, item_type, template_data,
  preview_json, tags, compatibility_json, responsive_schema_json, data_bindings_json
)
SELECT
  'tpl-journal-latest-entries-default', 'Journal Latest Entries', 'editorial', 'grid', '2-Column Articles Grid', 'active', 0,
  d.id, d.definition_key, d.version, 'section',
  json('{"section_title":"Latest Entries","view_all_label":"View All","view_all_path":"#"}'),
  json('{"description":"Clean two-column editorial post grid with section header line","aspect_ratio":"16:9"}'),
  json('["journal","starter","grid"]'),
  json('["blog"]'),
  json('{"mobile":{"columns":1},"desktop":{"columns":2}}'),
  json('{"source":"cms_pages","filter":{"page_type":"post"},"offset":1,"limit":8,"order":"published_at desc"}')
FROM cms_definitions d
WHERE d.account_id=:account_id AND d.definition_key='journal-latest-entries' AND d.version='1.0.0';

INSERT OR IGNORE INTO cms_component_templates (
  sku, template_name, template_type, category, label, status, is_system,
  definition_id, definition_key, definition_version, item_type, template_data,
  preview_json, tags, compatibility_json, responsive_schema_json, data_bindings_json
)
SELECT
  'tpl-journal-post-hero-default', 'Journal Post Hero', 'editorial', 'hero', 'Immersive Parallax Cover', 'active', 0,
  d.id, d.definition_key, d.version, 'section',
  json('{"show_gradient":true,"min_height":"500px"}'),
  json('{"description":"70vh full-bleed cover with parallax motion, gradient scrim, and metadata pills","aspect_ratio":"16:9"}'),
  json('["journal","starter","cover"]'),
  json('["post","case_study"]'),
  json('{"mobile":{"height":"60vh"},"desktop":{"height":"70vh"}}'),
  json('{"source":"cms_pages","current":true}')
FROM cms_definitions d
WHERE d.account_id=:account_id AND d.definition_key='journal-post-hero' AND d.version='1.0.0';

INSERT OR IGNORE INTO cms_component_templates (
  sku, template_name, template_type, category, label, status, is_system,
  definition_id, definition_key, definition_version, item_type, template_data,
  preview_json, tags, compatibility_json, responsive_schema_json, data_bindings_json
)
SELECT
  'tpl-journal-post-body-default', 'Journal Post Body', 'editorial', 'body', 'Prose Reader Column', 'active', 0,
  d.id, d.definition_key, d.version, 'section',
  json('{"prose_width":"max-w-3xl"}'),
  json('{"description":"Carefully proportioned reading column hosting lead copy, quotes, and embeds","aspect_ratio":"4:3"}'),
  json('["journal","starter","body"]'),
  json('["post","case_study","about","contact","legal","404"]'),
  json('{"mobile":{"padding":"px-4"},"desktop":{"padding":"px-8"}}'),
  json('{"source":"cms_section_blocks","filter":{"section_id":"current"}}')
FROM cms_definitions d
WHERE d.account_id=:account_id AND d.definition_key='journal-post-body' AND d.version='1.0.0';

-- Article Card Variants (Standard vs Featured)
INSERT OR IGNORE INTO cms_component_templates (
  sku, template_name, template_type, category, label, status, is_system,
  definition_id, definition_key, definition_version, item_type, template_data,
  preview_json, tags, compatibility_json, responsive_schema_json, data_bindings_json
)
SELECT
  'tpl-journal-article-card-standard', 'Standard Article Card', 'editorial', 'card', 'Standard 4:3 Card', 'active', 0,
  d.id, d.definition_key, d.version, 'block',
  json('{"slug":"the-art-of-slow-travel","title":"The Art of Slow Travel","excerpt":"Why rushing from landmark to landmark ruins our ability to truly experience place.","date":"October 12, 2023","read_time":"8 min read","category":"Travel","cover_asset_id":"asset-cover-slow-travel","author_name":"Jane Doe","author_avatar_asset_id":"asset-author-avatar","featured":false}'),
  json('{"description":"Vertical 4:3 post card with category, date, author thumbnail, and excerpt","aspect_ratio":"4:3"}'),
  json('["journal","starter","card"]'),
  json('["blog"]'),
  json('{}'),
  json('{}')
FROM cms_definitions d
WHERE d.account_id=:account_id AND d.definition_key='journal-article-card' AND d.version='1.0.0';

INSERT OR IGNORE INTO cms_component_templates (
  sku, template_name, template_type, category, label, status, is_system,
  definition_id, definition_key, definition_version, item_type, template_data,
  preview_json, tags, compatibility_json, responsive_schema_json, data_bindings_json
)
SELECT
  'tpl-journal-article-card-featured', 'Featured Article Card', 'editorial', 'card', 'Horizontal Split Card', 'active', 0,
  d.id, d.definition_key, d.version, 'block',
  json('{"slug":"the-art-of-slow-travel","title":"The Art of Slow Travel: Finding Meaning in the In-Between","excerpt":"Why rushing from landmark to landmark is ruining our ability to truly experience the world around us.","date":"October 12, 2023","read_time":"8 min read","category":"Travel","cover_asset_id":"asset-cover-slow-travel","author_name":"Jane Doe","author_avatar_asset_id":"asset-author-avatar","featured":true}'),
  json('{"description":"Horizontal 16:9 desktop split card designed for hero prominence","aspect_ratio":"16:9"}'),
  json('["journal","starter","featured"]'),
  json('["blog"]'),
  json('{"mobile":{"layout":"vertical"},"desktop":{"layout":"horizontal"}}'),
  json('{}')
FROM cms_definitions d
WHERE d.account_id=:account_id AND d.definition_key='journal-article-card' AND d.version='1.0.0';

-- Image Embed Variants (Default vs Wide)
INSERT OR IGNORE INTO cms_component_templates (
  sku, template_name, template_type, category, label, status, is_system,
  definition_id, definition_key, definition_version, item_type, template_data,
  preview_json, tags, compatibility_json, responsive_schema_json, data_bindings_json
)
SELECT
  'tpl-journal-image-embed-default', 'Image Embed Default', 'editorial', 'media', 'Standard Width Figure', 'active', 0,
  d.id, d.definition_key, d.version, 'block',
  json('{"asset_id":"asset-embed-architecture","alt":"Architectural light study","caption":"The interplay of light and shadow creates a natural rhythm that encourages reflection.","size":"default"}'),
  json('{"description":"Standard max-w-4xl figure with rounded borders and lightbox zoom","aspect_ratio":"16:9"}'),
  json('["journal","starter","image"]'),
  json('["post","case_study"]'),
  json('{}'),
  json('{}')
FROM cms_definitions d
WHERE d.account_id=:account_id AND d.definition_key='journal-image-embed' AND d.version='1.0.0';

INSERT OR IGNORE INTO cms_component_templates (
  sku, template_name, template_type, category, label, status, is_system,
  definition_id, definition_key, definition_version, item_type, template_data,
  preview_json, tags, compatibility_json, responsive_schema_json, data_bindings_json
)
SELECT
  'tpl-journal-image-embed-wide', 'Image Embed Wide', 'editorial', 'media', 'Bleed Wide Figure', 'active', 0,
  d.id, d.definition_key, d.version, 'block',
  json('{"asset_id":"asset-embed-architecture","alt":"Architectural light study","caption":"The interplay of light and shadow creates a natural rhythm that encourages reflection.","size":"wide"}'),
  json('{"description":"Extended max-w-6xl wide figure breaking the reading column boundary","aspect_ratio":"16:9"}'),
  json('["journal","starter","image","wide"]'),
  json('["post","case_study"]'),
  json('{}'),
  json('{}')
FROM cms_definitions d
WHERE d.account_id=:account_id AND d.definition_key='journal-image-embed' AND d.version='1.0.0';

-- ----------------------------------------------------------------------------
-- 4. CMS SITES
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO cms_sites (
  id, slug, account_id, title, status, created_at, updated_at
) VALUES (
  'site-plain-jane',
  :site_slug,
  :account_id,
  'Plain Jane Journal',
  'active',
  datetime('now'),
  datetime('now')
);

-- ----------------------------------------------------------------------------
-- 5. CMS COLLECTIONS (The installable Starter Pack unit)
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO cms_collections (
  id, account_id, site_id, slug, title, kind, status, allowed_item_types_json, metadata, created_at, updated_at
) VALUES (
  'col-journal-starter',
  :account_id,
  (SELECT id FROM cms_sites WHERE slug=:site_slug),
  'journal-starter',
  'Plain Jane Journal Starter Pack',
  'manual',
  'active',
  json('["template","section","theme"]'),
  json('{"version":"1.0.0","author":"Plain Jane","theme_slug":"plain-jane"}'),
  datetime('now'),
  datetime('now')
);

-- ----------------------------------------------------------------------------
-- 6. CMS NAVIGATION MENUS
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO cms_navigation_menus (
  id, account_id, site_id, menu_key, title, items_json, status, created_at, updated_at
) VALUES
  ('menu-journal-header', :account_id, (SELECT id FROM cms_sites WHERE slug=:site_slug),
   'header-main', 'Header Main Navigation',
   json('[
     {"label":"Home","path":"/"},
     {"label":"About","path":"/about"},
     {"label":"Essays","path":"/"},
     {"label":"Photography","path":"/photography"}
   ]'),
   'active', datetime('now'), datetime('now')),

  ('menu-journal-footer', :account_id, (SELECT id FROM cms_sites WHERE slug=:site_slug),
   'footer-explore', 'Footer Explore Links',
   json('[
     {"label":"Essays","path":"/"},
     {"label":"Photography","path":"/photography"},
     {"label":"Travel","path":"/"},
     {"label":"About","path":"/about"}
   ]'),
   'active', datetime('now'), datetime('now'));

-- ----------------------------------------------------------------------------
-- 7. CMS GLOBAL SETTINGS
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO cms_global_settings (
  id, site_id, account_id, site_name, tagline, footer_text, social_links_json, seo_defaults_json, created_at, updated_at
) VALUES (
  'settings-plain-jane',
  (SELECT id FROM cms_sites WHERE slug=:site_slug),
  :account_id,
  'Plain Jane Journal',
  'Notes on a quieter life',
  '© 2026 Jane Doe. All rights reserved. Original editorial starter pack.',
  json('{"twitter":"https://twitter.com/janedoe","instagram":"https://instagram.com/jane.captures","substack":"#","email":"hello@janedoe.com"}'),
  json('{"meta_title":"Plain Jane Journal — Notes on a quieter life","meta_description":"Essays, photography, and reflections on finding meaning in the spaces between the noise.","og_image_asset_id":"asset-og-default"}'),
  datetime('now'),
  datetime('now')
);

-- ----------------------------------------------------------------------------
-- 8. CMS ASSETS (Local original vector assets and placeholders)
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO cms_assets (id, account_id, url, alt_text, width, height, caption, mime_type)
VALUES
  ('asset-app-logo', :account_id, '/icons/app-logo.svg', 'Plain Jane Journal vector logo', 64, 64, NULL, 'image/svg+xml'),
  ('asset-author-avatar', :account_id, '/images/author-avatar.svg', 'Jane Doe author avatar silhouette', 200, 200, NULL, 'image/svg+xml'),
  ('asset-author-portrait', :account_id, '/images/author-portrait.svg', 'Jane Doe author profile portrait', 800, 1000, NULL, 'image/svg+xml'),
  ('asset-cover-slow-travel', :account_id, '/images/cover-slow-travel.svg', 'The Art of Slow Travel cover study', 1200, 800, 'Original cover study', 'image/svg+xml'),
  ('asset-cover-analog', :account_id, '/images/cover-analog.svg', 'Embracing Analog shutter study', 1200, 800, 'Original analog study', 'image/svg+xml'),
  ('asset-cover-morning', :account_id, '/images/cover-morning.svg', 'Morning rituals geometry', 1200, 800, 'Morning light', 'image/svg+xml'),
  ('asset-cover-silence', :account_id, '/images/cover-silence.svg', 'Architecture of silence', 1200, 800, 'Space and echo', 'image/svg+xml'),
  ('asset-cover-memory', :account_id, '/images/cover-memory.svg', 'The taste of memory', 1200, 800, 'Vessel study', 'image/svg+xml'),
  ('asset-embed-architecture', :account_id, '/images/embed-architecture.svg', 'Interplay of shadow and void', 1200, 800, 'The interplay of light and shadow creates a natural rhythm.', 'image/svg+xml'),
  ('asset-gallery-1', :account_id, '/images/gallery-1.svg', 'Morning light across oak', 1200, 800, 'Morning light', 'image/svg+xml'),
  ('asset-gallery-2', :account_id, '/images/gallery-2.svg', 'Ceramic vessels and steam', 1200, 800, 'Coffee cup', 'image/svg+xml'),
  ('asset-gallery-3', :account_id, '/images/gallery-3.svg', 'Open clothbound ledger', 1200, 800, 'Open book', 'image/svg+xml'),
  ('asset-og-default', :account_id, '/images/og-journal.svg', 'Plain Jane Journal social share preview card', 1200, 800, NULL, 'image/svg+xml');

-- ----------------------------------------------------------------------------
-- 9. CMS PAGES (home, post 1, post 2, about, photography, contact, 404, privacy, terms)
-- Timestamps: INTEGER unix seconds
-- ----------------------------------------------------------------------------

-- 9a. Home (Blog Index)
INSERT OR IGNORE INTO cms_pages (
  id, site_id, project_slug, project_id, page_type, slug, title, status, created_at, updated_at, published_at, seo_json, og_image_asset_id
) VALUES (
  'page-journal-home',
  (SELECT id FROM cms_sites WHERE slug=:site_slug),
  :site_slug,
  (SELECT id FROM cms_sites WHERE slug=:site_slug),
  'blog',
  'home',
  'Notes on a quieter life',
  'published',
  1696118400,
  1696118400,
  1696118400,
  json('{"title":"Plain Jane Journal — Notes on a quieter life","description":"Essays, photography, and reflections on finding meaning in the spaces between the noise.","og_image_asset_id":"asset-og-default"}'),
  'asset-og-default'
);

-- 9b. Post 1: The Art of Slow Travel
INSERT OR IGNORE INTO cms_pages (
  id, site_id, project_slug, project_id, page_type, slug, title, status, created_at, updated_at, published_at, seo_json, og_image_asset_id
) VALUES (
  'page-journal-post-slow-travel',
  (SELECT id FROM cms_sites WHERE slug=:site_slug),
  :site_slug,
  (SELECT id FROM cms_sites WHERE slug=:site_slug),
  'post',
  'the-art-of-slow-travel',
  'The Art of Slow Travel: Finding Meaning in the In-Between',
  'published',
  1697112000,
  1697112000,
  1697112000,
  json('{"title":"The Art of Slow Travel — Plain Jane Journal","description":"Why rushing from landmark to landmark is ruining our ability to truly experience the world around us.","og_image_asset_id":"asset-cover-slow-travel"}'),
  'asset-cover-slow-travel'
);

-- 9c. Post 2: Embracing Analog in a Hyper-Digital Age
INSERT OR IGNORE INTO cms_pages (
  id, site_id, project_slug, project_id, page_type, slug, title, status, created_at, updated_at, published_at, seo_json, og_image_asset_id
) VALUES (
  'page-journal-post-analog',
  (SELECT id FROM cms_sites WHERE slug=:site_slug),
  :site_slug,
  (SELECT id FROM cms_sites WHERE slug=:site_slug),
  'post',
  'analog-photography-digital-age',
  'Embracing Analog in a Hyper-Digital Age',
  'published',
  1695859200,
  1695859200,
  1695859200,
  json('{"title":"Embracing Analog — Plain Jane Journal","description":"There is something profoundly grounding about the mechanical click of a shutter and the anticipation of developing film.","og_image_asset_id":"asset-cover-analog"}'),
  'asset-cover-analog'
);

-- 9d. About Page
INSERT OR IGNORE INTO cms_pages (
  id, site_id, project_slug, project_id, page_type, slug, title, status, created_at, updated_at, published_at, seo_json, og_image_asset_id
) VALUES (
  'page-journal-about',
  (SELECT id FROM cms_sites WHERE slug=:site_slug),
  :site_slug,
  (SELECT id FROM cms_sites WHERE slug=:site_slug),
  'about',
  'about',
  'About Jane',
  'published',
  1696118400,
  1696118400,
  1696118400,
  json('{"title":"About Jane — Plain Jane Journal","description":"Documenting the quiet moments between the noise. A journal of travel, photography, and finding meaning in the everyday.","og_image_asset_id":"asset-author-portrait"}'),
  'asset-author-portrait'
);

-- 9e. Photography / Work Page
INSERT OR IGNORE INTO cms_pages (
  id, site_id, project_slug, project_id, page_type, slug, title, status, created_at, updated_at, published_at, seo_json, og_image_asset_id
) VALUES (
  'page-journal-photography',
  (SELECT id FROM cms_sites WHERE slug=:site_slug),
  :site_slug,
  (SELECT id FROM cms_sites WHERE slug=:site_slug),
  'work',
  'photography',
  'Selected Works',
  'published',
  1696118400,
  1696118400,
  1696118400,
  json('{"title":"Selected Works — Plain Jane Journal","description":"A collection of moments captured across different cities and landscapes.","og_image_asset_id":"asset-og-default"}'),
  'asset-og-default'
);

-- 9f. Contact Page
INSERT OR IGNORE INTO cms_pages (
  id, site_id, project_slug, project_id, page_type, slug, title, status, created_at, updated_at, published_at, seo_json, og_image_asset_id
) VALUES (
  'page-journal-contact',
  (SELECT id FROM cms_sites WHERE slug=:site_slug),
  :site_slug,
  (SELECT id FROM cms_sites WHERE slug=:site_slug),
  'contact',
  'contact',
  'Get in Touch',
  'published',
  1696118400,
  1696118400,
  1696118400,
  json('{"title":"Contact — Plain Jane Journal","description":"Direct inquiries, editorial commissions, and conversations.","og_image_asset_id":"asset-og-default"}'),
  'asset-og-default'
);

-- 9g. 404 Page
INSERT OR IGNORE INTO cms_pages (
  id, site_id, project_slug, project_id, page_type, slug, title, status, created_at, updated_at, published_at, seo_json, og_image_asset_id
) VALUES (
  'page-journal-404',
  (SELECT id FROM cms_sites WHERE slug=:site_slug),
  :site_slug,
  (SELECT id FROM cms_sites WHERE slug=:site_slug),
  '404',
  '404',
  'Page Not Found',
  'published',
  1696118400,
  1696118400,
  1696118400,
  json('{"title":"404 Not Found — Plain Jane Journal","description":"The page you requested could not be located.","og_image_asset_id":"asset-og-default"}'),
  'asset-og-default'
);

-- 9h. Privacy Policy
INSERT OR IGNORE INTO cms_pages (
  id, site_id, project_slug, project_id, page_type, slug, title, status, created_at, updated_at, published_at, seo_json, og_image_asset_id
) VALUES (
  'page-journal-privacy',
  (SELECT id FROM cms_sites WHERE slug=:site_slug),
  :site_slug,
  (SELECT id FROM cms_sites WHERE slug=:site_slug),
  'legal',
  'privacy',
  'Privacy Policy',
  'published',
  1696118400,
  1696118400,
  1696118400,
  json('{"title":"Privacy Policy — Plain Jane Journal","description":"How we respect your attention and privacy on Plain Jane Journal.","og_image_asset_id":"asset-og-default"}'),
  'asset-og-default'
);

-- 9i. Terms of Service
INSERT OR IGNORE INTO cms_pages (
  id, site_id, project_slug, project_id, page_type, slug, title, status, created_at, updated_at, published_at, seo_json, og_image_asset_id
) VALUES (
  'page-journal-terms',
  (SELECT id FROM cms_sites WHERE slug=:site_slug),
  :site_slug,
  (SELECT id FROM cms_sites WHERE slug=:site_slug),
  'legal',
  'terms',
  'Terms of Service',
  'published',
  1696118400,
  1696118400,
  1696118400,
  json('{"title":"Terms of Service — Plain Jane Journal","description":"Terms and conditions for remixing and reading Plain Jane Journal.","og_image_asset_id":"asset-og-default"}'),
  'asset-og-default'
);

-- ----------------------------------------------------------------------------
-- 10. CMS PAGE SECTIONS (Deterministic IDs derived from page and section keys)
-- ----------------------------------------------------------------------------

-- Blog Index Sections
INSERT OR IGNORE INTO cms_page_sections (
  id, page_id, definition_id, definition_key, section_order, section_data, status, created_at, updated_at
) VALUES
  ('sec-home-hero',
   (SELECT id FROM cms_pages WHERE site_id=(SELECT id FROM cms_sites WHERE slug=:site_slug) AND slug='home'),
   (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-home-hero' AND version='1.0.0'),
   'journal-home-hero', 1,
   json('{"title_prefix":"Notes on a ","title_highlight":"quieter","title_suffix":" life.","subtitle":"Essays, photography, and reflections on finding meaning in the spaces between the noise."}'),
   'active', datetime('now'), datetime('now')),

  ('sec-home-entries',
   (SELECT id FROM cms_pages WHERE site_id=(SELECT id FROM cms_sites WHERE slug=:site_slug) AND slug='home'),
   (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-latest-entries' AND version='1.0.0'),
   'journal-latest-entries', 2,
   json('{"section_title":"Latest Entries","view_all_label":"View All","view_all_path":"#"}'),
   'active', datetime('now'), datetime('now'));

-- Post 1 Sections
INSERT OR IGNORE INTO cms_page_sections (
  id, page_id, definition_id, definition_key, section_order, section_data, status, created_at, updated_at
) VALUES
  ('sec-post-1-hero',
   (SELECT id FROM cms_pages WHERE site_id=(SELECT id FROM cms_sites WHERE slug=:site_slug) AND slug='the-art-of-slow-travel'),
   (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-post-hero' AND version='1.0.0'),
   'journal-post-hero', 1,
   json('{"show_gradient":true,"min_height":"500px"}'),
   'active', datetime('now'), datetime('now')),

  ('sec-post-1-body',
   (SELECT id FROM cms_pages WHERE site_id=(SELECT id FROM cms_sites WHERE slug=:site_slug) AND slug='the-art-of-slow-travel'),
   (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-post-body' AND version='1.0.0'),
   'journal-post-body', 2,
   json('{"prose_width":"max-w-3xl"}'),
   'active', datetime('now'), datetime('now'));

-- Post 2 Sections
INSERT OR IGNORE INTO cms_page_sections (
  id, page_id, definition_id, definition_key, section_order, section_data, status, created_at, updated_at
) VALUES
  ('sec-post-2-hero',
   (SELECT id FROM cms_pages WHERE site_id=(SELECT id FROM cms_sites WHERE slug=:site_slug) AND slug='analog-photography-digital-age'),
   (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-post-hero' AND version='1.0.0'),
   'journal-post-hero', 1,
   json('{"show_gradient":true,"min_height":"500px"}'),
   'active', datetime('now'), datetime('now')),

  ('sec-post-2-body',
   (SELECT id FROM cms_pages WHERE site_id=(SELECT id FROM cms_sites WHERE slug=:site_slug) AND slug='analog-photography-digital-age'),
   (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-post-body' AND version='1.0.0'),
   'journal-post-body', 2,
   json('{"prose_width":"max-w-3xl"}'),
   'active', datetime('now'), datetime('now'));

-- About Section
INSERT OR IGNORE INTO cms_page_sections (
  id, page_id, definition_id, definition_key, section_order, section_data, status, created_at, updated_at
) VALUES (
  'sec-about-profile',
  (SELECT id FROM cms_pages WHERE site_id=(SELECT id FROM cms_sites WHERE slug=:site_slug) AND slug='about'),
  (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-about-profile' AND version='1.0.0'),
  'journal-about-profile', 1,
  json('{"portrait_asset_id":"asset-author-portrait","heading":"About Jane","bio_quote":"Documenting the quiet moments between the noise.","inquiries_title":"Connect & Inquiries","email":"hello@janedoe.com","twitter":"@janedoe","instagram":"@jane.captures"}'),
  'active', datetime('now'), datetime('now')
);

-- Photography Section
INSERT OR IGNORE INTO cms_page_sections (
  id, page_id, definition_id, definition_key, section_order, section_data, status, created_at, updated_at
) VALUES (
  'sec-photo-gallery',
  (SELECT id FROM cms_pages WHERE site_id=(SELECT id FROM cms_sites WHERE slug=:site_slug) AND slug='photography'),
  (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-photo-gallery' AND version='1.0.0'),
  'journal-photo-gallery', 1,
  json('{"title":"Selected Works","description":"A collection of moments captured across different cities and landscapes. Focusing on light, shadow, and the quiet spaces in between.","columns":4}'),
  'active', datetime('now'), datetime('now')
);

-- Contact Section
INSERT OR IGNORE INTO cms_page_sections (
  id, page_id, definition_id, definition_key, section_order, section_data, status, created_at, updated_at
) VALUES (
  'sec-contact-body',
  (SELECT id FROM cms_pages WHERE site_id=(SELECT id FROM cms_sites WHERE slug=:site_slug) AND slug='contact'),
  (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-post-body' AND version='1.0.0'),
  'journal-post-body', 1,
  json('{"prose_width":"max-w-3xl"}'),
  'active', datetime('now'), datetime('now')
);

-- 404 Section
INSERT OR IGNORE INTO cms_page_sections (
  id, page_id, definition_id, definition_key, section_order, section_data, status, created_at, updated_at
) VALUES (
  'sec-404-body',
  (SELECT id FROM cms_pages WHERE site_id=(SELECT id FROM cms_sites WHERE slug=:site_slug) AND slug='404'),
  (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-post-body' AND version='1.0.0'),
  'journal-post-body', 1,
  json('{"prose_width":"max-w-3xl"}'),
  'active', datetime('now'), datetime('now')
);

-- Privacy Section
INSERT OR IGNORE INTO cms_page_sections (
  id, page_id, definition_id, definition_key, section_order, section_data, status, created_at, updated_at
) VALUES (
  'sec-privacy-body',
  (SELECT id FROM cms_pages WHERE site_id=(SELECT id FROM cms_sites WHERE slug=:site_slug) AND slug='privacy'),
  (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-post-body' AND version='1.0.0'),
  'journal-post-body', 1,
  json('{"prose_width":"max-w-3xl"}'),
  'active', datetime('now'), datetime('now')
);

-- Terms Section
INSERT OR IGNORE INTO cms_page_sections (
  id, page_id, definition_id, definition_key, section_order, section_data, status, created_at, updated_at
) VALUES (
  'sec-terms-body',
  (SELECT id FROM cms_pages WHERE site_id=(SELECT id FROM cms_sites WHERE slug=:site_slug) AND slug='terms'),
  (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-post-body' AND version='1.0.0'),
  'journal-post-body', 1,
  json('{"prose_width":"max-w-3xl"}'),
  'active', datetime('now'), datetime('now')
);

-- ----------------------------------------------------------------------------
-- 11. CMS SECTION BLOCKS (Strictly copy and repeated items in content_json)
-- ----------------------------------------------------------------------------

-- Blog Hero Featured Card
INSERT OR IGNORE INTO cms_section_blocks (
  id, section_id, definition_id, definition_key, block_order, content_json, status, created_at, updated_at
) VALUES (
  'blk-home-hero-card',
  'sec-home-hero',
  (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-article-card' AND version='1.0.0'),
  'journal-article-card', 1,
  json('{
    "slug": "the-art-of-slow-travel",
    "title": "The Art of Slow Travel: Finding Meaning in the In-Between",
    "excerpt": "Why rushing from landmark to landmark is ruining our ability to truly experience the world around us.",
    "date": "October 12, 2023",
    "read_time": "8 min read",
    "category": "Travel",
    "cover_asset_id": "asset-cover-slow-travel",
    "author_name": "Jane Doe",
    "author_avatar_asset_id": "asset-author-avatar",
    "featured": true
  }'),
  'active', datetime('now'), datetime('now')
);

-- Blog Entries Blocks
INSERT OR IGNORE INTO cms_section_blocks (
  id, section_id, definition_id, definition_key, block_order, content_json, status, created_at, updated_at
) VALUES
  ('blk-home-entry-1', 'sec-home-entries',
   (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-article-card' AND version='1.0.0'),
   'journal-article-card', 1,
   json('{
     "slug": "analog-photography-digital-age",
     "title": "Embracing Analog in a Hyper-Digital Age",
     "excerpt": "There is something profoundly grounding about the mechanical click of a shutter and the anticipation of developing film.",
     "date": "September 28, 2023",
     "read_time": "5 min read",
     "category": "Photography",
     "cover_asset_id": "asset-cover-analog",
     "author_name": "Jane Doe",
     "author_avatar_asset_id": "asset-author-avatar",
     "featured": false
   }'),
   'active', datetime('now'), datetime('now')),

  ('blk-home-entry-2', 'sec-home-entries',
   (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-article-card' AND version='1.0.0'),
   'journal-article-card', 2,
   json('{
     "slug": "morning-rituals",
     "title": "Morning Rituals That Actually Work",
     "excerpt": "Beyond the 5 AM club: finding a morning routine that respects your natural rhythms rather than fighting them.",
     "date": "September 15, 2023",
     "read_time": "6 min read",
     "category": "Lifestyle",
     "cover_asset_id": "asset-cover-morning",
     "author_name": "Jane Doe",
     "author_avatar_asset_id": "asset-author-avatar",
     "featured": false
   }'),
   'active', datetime('now'), datetime('now')),

  ('blk-home-entry-3', 'sec-home-entries',
   (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-article-card' AND version='1.0.0'),
   'journal-article-card', 3,
   json('{
     "slug": "architecture-of-silence",
     "title": "The Architecture of Silence",
     "excerpt": "Exploring spaces designed specifically to cultivate quiet and reflection in modern cities.",
     "date": "August 30, 2023",
     "read_time": "10 min read",
     "category": "Design",
     "cover_asset_id": "asset-cover-silence",
     "author_name": "Jane Doe",
     "author_avatar_asset_id": "asset-author-avatar",
     "featured": false
   }'),
   'active', datetime('now'), datetime('now')),

  ('blk-home-entry-4', 'sec-home-entries',
   (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-article-card' AND version='1.0.0'),
   'journal-article-card', 4,
   json('{
     "slug": "taste-of-memory",
     "title": "The Taste of Memory",
     "excerpt": "How a simple bowl of broth transported me back to a rainy afternoon in Kyoto.",
     "date": "August 12, 2023",
     "read_time": "4 min read",
     "category": "Food",
     "cover_asset_id": "asset-cover-memory",
     "author_name": "Jane Doe",
     "author_avatar_asset_id": "asset-author-avatar",
     "featured": false
   }'),
   'active', datetime('now'), datetime('now'));

-- Post 1 Editorial Blocks
INSERT OR IGNORE INTO cms_section_blocks (
  id, section_id, definition_id, definition_key, block_order, content_json, status, created_at, updated_at
) VALUES
  ('blk-p1-lead', 'sec-post-1-body',
   (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-lead-paragraph' AND version='1.0.0'),
   'journal-lead-paragraph', 1,
   json('{"text":"Why rushing from landmark to landmark is ruining our ability to truly experience the world around us."}'),
   'active', datetime('now'), datetime('now')),

  ('blk-p1-text-1', 'sec-post-1-body',
   (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-text-block' AND version='1.0.0'),
   'journal-text-block', 2,
   json('{"text":"The modern world demands our constant attention. We are bombarded with notifications, emails, and the endless scroll of social media. In this cacophony, silence has become a luxury, a rare commodity that we must actively seek out and cultivate."}'),
   'active', datetime('now'), datetime('now')),

  ('blk-p1-quote', 'sec-post-1-body',
   (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-quote-embed' AND version='1.0.0'),
   'journal-quote-embed', 3,
   json('{"quote":"In the attitude of silence the soul finds the path in a clearer light, and what is elusive and deceptive resolves itself into crystal clearness.","author":"Mahatma Gandhi"}'),
   'active', datetime('now'), datetime('now')),

  ('blk-p1-head-1', 'sec-post-1-body',
   (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-heading-block' AND version='1.0.0'),
   'journal-heading-block', 4,
   json('{"text":"The Architecture of Quiet Spaces","level":2}'),
   'active', datetime('now'), datetime('now')),

  ('blk-p1-img', 'sec-post-1-body',
   (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-image-embed' AND version='1.0.0'),
   'journal-image-embed', 5,
   json('{"asset_id":"asset-embed-architecture","alt":"Minimalist architecture","caption":"The interplay of light and shadow creates a natural rhythm that encourages reflection.","size":"wide"}'),
   'active', datetime('now'), datetime('now')),

  ('blk-p1-author', 'sec-post-1-body',
   (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-author-bio' AND version='1.0.0'),
   'journal-author-bio', 6,
   json('{"name":"Jane Doe","bio":"Documenting the quiet moments between the noise. A journal of travel, photography, and finding meaning in the everyday.","avatar_asset_id":"asset-author-avatar","twitter":"@janedoe","instagram":"@jane.captures"}'),
   'active', datetime('now'), datetime('now'));

-- Post 2 Editorial Blocks
INSERT OR IGNORE INTO cms_section_blocks (
  id, section_id, definition_id, definition_key, block_order, content_json, status, created_at, updated_at
) VALUES
  ('blk-p2-lead', 'sec-post-2-body',
   (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-lead-paragraph' AND version='1.0.0'),
   'journal-lead-paragraph', 1,
   json('{"text":"There is something profoundly grounding about the mechanical click of a shutter and the anticipation of developing film."}'),
   'active', datetime('now'), datetime('now')),

  ('blk-p2-text-1', 'sec-post-2-body',
   (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-text-block' AND version='1.0.0'),
   'journal-text-block', 2,
   json('{"text":"In an era where we capture thousands of images on smartphones only to never look at them again, working with a roll of 36 exposures imposes a deliberate slowness. Each press of the shutter button is a financial and temporal commitment."}'),
   'active', datetime('now'), datetime('now')),

  ('blk-p2-quote', 'sec-post-2-body',
   (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-quote-embed' AND version='1.0.0'),
   'journal-quote-embed', 3,
   json('{"quote":"Limitations produce focus. When you only have thirty-six frames, you learn to look twice before looking through the glass.","author":"Anonymous Printmaker"}'),
   'active', datetime('now'), datetime('now')),

  ('blk-p2-author', 'sec-post-2-body',
   (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-author-bio' AND version='1.0.0'),
   'journal-author-bio', 4,
   json('{"name":"Jane Doe","bio":"Documenting the quiet moments between the noise. A journal of travel, photography, and finding meaning in the everyday.","avatar_asset_id":"asset-author-avatar","twitter":"@janedoe","instagram":"@jane.captures"}'),
   'active', datetime('now'), datetime('now'));

-- About Editorial Blocks
INSERT OR IGNORE INTO cms_section_blocks (
  id, section_id, definition_id, definition_key, block_order, content_json, status, created_at, updated_at
) VALUES
  ('blk-about-p1', 'sec-about-profile',
   (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-text-block' AND version='1.0.0'),
   'journal-text-block', 1,
   json('{"text":"I started this space as a way to document the quiet moments that often go unnoticed. In a world that constantly demands our attention and pushes us to move faster, I found myself craving stillness."}'),
   'active', datetime('now'), datetime('now')),

  ('blk-about-p2', 'sec-about-profile',
   (SELECT id FROM cms_definitions WHERE account_id=:account_id AND definition_key='journal-text-block' AND version='1.0.0'),
   'journal-text-block', 2,
   json('{"text":"Through my photography and essays, I explore the intersection of travel, mindfulness, and the art of paying attention. Whether I am wandering through quiet neighborhoods or sitting in a corner cafe, my goal is always to capture the essence of being fully present."}'),
   'active', datetime('now'), datetime('now'));

-- ----------------------------------------------------------------------------
-- 12. VERIFICATION QUERY (Validates row counts across all seed tables)
-- ----------------------------------------------------------------------------
SELECT 'cms_themes' AS table_name, COUNT(*) AS total_rows FROM cms_themes WHERE slug='plain-jane'
UNION ALL
SELECT 'cms_definitions', COUNT(*) FROM cms_definitions WHERE account_id=:account_id AND definition_key LIKE 'journal-%'
UNION ALL
SELECT 'cms_component_templates', COUNT(*) FROM cms_component_templates WHERE sku LIKE 'tpl-journal-%'
UNION ALL
SELECT 'cms_sites', COUNT(*) FROM cms_sites WHERE slug=:site_slug
UNION ALL
SELECT 'cms_collections', COUNT(*) FROM cms_collections WHERE slug='journal-starter'
UNION ALL
SELECT 'cms_navigation_menus', COUNT(*) FROM cms_navigation_menus WHERE account_id=:account_id
UNION ALL
SELECT 'cms_global_settings', COUNT(*) FROM cms_global_settings WHERE site_id=(SELECT id FROM cms_sites WHERE slug=:site_slug)
UNION ALL
SELECT 'cms_assets', COUNT(*) FROM cms_assets WHERE account_id=:account_id
UNION ALL
SELECT 'cms_pages', COUNT(*) FROM cms_pages WHERE site_id=(SELECT id FROM cms_sites WHERE slug=:site_slug)
UNION ALL
SELECT 'cms_page_sections', COUNT(*) FROM cms_page_sections WHERE definition_key LIKE 'journal-%'
UNION ALL
SELECT 'cms_section_blocks', COUNT(*) FROM cms_section_blocks WHERE definition_key LIKE 'journal-%';
