# Coverage and limitations

**Not complete against the assignment's exhaustive definition of done.** All three major modes and all 19 theme category entry points were traversed. The package is a reusable, evidence-backed reconnaissance baseline with an explicit remainder, not a claim that every reachable setting/state was tested.

## Totals

- 91 screenshots acquired; 88 retained for the catalog after removing an account-bearing entry screenshot, a no-effect capture, and a duplicate with an invalid PNG checksum.
- 27 reusable primitive families specified (C01–C27). This is an analytical grouping, not Shopify's internal component count.
- 401 normalized control records across 52 parsed panel observations. Count key: area/panel/group/label/type/occurrence. Conditional layouts can contribute additional records. This includes parser-derived records and is not an independently counted universe of controls.
- 19/19 category entry points expanded; 6/6 initial home sections inspected; 17 home block inspector variants captured, plus two collection-template section variants. A section-specific Header group inside Featured collection was visible in the tree but its own inspector was not separately captured.
- 7 documented conditional/availability dependencies: 5 actively exercised and undone; 2 observed in existing state.
- Observed state families: default/rendered, hover/selected affordances, focus, pressed/active, expanded, collapsed, disabled, empty, loading, nested, dirty and dismissed. These are not verified for every primitive. Error/validation states were not safely and systematically reached.

## Area matrix

| Area | Controls found | States inspected | Evidence | Unverified items |
|---|---|---|---|---|
| Global shell | Mode icons, template, identity, inspection, preview, history, overflow, save | Wide + compact; disabled and dirty; tooltip | `shopify/theme/typography/expanded`, `shell/compact/typography`, `shopify/shell/overflow/open` | Desktop overflow differs from compact; all shortcuts; resize handles; exact breakpoints/zoom |
| Home section tree | 6 sections; nested blocks; fixed rows; 3/3 block limit | Expanded, selected, inline affordances, disabled | `shopify/sections/*`, `shopify/blocks/*` | Keyboard reordering; drag outcome; full hover/focus matrix; rename UI |
| Section catalog | Search, categories, Sections/Apps, Generate | Open, scroll, no results, Escape | `shopify/sections/add-section/*` | Each option preview; Apps tab contents; new-section settings, because no section insertion performed |
| Block catalog | Contextual/basic and Show all expanded categories | Open, nested list expansion | `shopify/blocks/add-block/*` | Each optional block inspector; app blocks; full list scrolling screenshot set |
| Theme categories | 19 category entry points; normalized fields/options in 03 | Expanded/collapsed; current values | `shopify/theme/*` | Lower scroll positions lack complete visual captures in long categories; per-control state activation incomplete |
| Fonts | Four roles, system fonts, virtual Other fonts, Inter styles | Stacked panel, search focus, loading | `shopify/theme/typography/*` | Full font list; completed no-results; font application/weight transitions; cancel focus return |
| Colors | Palette, picker canvas/hex/hue; overlay alpha | Open/nested; current values | `shopify/theme/color-palette/*`, `sections/hero/color-overlay-open` | Grid choices; reset/clear; validation; eyedropper; Add color; schemes not observed |
| Media | Logo/inverse/favicon field; empty modal, sort choices | Empty, modal, disabled Done, nested sort | `shopify/theme/logo-and-favicon/*` | Populated selection, upload, file filters/view modes, errors, media crop/edit; no asset upload |
| Conditionals | Hero media/mobile/custom height; collection layout types | Dirty, conditional fields, preview change and undo | Hero and Featured collection conditional captures | Other conditional settings across all controls; min/max/step for most ranges |
| Templates | Root plus Products, Collections, Pages, Blogs, Blog posts | Nested/back, disabled zero assignments, collection loading/empty preview | `shopify/shell/template-picker/*`, `sections/collection*/settings` | Cart/search/password/gift card/404/checkout interfaces and settings; full template switching; product blocked by store data |
| App embeds | Search, empty install state, Forms/Inbox recommendations | Default and no results | `shopify/app-embeds/*` | Installed toggles/config/loading/error; no installs performed |
| AgentSam live | Shell, tree selection, catalog, modes, preview devices, More/save, phone shell | Selected, empty search, loading, disabled save/history, responsive phone | `agentsam/studio/*` | Full theme settings blocked; section fields absent for selected site; media/block inspectors inaccessible from selected section |
| AgentSam source | Existing owners and selected implementation excerpts | Static read-only inspection | `source/*` | Deployed hash matching; full import graph; backend cause; test execution |

Per-area normalized counts and screenshot IDs are also generated in `coverage-summary.json`. Inspect the machine inventory and DOM snapshot before treating any field list as exhaustive.

## Evidence caveats

1. Browser pane changes and a viewport override caused some captures to show a clipped wide layout. These are valid detail captures but not valid breakpoint proofs. The explicit override was reset. Captured image dimensions are listed individually; actual browser zoom was not verified.
2. `font-search-loading` deliberately preserves a spinner capture. It was initially named as empty, then corrected. A loading state must not be reported as a completed search result.
3. `collection-loading` deliberately captures skeleton/progress during template switching; the later collection section captures show the stable result.
4. The capture originally intended as global CSS actually showed Hero CSS and was relabeled `sections/hero/custom-css`. Failed selector attempts without screenshots were excluded.
5. An App embeds capture initially named `clean` actually showed enabled Save. It was excluded as a duplicate with an invalid PNG checksum. No final clean-state claim relies on it.
6. No private Shopify credentials, customer records, orders or payment information were accessed. Store/theme identifiers in text snapshots are redacted. The account-bearing AgentSam entry screenshot was omitted. Public storefront example content is retained only where needed for UI context.
7. The four earlier supplied screenshots were reference context. This package uses captures from the current live run as evidence; it does not claim a pixel comparison with those original files.

## Mutation and concurrent-work boundary

No Shopify Save/publish/theme duplication/app install was performed. Temporary setting edits were undone. An unintended dirty state encountered during the viewport pass was undone, restoring Hero. A later clean Save-disabled state was observed before AgentSam inspection. Subsequently Shopify changed to include a new Image block while research continued in the other tab. Further Shopify interaction stopped; the final user tab was not reverted or claimed clean.

AgentSam fields were not edited; no Save, publish, generation, embed install, code/schema/deployment/data change occurred. Preview device browsing was restored to the originally observed Tablet selection. Source commands were reads only.

## Exact remainder to reach exhaustive completion

1. Resume in a quiet Shopify session with a confirmed initial configuration; avoid concurrent edits.
2. Capture lower scroll regions for every long category and inspector, with viewport and zoom metadata captured at the same moment.
3. Open every unique dropdown/picker submode; complete the virtual font list enumeration; inspect media filter/view/stock-library and dynamic-source choices without uploading.
4. Traverse all additional selectable templates and their unique existing blocks/settings. Mark product-dependent views blocked rather than creating products.
5. Exercise remaining safe conditional branches one at a time, record changed control sets, undo and verify clean state after each.
6. Complete the per-primitive keyboard/focus/dismissal matrix, hover captures, semantic/contrast checks and responsive breakpoint measurements. Do not manufacture failures with destructive actions.
7. Revisit AgentSam with a supported existing schema-backed section; resolve which live settings surface is authoritative before declaring missing UI. Validate fuller controls only where already reachable.

No official-documentation claims were substituted for missing live evidence in this report. Missing states remain missing.
