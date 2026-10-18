# FNF Theme Authoring Contract v1.1

This contract specifies the target authoring model for the **existing** FNF Theme Studio. It is not a statement that every capability is implemented. Implementations and side agents must check live migrations, API contracts, and current code before making database changes.

## Canonical ownership

- `cms_pages`: page/resource instances
- `cms_page_sections`: placed section instances
- `cms_section_blocks`: placed block instances
- `cms_definitions`: reusable section/block definitions (**target authority; verify migration and rollout before use**)
- `cms_artifacts`: immutable code/implementation artifact metadata backed by R2
- `cms_revisions`: private working revisions, history, and published snapshots
- `cms_globals`: shared site/theme settings
- `media_assets`: media authority, separate from CMS tables

A definition describes **what the component is**. An instance describes **where it is used and what the merchant configured**. A storefront resource (product, collection, customer, order) is bound by reference; do not duplicate business data into section JSON.

## Shopify-inspired, provider-neutral implementation classes

This is the FNF equivalent of a theme-authoring guide: it captures ownership and allowed edit paths, not Liquid or Shopify runtime behavior. The machine-readable authority is [`authoring.contract.json`](./authoring.contract.json).

| Class | Meaning | Current status |
| --- | --- | --- |
| `native` | Existing semantic theme/editor primitive; no generated artifact is required. | Supported |
| `artifact_static` | Reusable semantic definition backed by immutable HTML/CSS; no executable JS. | Current generated-section acceptance lane |
| `artifact_interactive` | Artifact with explicitly declared runtime capabilities. | **Unavailable** until one production acceptance/rendering contract is wired; do not assume the older block harness makes it installable. |
| `app` | Provider/widget-owned surface under its app contract. | Separate app contract |

`definition_key` is semantic and stable. `agentsam_gen_` is only per-placed-instance implementation isolation; duplicating an instance creates a new instance identity while reusing its immutable artifact. Definition-owned static slots remain editable but cannot be removed/reordered; dynamic slots are merchant-managed within the definition's allowed-block and maximum-count rules. Verify those policies against runtime code before relying on them.

A definition's declared typed settings schema—not initial values—is the public API. Content bindings use `data-cms`; visual values target instance-scoped CSS custom properties (`--__UID__-setting-<key>`). The complete field vocabulary and style-variable convention are contract targets; reject a field or binding the current editor/renderer does not implement. Prefer shared theme/global tokens for typography, colors, radii, and spacing.

## Code-mining / refurbishment boundary

The deterministic repository or machine crawler belongs to shared AgentSam Machine/Repository adapters, not this storefront Worker. It should emit bounded discovery receipts and relationship evidence; indexing and inspection consume that graph, and refurbishment proposes changes without mutating source repositories. This FNF contract is the promotion gate for a mined theme component: resolve the existing owner, classify it, preserve source repo/commit/path/hash and license/ownership evidence, normalize it to a semantic definition plus artifact, verify it, then require explicit approval before promotion. Never create an FNF-specific repository crawler or treat discovered code as automatically trusted.

## Mandatory normalization intake

For every harvested, packaged, or AgentSam-generated component:

1. Inspect registry and ownership first; extend an existing definition when appropriate.
2. Preserve design/behavior, extracting editable values into a typed settings schema.
3. Classify each dependency: media reference, app/provider capability, business resource reference, global setting, or implementation code.
4. Define semantic `definition_key`, `kind`, `version`, display label, category, allowed blocks, requirements, and provenance. Origin is **never** an editor type.
5. Namespace behavior and styles (generated instance prefix `agentsam_gen_`); use theme tokens and scoped properties.
6. Validate static security, scoped selectors, resource references, accessibility, responsive/reduced-motion support, duplicate-instance isolation, and schema round trips.
7. Materialize versioned implementation in the existing artifact lane and register the reusable definition; insert a normal instance only after validation.
8. Return evidence for preview, private autosave, editor reload, normal inspector edit, follow-up edit, and deliberate publish. If a check cannot be run, report **unverified**.

## Merchant UX law

Theme Studio opens directly into a recoverable private working revision. Autosave is private; **Publish is the only live promotion**. No merchant-facing *Start editing page*, *Replace private draft*, *adapter needed*, or *live-only* state. History/recovery operations are advanced tools; never replace existing revisions implicitly.

The page tree remains separate from the visual Section / App and Block / App catalogs. Catalog previews must invoke the actual section renderer. Allowed blocks come from the section definition, never an unconstrained universal picker. A generated section ends its creation lifecycle as an ordinary typed, editable, reusable section.

## Implementation order

1. Audit/reconcile published and working revision semantics (protect existing private drafts before removing entry gates).
2. Normalize existing FNF product and collection grid definitions; verify parity in real storefront.
3. Add schema-driven visual catalog for sections, then allowed blocks.
4. Connect AgentSam generation to the same definition registry and artifact lifecycle.
5. Polish miniAgentSam as a single-line command capsule; Side Assistant owns full conversation.
6. Later normalize global Header/Footer/Utilities without introducing editor islands.

**No new table families, secondary editor authorities, or hardcoded model selections.**
