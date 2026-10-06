# Heuristic composition runtime

The preset, page, section, and block schemas form the editor and AgentSam boundary. A page is an ordered section list; each section is an ordered block list. Controls may tune only values represented by these contracts. Motion internals stay inside `heuristic-runtime.js`.

Guardrails:

- Motion intensity is clamped to `0..1`; reduced-motion preference always wins.
- Section minimum height is bounded to `240..1400px` and maximum height to `320..2200px`.
- Scroll choreography is expressed in viewport depth and bounded to `0.5..3vh` equivalents.
- Autoplay media must be muted, inline, and lazy-loaded. Required media is validated at publish time; runtime does not silently substitute another asset.
- Hover is enhancement only; every destination remains clickable and understandable on touch and keyboard.
- Commerce bindings are references. Price, inventory, availability, and checkout state are never duplicated into CMS content.
- Runtime analytics contain section/product/collection identifiers and durations, never payment or customer fields.

The runtime emits `heuristic:section-impression`, `heuristic:section-engaged`, and `heuristic:commerce-click` browser events. An installed analytics adapter may consume them through `window.AgentSamAnalytics.track`; the theme does not assume or call a vendor endpoint.
