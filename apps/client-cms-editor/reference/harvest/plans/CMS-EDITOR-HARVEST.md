# CMS Editor Harvest Plan

## Working assumption

The current editor is a substantial interactive prototype, not a trusted persistence/publication implementation.

The harvest should preserve interaction design and data-shape clues while replacing fake authority with real CMS contracts later.

## Keep as product requirements

### Navigation and authoring surfaces

- Pages
- Sections
- Components
- Templates
- Media
- CRM
- Settings

These are useful product surfaces even where the current data is mocked.

### Canvas behavior

Keep:

- selected section highlighting
- parent/iframe message bridge concept
- section click -> editor selection
- editor selection -> preview highlight
- scroll-to-section
- phone/tablet/desktop preview
- multi-device responsive preview
- zoom controls

Reimplement the preview transport against the real CMS draft runtime later.

### Inspector behavior

Keep:

- structured field editing
- booleans
- arrays/lists
- colors
- media references
- opacity/ranges
- JSON fields
- URLs
- dates
- rich text
- numeric inputs
- raw structured-field inspection
- spacing/layout controls
- theme variables
- page metadata / SEO

The important idea is schema-driven editing. The current hardcoded rendering is donor material, not the final schema engine.

### Editing workflow

Keep:

- dirty state
- undo/redo
- keyboard shortcuts
- command palette
- create-page wizard
- add-section modal
- template preview/apply flow
- upload queue UX
- history restore UX
- publish/schedule UX

## Adapt, do not copy as authority

### Site/Page/Section types

Current types are useful starting clues:

`Site -> PageData -> Section -> fields/css`

Target should become closer to:

`Site -> Page -> Section -> Block -> Fields -> DraftRevision -> PublicationRevision`

The target CMS should support stable IDs, versioned schemas, provenance, and immutable publication receipts.

### Theme state

Current CSS-variable theme editing is worth preserving.

Target should bind theme variables to a reusable theme contract and BrandPack rather than keeping a free-floating React state object.

### Media

The current media library is simulated.

Target should use AgentSam Asset Core / Content contracts and a provider adapter. UI concepts are reusable; data authority is not.

### CRM / analytics

Treat current CRM contacts, activity, conversion stats, and collaboration indicators as visual references only.

They must never become seeded customer data or production defaults.

## Drop from production extraction

Do not promote:

- fake contacts
- fake emails
- fake analytics
- fake collaboration users
- fake save delays
- fake upload progress
- fake publish success
- hardcoded "Connected" states
- hardcoded page metrics presented as real
- localStorage as CMS authority
- demo customer/site names as generic defaults
- deployment assumptions from this repo

## Minimum real CMS proof before calling the replacement functional

1. create/open site
2. open page
3. select section/block
4. edit one field
5. save to real persistence
6. reload the browser and observe the saved value
7. preview draft
8. confirm public site remains unchanged
9. publish explicit revision
10. confirm public runtime resolves the new immutable revision

Only after that loop is proven should AgentSam-assisted editing be considered production integration.

## AgentSam integration target

AgentSam receives explicit CMS context:

- account
- site
- route
- page
- section
- block
- current draft revision
- current theme
- permitted CMS actions

AgentSam acts through CMS commands, not direct DOM manipulation.

Examples:

- `cms_get_page`
- `cms_update_field`
- `cms_add_section`
- `cms_move_section`
- `cms_apply_theme`
- `cms_create_draft`
- `cms_preview`
- `cms_publish`

The model provider remains independent from the CMS implementation.
