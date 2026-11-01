# Creative Department Batch 1 — acceptance checklist

Integration Owner lane: shared shell / `agentsam-nav`, package compatibility, resource-card grammar, route QA.

Specialists own app presentation (CAD Creator, SamSketch, SamSculpt, MovieMode). They must **not** rewrite global nav.

## Shell / navigation (Integration Owner)

- [ ] Packaged Ecommerce host loads one sidenav: `agentsam-nav` (no legacy `shell.js` rail flash).
- [ ] React Local Studio shell (`AgentSamShell`) uses `@inneranimalmedia/agentsam-nav` Provider + Surfaces.
- [ ] Desktop: rail collapse / resize / peek tooltips; topbar toggle mirrors open state.
- [ ] Mobile (≤767px): drawer navigation; route label hidden; touch targets ≥44px from nav theme.
- [ ] `/samsketch` stays on SamSketch (never 301 → `/admin/cad`).
- [ ] `/cad` and `/admin/cad` open CAD Creator; `/admin/moviemode[/edit]` open MovieMode only.
- [ ] `/media` remains Media Library (open #419); not MovieMode.

## Creative apps — gallery + workspace

| App | Gallery opens | Workspace / project opens | Nav destination |
| --- | --- | --- | --- |
| CAD Creator | [ ] | [ ] | Apps → CAD Creator (`/admin/cad`, `/cad`) |
| SamSketch | [ ] | [ ] | Apps → SamSketch (`/samsketch`) |
| SamSculpt | [ ] | [ ] | Apps → SamSculpt (`/samsculpt`) when included |
| MovieMode | [ ] | [ ] | Apps → MovieMode (`/admin/moviemode`) |

Shared cards: import `@inneranimalmedia/agentsam-workbench/resources` + `resource-card.css`. Use `personality` (`cad` \| `sketch` \| `sculpt` \| `movie`); do not create a second card registry.

## Open GitHub (status only — do not expand Batch 1)

| Issue | State | Note |
| --- | --- | --- |
| [#419](https://github.com/SamPrimeaux/agentsam-sdk/issues/419) Media Library OAuth / IAM_API | OPEN | Blocks authenticated CF gallery acceptance |
| [#418](https://github.com/SamPrimeaux/agentsam-sdk/issues/418) Database Studio | OPEN | Separate lane after media/OAuth |

## CI / release

- `verify:cad-python` on tip `c4bcb7e2` failed: `ty` could not resolve `agentsam_sdk.cad`.
- CAD lane (`feat/cad-creator-batch1-presentation`) adds `extra-paths = ["typings", "../../python"]` in `services/cad/pyproject.toml` — merge that before relying on green `verify` on main.
- Integration must not regress `release-build` / staged `agentsam-nav` assets (`stage-console-host.mjs`).

## Ready for Batch 2 (gate)

1. All four app rows above checked for gallery + workspace open (SamSculpt may ship as scaffold if manifest + route exist).
2. Nav QA matrix green desktop + one mobile breakpoint.
3. Specialists consume shared `ResourceCard` (or thin wrappers) — no four competing registries.
4. Ecommerce miniAgentSam still ships from app-local copy until installed-package swap (documented SSOT).
5. #419/#418 still open is OK for Batch 2 creative polish; do not block Batch 2 on Database Studio.
