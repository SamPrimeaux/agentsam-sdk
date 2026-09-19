# CMS

The real CMS execution pipeline — page/block/section create+update, publish, site-shell save, and the CMS pipeline bootstrap/extract/inject/prototype steps. This is the canonical content system; do not reinvent a thinner one in a scaffold.

**17 tools** in this domain.

## `cms.execute` (17)

- **`agentsam_cms_block_create`** (CMS Block Create) — Create one block/component under a section. Does not publish. _never used_
- **`agentsam_cms_block_update`** (CMS Block Update) — Update one block/component. Does not publish. _never used_
- **`agentsam_cms_page_create`** (CMS Page Create) — Create one CMS page (draft). Does not publish. Use agentsam_cms_publish separately. _never used_
- **`agentsam_cms_publish`** (CMS Publish) — Complete publish: draft R2 → published, D1 status=published, cache bust. Always follow with agentsam_cms_verify_live. _never used_
- **`agentsam_cms_publish_site_shell`** (CMS Publish Site Shell) — Copy site shell draft R2 → published (src/components/iam-header.html or iam-footer.html). Run after agentsam_cms_save_site_shell. _never used_
- **`agentsam_cms_read`** (CMS Read) — Read CMS page metadata, sections, draft/published HTML excerpts, and preview_urls. Start every revision loop here. _never used_
- **`agentsam_cms_save_injected`** (CMS Save Injected Section) — Persist HTML fragment or full document as R2-backed cms_page_sections row + rebuild draft.html. _never used_
- **`agentsam_cms_save_page_html`** (CMS Save Page HTML) — Write full-page HTML to R2 draft.html (preserves published status). Use for remasters and full-page rewrites. _never used_
- **`agentsam_cms_save_site_shell`** (CMS Save Site Shell) — Write marketing chrome HTML to R2 draft keys (iam-header / iam-footer). Same as CMS editor Site Shell panel save. _never used_
- **`agentsam_cms_section_create`** (CMS Section Create) — Create one section on an existing page. Does not publish. _never used_
- **`agentsam_cms_section_update`** (CMS Section Update) — Update one section via domain service. Prefer over inventing page-create via agentsam_cms_write. Does not publish. _never used_
- **`agentsam_cms_verify_live`** (CMS Verify Live URL) — Fetch live storefront URL and confirm 200 + real content (not Clean canvas / 404). Required to complete the PrimeTech loop. _never used_
- **`agentsam_cms_write`** (CMS Write) — Update cms_page_sections.section_data, stage KV draft, write R2 draft.html. Then publish + verify. _never used_
- **`cms_pipeline_bootstrap`** (CMS Pipeline Bootstrap) — Load CMS pages + sections tree from D1 via Python pipeline worker. _never used_
- **`cms_pipeline_extract`** (CMS Pipeline Extract) — Parse HTML for data-cms-section slots and default D1 section stubs (Python BeautifulSoup). _never used_
- **`cms_pipeline_inject`** (CMS Pipeline Inject) — Splice section HTML into a page shell (preview only — persist via save-injected / cms_write). _never used_
- **`cms_pipeline_prototype`** (CMS Pipeline Prototype) — Workers AI section/HTML prototype via iam-cms-pipeline (read-only proposal; apply with agentsam_cms_write). _never used_
