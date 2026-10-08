# AgentSam UI Quality Gate v1

Status: source checks and default dark-theme token contrast run in CI.
The five-viewport browser harness is an additional release test.
**Static success does not mean UI READY.** Release-ready also needs browser
a11y, keyboard, visual and functional receipts in hosted and desktop builds.

Canonical machine contract: scripts/ui-quality/contract.v1.json.
Applies to Local Studio, portable Workbench components, FNF/CMS themes,
generated semantic/static/interactive sections and future plugin UI.

## Mobile-first is not phone UI stretched wider

| Viewport | Expected interaction |
| --- | --- |
| Phone 390x844 | One major surface; editor/settings/AgentSam as full-screen or bottom sheet; safe-area and keyboard-aware. |
| Tablet 820x1180 | Preview dominant, optional rails overlay or occupy capped width. |
| Desktop 1440x900 | Optional persistent editor rail and right inspector when room allows. |
| Large desktop 1728x1117 | Readable content and bounded panels. |
| Widescreen 2000x1200 | No endlessly growing sidebars; assign additional space to canvas intentionally. |

These are acceptance checkpoints, not the only widths. Also test landscape,
intermediate widths, reduced motion, 200% zoom and software keyboard. Use
container queries for portable embeddable widgets as needed. Start with
single-primary-surface flex min-h-0 flex-col. Introduce tablet overlays at md,
optional persistent rails at lg and capped panel widths on 2xl.
Use 100dvh and env(safe-area-inset-bottom). Aim for 44x44 phone touch targets.

## Accessibility and helpers

- Use native buttons, links, inputs and semantic landmarks.
- Every actionable icon has an accessible name through aria-label or
  aria-labelledby **independently** of its tooltip.
- Tooltip must work with focus. Crucial help must also be visible in context
  or accessible by a touch help action; never require hover.
- Use aria-expanded, aria-controls, aria-selected, aria-live, aria-busy and
  aria-describedby only when they accurately reflect state.
- Informative images require useful alt; decorative images use alt="".
- Logical Tab order, visible focus ring, Enter/Space, Escape and restored focus
  are required in modals/sheets/editors.
- WCAG AA contrast: 4.5:1 normal text; 3:1 large text and applicable UI
  components/focus indicators. Test the rendered background in every theme.
- Dead buttons, fabricated states, focus traps and hidden primary actions fail.

Local Studio's IconAction component is the initial supported icon-button
primitive: label, Radix tooltip and >=44px phone touch area.

## Replace inline styles safely

Use Tailwind utility classes for static layout/appearance and @theme tokens
for brand properties. Package portable layout CSS with the Workbench component
rather than requiring an unknown consumer to compile Tailwind utilities.
Do not construct runtime class names that Tailwind scanning cannot discover.

Before:

~~~tsx
<div style={{ display: "flex", gap: 12, padding: 16 }}>Content</div>
~~~

After:

~~~tsx
<div className="flex gap-3 p-4">Content</div>
~~~

Dynamic geometry is an exception: CSS variable carries *data*, CSS owns
layout, overflow, max width and responsive behavior.

~~~tsx
<aside className="editor-rail"
  style={{ "--editor-rail-width": panelWidth + "px" } as CSSProperties}>
  ...
</aside>
~~~

~~~css
.editor-rail { width: min(var(--editor-rail-width, 30rem), 42vw, 40rem); }
@media (max-width: 767px) {
  .editor-rail { position: fixed; inset: 0; width: 100%; max-width: none; }
}
~~~

Custom properties do not permit arbitrary inline visual CSS.

## Check and prove

~~~sh
node --test scripts/ui-quality/*.test.mjs
node scripts/ui-quality/check-source.mjs --changed-from origin/main
node scripts/ui-quality/check-source.mjs --files path/to/component.tsx,path/to/page.html
node scripts/ui-quality/contrast.mjs
~~~

Static rules check newly changed JSX/HTML lines, not the entire legacy codebase.
They catch missing alt, unnamed icon buttons, nonsemantic click targets and
inline styles; they cannot prove browser appearance and interactions.

Start the actual product first, then check five sizes:

~~~sh
node scripts/ui-quality/audit-viewports.mjs \
  --url http://127.0.0.1:8080/work \
  --expect '[data-agent-conversation-surface]' \
  --matrix full \
  --out /tmp/agentsam-ui-quality
~~~

Five screenshots and receipt.json report route/product presence, overflow,
basic visible naming, image alt and phone touch targets. A login redirect
does not count as passing the requested authenticated product surface.

Before declaring READY, run axe-core WCAG 2.2 AA on the rendered pages,
keyboard traversal, screen-reader checks, reduced-motion and visual reviews,
plus real create/edit/preview/publish interactions. Record separate hosted
and packaged desktop runtime evidence. Missing runtime evidence = NOT_READY.
