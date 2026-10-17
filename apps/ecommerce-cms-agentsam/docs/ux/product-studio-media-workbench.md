# Product Studio and Portable Media Workbench — UI + Runtime Acceptance Contract
Status: Required implementation contract. Source references: supplied Product Studio, Completeful, and image-viewer screenshots (2026-10-09/10).
Owner: Ecommerce product frontend; runtime/provider functionality belongs to shared SAM/media packages. This is not a live implementation receipt.

## Enter / exit studio
- Entering Product Studio changes to a focused editor shell. The ordinary ecommerce admin menu/sidebar disappears; provide a visible, accessible breadcrumb/back control to restore the previous admin page. Do not destroy page state on entry/exit.
- Preserve top-level Save design, Next step / Product details, active product/variant information, and supported workflow states. Do not hardcode FuelNFreetime content into reusable shell.
- Desktop: compact top toolbar; narrow left tool rail; central canvas is dominant; minimap floats unobtrusively and can be hidden. Only one contextual tool panel opens at a time.
- Mobile first: editing canvas gets priority; tool rail becomes discoverable bottom/side controls; contextual tools and product variant selectors must not cause horizontal scrolling, giant fixed panels, or covered call-to-action buttons. Restore selection/focus and work across rotations.

## Artboard and product preview
- Main preview should show the actual selected garment image/render when available, with honest, clearly labeled fallbacks when only neutral guides exist. Maintain stable product identity, selected variant/color, selected print location, and FRONT/BACK switching.
- Print bounds, bleed/safe zone, grid and snap lines are optional overlays. Their known production coordinates remain correct but their fills MUST NOT obscure the product. Toggling grid/safe zone should not change artwork pixels, coordinates, or print output.
- The existing ps-design-guide / ps-design-print-area block is a guide, not background removal. Reduce/remove its solid white slab, but do not remove the print-area constraint or silently treat a positioning guide as provider proof.
- Artwork selection: configurable brand/accent selection border (purple for the current installation), resize drag handles, rotation handle, move/align/flip/crop/replace where supported, and contextual top icon toolbar. Handles are visible ONLY for active selection and never baked into exported artwork.
- Keep precise x/y/scale/rotation in the same authoritative placement state used by manufacturing preparation. Undo/redo, snap, keyboard movement and pointer/touch gestures must not desynchronize the canvas, minimap, saved draft and prepared PNG.
- Do not reuse dark/olive theme literals (#758e65, #718a51, #7c984c, etc.) as Product Studio accents. Resolve accents through the installation's actual design tokens; theme fallbacks must be neutral and contrast-safe, not merchant specific.
- Minimap should reflect selected variant, placement and active product artwork, not an unrelated stock preview. Indicate when a mockup is a local approximation versus provider-rendered.

## miniAgentSam instead of the old AI card
- Replace the bottom StudioWorkspace ps-composer / creative partner text area and separate pseudo-AI cards with the canonical miniAgentSam single-line contextual composer. Do not create a parallel agent system or leave both composers in the editor.
- The mini composer appears contextually near the asset/selection or as a compact dock control, with eye/hide, accessible labels, send and expand-to-Side-Assistant. It must not cover the canvas or require scrolling below references to interact.
- Capture resource context: installation, product, variant, print surface, selected artwork/asset version, selection coordinates, and requested action. Do not take user-provided IDs/roles as execution authority.
- Natural language actions should be proposals and executions through the existing AgentSam run and domain operation authority. Preserve explicit review/save for image derivatives and publishing; do not fake a model response.
- Reuse InnerAnimalMedia AgentImageGenerationCard.tsx interaction/state principles (quiet in-progress placeholder; progressive image preview; variations; lightbox; conversational revise/edit; Save, Discard, retry/error feedback), packaged into the standalone app rather than importing the source repo. Progress must reflect real provider/run events, not animated timers presented as real percentages.
- Provider unavailability and job failures leave the current artwork/product intact with actionable retry and readable error states.

## Reusable image full-view media editing
- Any supported full-view image, across Media Library, Product Studio, Theme Studio media pickers, Brand/Asset workspaces and AgentSam chat, should open the same portable editor/action surface.
- Compact accessible toolbar: Markup (draw/sketch on a non-destructive overlay); Comment (anchored pins, discussion and revisions); Remove BG (transparent derivative preview); Erase (manual mask/alpha); Resize (dimensions/aspect/quality); contextual miniAgentSam composer. Provide Undo/Redo, compare/before-after, reset, Save as new asset where relevant.
- Markup is not automatically destructive to the original. Comment pins are referenced to image coordinates and must not be rendered into the exported image unless explicitly requested. Preserve transform lineage and permissions.
- Only one toolbar popover/edit mode at a time. Escape closes transient menu before closing viewer, focus is restored, controls work with touch and keyboard, no clipped modal, no horizontal overflow.
- Shared operations must be offered by the actual image/media capability registry, not duplicated as local endpoint-specific scripts. Same operation and result shape across surfaces, with honest unavailable fallbacks.
- Bulk edits require independent per-asset outcomes, dedup/idempotency and readable partial-failure receipts.

## Two image-processing paths are required
- Repair the failing @jsquash / WebAssembly Worker pipeline: identify the exact instantiation failure, verify Worker-compatible WASM loading, implement supported runtime fix, and test JPEG/PNG/WebP end to end. Do not silently remove this processor or make Cloudflare Images the sole optimizer.
- Independently integrate and verify Cloudflare Images IMAGES binding transforms, including segment: foreground, with suitable alpha-output format and source-aware authorization. IMAGES is an optional host processor, not the entire media architecture.
- Keep Node/Sharp (and optionally enrolled ExecOS/local processors) behind host-specific adapters for portable transforms, bulk preparation and fallbacks. Do not bundle native Sharp/ExecOS into Worker runtime.
- Canonical media.image.background.remove chooses an authorized, available processor by capabilities/format, accurately distinguishes general subject segmentation from connected-flat-color removal, validates alpha and real output dimensions and saves a separate derivative.
- Originals and masters remain intact. R2 derivative objects and D1 records must include actual source, operation, provider, output format/dimensions, version, request/receipt identity and correctly scoped installation owner.
- Manufacturing-ready artwork still requires explicit merch/provider preflight; a good preview is not proof of 300 DPI or provider acceptance.

## Portability / delivery / acceptance
- Use exact app-local installed packages or pinned registry artifacts. The released Ecommerce application must build/run with no sibling SDK, InnerAnimalMedia, ExecOS or FuelNFreetime checkout. Do not use developer-machine absolute imports or workspace fallbacks.
- The existing SAM generated-v2 directory is source material, not executable merely because it contains tests; test registration, handler bindings, permission resolution, provider availability, and standalone packaging.
- Verify browser UI at phone/tablet/desktop, with actual screenshots and keyboard/touch behaviors: enter workspace, hide menu, front/back, select/drag/resize/rotate artwork, keep transparent overlays, edit image, use miniAgentSam, save derivative and restore draft.
- Verify both transformations separately: @jsquash Worker job path (real job state + R2 output), IMAGES subject segmentation (real alpha output), and Node/Sharp host path. Test lossless source preservation, retry, cancellation, provider outage, duplicate delivery, and a second merchant installation.
- Test/mock fixtures must be labeled as such; avoid claims of completed image generation/editing, production deployment, or provider availability without a real verified receipt.
- Do not deploy to live merchant storefront or mutate production D1/R2 to prove a feature. Use an isolated preview and authorized test resources; report precise completion, failure and unverified gates.
