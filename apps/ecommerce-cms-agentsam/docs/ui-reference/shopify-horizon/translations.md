# Reference to AgentSam translations

The inventory describes a reference theme's editor. Build the AgentSam equivalent. Never link to or name Shopify.

| Reference term | AgentSam equivalent | Existing owner | Status |
|---|---|---|---|
| Sidekick, Ask for changes, Generate | AgentSam (full) and miniAgentSam, the in-editor assistant that opens beside the selection | openMiniAgentSam, generationSelectionContext, theme-editor-generation-bootstrap.mjs | exists |
| Exit link to the Shopify themes admin | Leave the editor back to the AgentSam admin | exitEditor, confirmLeave (theme-editor.js) | exists |
| Save, Save as, View actions | Save, save menu and toolbar More menu | setSaveState, saveDraft, toggleToolbarMenu | exists |
| Deactivate inspector | Inspector visibility toggle | setInspectorVisible | exists |
| Enable mobile preview | Desktop, Tablet and Mobile preview devices | setDevice | exists |
| Home page template picker | Page and template navigator | openPageMenu, renderPageOptions | exists |
| Sections, Theme settings, App embeds modes | The same three drawer modes | setEditorDrawer | exists |
| App embeds and the Shopify App Store | Packaged embed catalog; installing creates a page-owned CMS section | theme-embed-review.js | exists |
| Shopify Forms | CMS form builder embed | embed catalog form entries | partial |
| Shopify Inbox | No equivalent chosen yet; candidate is an AgentSam site-assistant embed | none | decide |
| Theme style (presets) | Theme presets such as Resolve, and theme-store packages | none | decide |
| Shop Pay, accelerated checkout buttons | Checkout wallet buttons through Stripe checkout | review panel marks them visual-only today | partial |
| Store settings, Markets, Languages, Legal, Customer accounts (admin links) | AgentSam admin settings pages | none | greenfield |
| Products, Collections, Pages, Blogs, Blog posts templates | products, cms_collections, cms_pages (blog and post page types) | renderPageOptions plus existing tables | partial |
| Horizon (theme name) | Reference only. AgentSam's own theme is Resolve. Never use Horizon in product naming. | none | reference |

## Link patterns to replace

| Reference link | Becomes |
|---|---|
| admin.shopify.com/store/<store>/themes | action: exit-editor |
| admin.shopify.com/.../editor?category=Typography | panel: theme-settings/typography |
| admin.shopify.com/.../editor?category=Buttons | panel: theme-settings/buttons |
| admin.shopify.com/.../editor?category=Logo+and+favicon | panel: theme-settings/logo-and-favicon |
| admin.shopify.com/.../editor?category=Input+fields | panel: theme-settings/input-fields |
| admin.shopify.com/store/<store>/settings/general | admin route: store-settings (greenfield) |
| admin.shopify.com/store/<store>/settings/markets | admin route: markets (greenfield) |
| admin.shopify.com/store/<store>/settings/languages | admin route: languages (greenfield) |
| admin.shopify.com/store/<store>/settings/legal | admin route: legal-policies (greenfield) |
| admin.shopify.com/store/<store>/settings/customer_accounts | admin route: customer-accounts (greenfield) |
| help.shopify.com/.../add-css | help topic: custom-css |
| help.shopify.com/manual/online-store/dynamic-checkout | help topic: accelerated-checkout |
| help.shopify.com/manual/customers | help topic: customer-profiles |
| apps.shopify.com/collections/online-store-2 | panel: app-embeds |
| <store>.myshopify.com/collections/all | route: /collections/all |
| x.com, youtube, tiktok, instagram, facebook | keep: placeholder social URLs in the social-links block |

Help topics resolve through one base URL in the app manifest. Panel links resolve through the editor's own navigation. Neither is a literal URL in data.
