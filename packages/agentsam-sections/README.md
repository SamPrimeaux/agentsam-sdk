# @inneranimalmedia/agentsam-sections

## Canonical CMS section host

The primary API is **CmsSectionHost**. This is a structural, theme-neutral
section host, **not** a two-column marketing layout or a separate CMS.

Hosted apps pass the authorized, installed D1 `cms_definitions` and
`cms_components` records plus explicit renderer implementations to
`createCmsRendererRegistry()`. Only rows with
`cms_components.implementation_status = 'verified'`, an active
matching definition, a matching definition version, and a supplied
implementation can render. The registry never dynamically imports
unverified code or generates theme layouts.

```tsx
import { CmsSectionHost, createCmsRendererRegistry } from '@inneranimalmedia/agentsam-sections';

const registry = createCmsRendererRegistry(
  definitions, // installed cms_definitions rows from authorized site
  components, // installed cms_components rows
  rendererImplementations // exact renderer_key -> verified React implementation
);

<CmsSectionHost section={siteOwnedSection} registry={registry}
  mode='editor' viewport='phone' selected={true}
  actions={{select,move,toggle,duplicate,remove}} />
```

The section host owns stable instance identity, renderer and definition
resolution, nested block slots, visibility and editor action interfaces.
Theme implementations own layout, markup, typography, media, motion,
content bindings and behavior. Merchant data and publication state remain
under the one `ecommerce-cms-agentsam` CMS.

### Ownership boundaries

- `cms_component_templates` is the merchant-facing catalog of prebuilt
  sections/components. It is not this package.
- `cms_definitions` owns versioned schemas and allowed block composition.
- `cms_components` identifies the verified renderer implementation.
  `cms_artifacts` stores immutable implementation artifacts.
- `cms_page_sections` and `cms_section_blocks` are the installed,
  site-owned editable instances.
- `agentsam-sections` is the host that consumes the authorized records and
  an explicit verified renderer map. It does not own catalog discovery,
  database persistence, theme presets or storefront embeds.
- The Apps picker is a separate domain: it contains installable
  `storefront_embeds`, not CMS sections or platform admin apps.

The former `section-library` package was a legacy visual renderer/preset
bundle. It was neither the merchant catalog nor the section host and must not
be reintroduced as a dependency of Ecommerce CMS.

Unknown renderers render a diagnostic only in editor mode. Preview and
published rendering throw; they never replace the theme with a dummy section.
Hidden sections do not render publicly. No CMS tables or SQL are shipped.

**Host requirement:** provide exact definition keys, version, renderer key,
settings, blocks and resolved data bindings from installed `cms_page_sections`
and `cms_section_blocks`. Never guess these from a static HTML screenshot.

### Existing Mxs compatibility

`MxsSection`, `MxsHeader`, `MxsFooter`, `MxsMedia`, `useMxsScroll` and
`mxs.css` remain exported for existing consumers. These are **legacy visual
components**, not the canonical CMS section shell. No new CMS editor should
require their heading, CTA, media or scroll assumptions.

### Acceptance

`npm --prefix packages/agentsam-sections test` compiles and exercises
arbitrary layouts, nested blocks, version validation and fail-closed
renderer resolution. Deployment requires the ecommerce CMS host to
actually supply verified renderer implementations for installed themes;
package-level tests alone do not establish live Theme Studio integration.
