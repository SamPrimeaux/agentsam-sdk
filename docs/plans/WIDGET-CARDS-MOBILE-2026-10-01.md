# Widget cards + mobile-first app surfaces

**Status:** plan only. No code, manifests, or package changes land with this document.
**Base:** `main` @ `dfb40ed` (v2.6.5). Authored from a read-only audit of `main`.
**Revision 2:** adds the reuse-before-build rules (section 4b) and ties card states to the existing error contracts.
**Companions:** `AGENTSAM.md`, `docs/PRODUCT_LIFECYCLE.md`, `apps/README.md`.

---

## 1. Purpose

When an app, tool, or dashboard is built or connected through AgentSam, its internal mini apps and
widgets should be reachable as clean, uniform cards that feel like native iOS quality, and the
inner navigation of every app should be optimized for phone screens first.

Build the card system once. Every new app or MCP tool then gets a tidy, tappable presence by
shipping a small declaration, not bespoke UI.

## 2. Goals

1. **One card contract**: a small set of uniform templates driven by data, not per-tool UI.
2. **Declared, not coded**: apps and tools opt in through their existing manifests.
3. **Three renderers, one source**: React (dashboards/desktop), SwiftUI WidgetKit (iOS home screen), and later Android, all fed from the same derived registry.
4. **Mobile-first navigation**: drawer, drill-in, safe areas, and touch targets are the default for every dashboard-family app.
5. **Tauri mobile**: the desktop shell extends to iOS/Android as a transport profile, with no App Store dependency for development use.
6. **Reusable and resale-safe**: zero operator bleed. Brand, endpoints, and deep-link schemes come from manifests, never from source.
7. **No one-offs**: every concern this plan touches (errors, events, assets, theming, queues, work items) uses the package that already owns it.

## 3. Non-goals

- No new parallel manifest authority, registry, error vocabulary, or UI shell stack.
- No customer-facing git dependency.
- No autonomous widget behavior. Cards display and deep-link; any action runs only when the user explicitly invokes it, per the standing AgentSam policy.
- No claim of iOS/Android "supported" until a receipt-backed proof exists (see section 9).
- No App Store submission in scope.

## 4. Audit findings this plan builds on

| Area | Finding | Consequence |
|---|---|---|
| Manifests | `agentsam.app.v1` already declares `surfaces`, `provides`, `routes`, `commands`. Mcp-bridge tools declare `tool.json`, auto-discovered by `registry.go`. | Add an optional `card` block to these. Do not create a third manifest. |
| Registry law | `PRODUCT_LIFECYCLE.md` section 6: registries are derived from manifests; hand lists are release bugs. | Card registry must be generated. |
| UI layer | `agentsam-workbench` is the shared React layer. `agentsam-nav` is published and mobile-first. `agentsam-contracts` has `./tools`, `./artifacts`, `./events`, `./errors`. `agentsam-shell-kit` is a deprecated facade. | Schema in contracts, renderer in workbench. No new UI package unless a gate in section 10 forces it. |
| Errors | `agentsam-errors` plus `protocol/errors/` (catalog, envelope schema, recovery schema) and the `errors:generate` / `errors:check` gates already define one error vocabulary. The catalog is the source; vocabulary, TS types and JSON schema are generated from it. | Card error states carry that envelope. No card-specific error shape. |
| Tauri shell | Tauri 2 with deep-link (desktop schemes only), updater, tray-icon, and bundled `agentsamd` and `node` sidecars. `Cargo.toml` has only `[[bin]]`. `keyring` is already iOS-gated. | Mobile needs a lib target and `cfg` gating (section 7). |
| Transport | A phone cannot run `agentsamd`. Lane 2 (desktop transport) defines an authenticated hosted session bridge. | Mobile is a transport profile of Lane 2, not a separate project. |
| Widgets | No WidgetKit code found. The audit grep sampled about 80 files, so this is not conclusive. | Verify before Phase 2. |
| Graduation | Only CAD Creator passes strict product proof. Local Studio has about 20 escaping `file:` deps. | Do not deepen monorepo-only coupling while adding cards. |

## 4b. Reuse before build

Every concern below already has an owner. The plan extends the owner and does not add a parallel copy.
Package APIs listed here were identified from manifests and export maps only; Phase 0 must read each one and record whether it fits before anything is built on it.

| Concern | Existing owner | Rule for cards |
|---|---|---|
| Failure, empty, stale, retry states | `agentsam-errors`, `protocol/errors/error-catalog.json`, `agentsam-contracts/errors` | A card error state carries an `AgentSamErrorEnvelope`. Use an existing catalog reason where one fits (for example `transport_unreachable`, `provider_unavailable`, `auth_missing`). A genuinely new reason is a catalog edit followed by `npm run errors:generate`, never a hand edit of generated files. |
| Event and receipt shapes | `agentsam-contracts/events`, `protocol/sam/*` schemas | Card interactions (opened, refreshed, failed) reuse these; no new event schema. |
| Tool and artifact shapes | `agentsam-contracts/tools`, `/artifacts` | A tool card is a presentation of an existing tool or artifact record. |
| Images and brand tiles | `agentsam-assets-core`, `agentsam-cloudflare-images`, `agentsam-brand` | Brand-tile imagery resolves through asset identity and provider representations, not raw URLs. |
| Theme tokens | `theme-scenes`, `heuristic-theme`, `agentsam-settings`, the `--dashboard-*` tokens | Cards inherit tokens; no new token vocabulary. |
| Queued or running work shown in `glance`/`list` | `agentsam-queue-control`, `work-graph` | Data sources project from these. A card never owns work state. |
| Credentials for widget refresh | `agentsam-vault`, `identity` | The widget uses the session transport. It never stores a long-lived secret. |
| Runtime reachability | `runtime-protocol`, `agentsam.runtime.v1` | Mobile is a transport profile; do not invent a mobile runtime contract. |
| Navigation | `agentsam-nav`, `agentsam-workbench` | The mobile standard (section 8) is implemented there. |

If a needed capability is missing from an owner, extend the owner. A new package is allowed only through the gate in section 10.

## 5. Card contract

Four templates cover the observed pattern (one wide pill plus equal circular shortcuts, glance tiles, brand tiles, short lists):

| Template | Shape | Slots |
|---|---|---|
| `launcher` | wide pill + 4 equal circles | pill: `{label, deeplink}`; circles: `{icon, label, deeplink}` x4 |
| `glance` | small square | one metric: `{value, unit, label, status}` |
| `brand` | image tile | `{image, title, deeplink}` |
| `list` | 2 to 3 rows | rows: `{icon, title, subtitle, deeplink}` |

Sizes: `small`, `medium`, `large`. Each template declares which sizes it supports.

### Manifest block (proposal, additive and optional)

```json
"card": {
  "template": "glance",
  "title": "<human title>",
  "icon": "<icon token>",
  "sizes": ["small", "medium"],
  "data": { "source": "<route key or tool operation id>", "refresh": "<ttl class>" },
  "deeplink": "<route key from the same manifest>"
}
```

Rules:
- `deeplink` and `data.source` reference **existing route keys / operation ids** in the same manifest. No raw URLs, hosts, account IDs, or schemes in the card block.
- The URL scheme is a per-brand/install value resolved from brand/install state, not hardcoded in the SDK.
- Cards inherit the `--dashboard-*` token vocabulary (radius, fill, accent). No separate token system.

### Card states

Every card renders exactly one of: `ready`, `stale`, `empty`, `error`.

- `error` and `stale` carry an `AgentSamErrorEnvelope` (section 4b). The renderer shows the envelope's remediation, and offers retry only when `retryable` is true.
- `stale` means the last good data is shown with its age, together with the envelope that explains why refresh failed.
- `empty` means the source answered with no data. It is not an error.
- A card whose declared data source is unavailable resolves to `error`, never a fabricated value and never a fallback to a platform-owner resource.

### Registry

`agentsam card registry` (name provisional) generates a derived index from manifests, written under `registry/` like other derived state. Hand edits are rejected by `app validate`.

## 6. Renderers

1. **React**: card components in `agentsam-workbench` (presentational, no data fetching), consumed by Local Studio, CAD, CMS, and client dashboards.
2. **SwiftUI WidgetKit**: Widget Extension inside the Tauri-generated Xcode project, reading a cached copy of registry data from an App Group. Tap opens the app via deep link.
3. **Android** (later): same registry, App Widget/Glance renderer.

The widget timeline provider fetches only through the authenticated session transport. It never embeds long-lived credentials. The native renderers receive the error envelope as JSON and render from its fields; they do not define a second vocabulary.

## 7. Tauri mobile

Changes required in `packages/agentsam-desktop-shell` (to verify by building, not assumed):

- Add `src/lib.rs` with `crate-type = ["staticlib", "cdylib", "rlib"]` and the Tauri mobile entry point; keep a thin `main.rs` for desktop.
- Gate desktop-only pieces behind `cfg` / platform-specific config: `agentsamd` and `node` sidecars, updater plugin, tray icon, deep-link `desktop` block, and `rfd` (mobile support unverified).
- Add a `mobile` deep-link configuration alongside the desktop one.
- Mobile uses the hosted session transport: no local PTY, no local `agentsamd`. Local PTY surfaces show an explicit unavailable state (an error envelope with an existing reason such as `unsupported_operation`), not a fake shell.
- Commit the generated Apple/Android project folders where widget extensions live, so regeneration cannot wipe them.
- Distribution for development: own-device install and TestFlight internal testing for iOS, sideloaded APK for Android. Public store release is out of scope.

## 8. Mobile-first navigation standard

Applies to every dashboard-family app via `agentsam-nav` and workbench primitives:

- Hamburger-triggered full-screen drawer with mini-nav drill-in and back.
- Safe-area insets respected; no content under system bars.
- Minimum 44pt touch targets; consistent radii and spacing from tokens.
- Composer anchored above the keyboard with the layout shifting, not clipping.
- One primary action per screen state.
- Card grid collapses to a single column on narrow viewports; no horizontal page scroll.
- Light and dark both first-class.

Proof is a viewport matrix in tests, not subjective review.

## 9. Phases and exit gates

| Phase | Scope | Exit gate |
|---|---|---|
| 0 | Fit check: read each owner package in section 4b and record whether its API fits; verify open questions (section 11) | Written findings appended to this doc, one line per owner package |
| 1 | Card schema in `agentsam-contracts`; React templates in workbench; `card` block validation in `app validate`; derived registry | Unit tests; `npm run verify` and `npm run errors:check` green; one real app and one mcp-bridge tool declare cards |
| 2 | Navigation standard applied to one proof app (Local Studio) | Viewport-matrix test passes; no horizontal scroll; touch-target check |
| 3 | Tauri mobile target builds and launches with hosted transport | Builds on a clean checkout; desktop build unaffected; receipt recorded |
| 4 | WidgetKit extension renders the four templates and four states from cached registry data | Device run receipt; error and stale states verified against real envelopes |
| 5 | Clean-room proof: packed artifact, a second brand, zero operator bleed | `prove` receipt PASS; leak scan clean |

Nothing is advertised as supported before its phase receipt exists.

## 10. Package decision

Default: no new package. Cards live in `agentsam-contracts` (types/schema) and `agentsam-workbench` (render). Create `agentsam-cards` only if the workbench would otherwise gain data-fetching or native-renderer concerns it must not own, and only after the Phase 0 fit check shows no existing owner can host the code.

## 11. Open questions (resolve in Phase 0)

1. Does any widget/card code or doc already exist outside the files sampled?
2. Do `rfd` and the other desktop dependencies compile for iOS/Android, or must they be gated?
3. How should the per-brand deep-link scheme be stored and resolved without hardcoding, given the current `agentsamstudio` scheme is desktop-only?
4. Which transport lane delivers the hosted session bridge, and does its auth model cover a background widget refresh?
5. How are App Group identifiers derived per brand so a client rebrand needs no source change?
6. Which existing catalog reasons cover card stale and error cases, and is any genuinely new reason needed?
7. Can `work-graph` and `agentsam-queue-control` serve as `glance`/`list` data sources as they are, or do they need an additive projection?

(Resolved: `fix/cli-catalog-authority` merged as PR #95 and does not change the registry path this plan extends.)

## 12. Risks

- Monorepo-only coupling (`file:` deps) leaking into the card code. Mitigated by the existing boundary gates.
- Widget background refresh limits on iOS may make live metrics stale; cards must show staleness explicitly.
- Scope creep into a second shell, registry, or error vocabulary. Mitigated by sections 4b and 10.
- Reuse assumptions made from manifests rather than source. Mitigated by the Phase 0 fit check.
