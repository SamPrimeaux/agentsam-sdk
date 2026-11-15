# Agent Sam Design Canvas

Dark-first interface tokens and components for the Agent Sam workspace and its design canvas, with a light twin. Built from the Inner Animal Media prototype: global shell, thread header, details panel, canvas toolbar, agent actions and connector rows.

Two themes ship in one token file. Set `data-theme` on the root element to the theme id.

| Theme id | Name | Use |
| --- | --- | --- |
| `theme-agentsam-design-canvas-dev` | Dev dark | Default. Charcoal neutrals, green for the app, the primary action and the agent. |
| `theme-agentsam-design-canvas-light` | Light | White surfaces, blue primary actions, purple agent. The app icon stays green. |

## Content fundamentals

- Write like a calm colleague: short, direct, present tense. "Connect tools so Agent Sam can build, manage your store, and design on your behalf."
- The assistant is **Agent Sam** in prose and **AgentSam** where a product name is one word (composer placeholder "Work with AgentSam", disclaimer "AgentSam is AI and can make mistakes. Please double-check responses."). Never "the bot", never another vendor's assistant name.
- Sentence case everywhere: "New thread", "Turn into skill", "Version history".
- Buttons are verbs: Connect, Publish, Submit, Dismiss. Menus name the action, not the object: "Rename", not "Rename thread".
- No developer text in the UI: no key paths, field keys or "not wired yet". An empty area ships a working default.
- No "coming soon". A feature that is scaffolded appears as a normal row (for example the design connector) with the same controls as the others.
- No emoji. Numbers carry their unit: "1280px", "2 minutes ago".

## Visual foundations

**Color roles.** Every color is a role token; no component uses a raw hex.

- Ground and surfaces: `bg` (behind everything), `chrome` (header, sidenav, side panels), `surface` (cards, menus, assistant bubbles), `surface-2` (hover, chips), `input` (composer, fields), `canvas` and `canvas-dot` (the design canvas and its 16px dot grid).
- Text: `text`, `text-muted`, `text-faint`. Faint is for captions and placeholders only.
- Lines: `line` for hairlines, `line-strong` for outline buttons.
- Brand: `brand` is the Agent Sam app color. It is the app icon, the brand mark and the success color, and it has the same value in both themes. `brand-text`, `brand-tint`, `brand-line` are its text, quiet fill and border forms.
- Action: `action` is the primary button. Dev: green. Light: blue. `link`, `focus`, `select-tint` and `select-line` follow it.
- Agent: `agent` marks everything the agent does: its avatar, the pill that follows its cursor, step highlights, the send button. Dev: green. Light: purple.
- `danger` is only for destructive menu items and errors. `scrim` sits behind overlays.

**Type.** One family, Inter, plus a system mono for ids and file names. Chat text is 15/22, UI text 14/20, captions 12/16. Titles use weight 500 with slight negative tracking; there is no bold above 500.

**Space and shape.** 4px base: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Radii: 8 for icon tiles, 12 for toolbar buttons, fields and menu items, 16 for menus and cards, 20 for the composer, 28 for modal shells, pill for primary buttons, chips and agent action pills. Every control is at least 44px tall.

**Elevation.** Menus use `shadow-menu` plus a `line` border. Side panels that overlay on narrow screens use `shadow-panel`. Nothing else has a shadow.

**Shell anatomy.** A 56px global header runs across the top: sidenav toggle at the far left, the editable thread name and its dropdown arrow next to it, the details-panel toggle at the far right. Below it: sidenav (260px), main column (chat column up to 760px), details panel (328px). Under 1000px the details panel overlays; under 760px the sidenav does too.

**Canvas editor anatomy.** The canvas sits on `canvas` with a dot grid. The top toolbar floats on it: file menu and tools at the left, "Jump to..." search in the middle, screen-size menu, play and Publish at the right. The agent panel is on the right. While the agent works, a pill in `agent` follows its cursor over the artboard it is touching.

**Motion.** None in the system. State changes are instant.

## Iconography

Inline SVG on a 24px grid, 1.6px stroke, round caps and joins, `currentColor`. Icons never carry meaning by color alone. Two custom marks:

- **Artifact icon** (green): two overlapping rounded squares with a short bar, drawn in `brand-text` on a `brand-tint` tile with a `brand-line` border, 32px tile, 8px radius. Used for published artifacts in Outputs.
- **Agent mark**: a four-point spark. Its tile is `brand` in the dev theme and `agent` (purple) in the light theme.

Provider logos in connector rows use the provider's real mark on a neutral tile. Where a provider has no mark yet (for example `agentsam-design-dr`), use the custom line icon on the `surface` tile with `brand-text` stroke.

## Components

| Component | What it is |
| --- | --- |
| Button | Primary, outline, quiet, and icon buttons. |
| Menu | The thread menu and the model menu: rows, shortcuts, dividers, submenu arrows, a danger row. |
| ShellHeader | Global header with sidenav toggle, editable thread name, dropdown arrow and panel toggle. |
| CanvasToolbar | File menu, select and hand tools, Jump to search, screen-size menu, play, Publish. |
| AgentAction | Cursor label pill and the step list under it. |
| ConnectorCard | Suggested connectors, with connect toggle states. |
| Composer | Attachments, input, mode, model, dictate and send, with the disclaimer line under it. |

## Usage rules

1. Reference tokens by name (`var(--surface)`), never by value. Both themes must work from the same markup.
2. One primary action per region. In the light theme it is blue; do not use purple for buttons, purple is the agent.
3. Green means the app (icon, success, connected). In the light theme do not use green for primary buttons.
4. Text on `surface-2`, `input` or `canvas` uses `text` or `text-muted`. `text-faint` is for `bg` and `chrome`.
5. Disabled or unwired controls are never hidden; ship them working.
6. Menus close on outside click and on choosing an item; the trigger shows `aria-expanded`.

## Contrast notes

- White on `brand` is 4.6:1; white on light `action` 5.5:1; white on light `agent` 5.5:1.
- `text-faint` on dev `surface` is 4.4:1. Flagged: use only for repeated 12px captions there.
- Light `brand` text on `brand-tint` is 4.1:1, so green text on the tint uses `brand-text` (4.7:1).
- Focus rings are 3:1 or better on `bg` and `surface` in both themes.


## Replacing the old miniAgentSam and Side Assistant

One token family drives every assistant surface; nothing gets a palette of its own. The account shell's theme supplies the semantic values and the assistant packs resolve them into component roles. Compact, docked, expanded, fullscreen, working and selected are variants or states, never separate themes. A storefront preview keeps its own site-scoped tokens.

| Pack | Token prefix | Covers |
| --- | --- | --- |
| Foundations | `color`, `space-*`, `radius-*`, `shadow-*`, `size` | Primitives: color roles, type, spacing, radii, shadows |
| Semantic UI | `semantic-*` | Surface, text, border, accent, action: the names old code maps to |
| AgentSam Shared | `assistant-shared-*` | Brand mark, composer send, control hover, mode accents |
| miniAgentSam | `assistant-mini-*` | Container, outline, breadcrumb, scope, hints, status |
| Side Assistant | `assistant-side-*` | Panel, header, thread, composer, resize, activity |
| Agent Workspace | `assistant-workspace-*` | Fullscreen canvas |
| Editor Integration | `editor-assistant-*` | Target outline and tint, overlay |
| Interaction States | `state-*` | Working, success, error, listening, selected |
| Responsive Behavior | `layout-assistant-*` | Side width, min, max, mini width, resize handle, mobile safe area |
| Companions | `companion-*` | Icon, avatar and portrait sizes; art stays in each character package |

**Swap in three steps.**

1. Load `export/tokens.css` once at the app root, then `export/legacy-aliases.css`. Old names such as `--mini-surface` and `--composer-send-bg` now resolve to the new tokens, so nothing breaks while you migrate.
2. Run `python3 export/migrate-assistant-tokens.py <path> --write` on a clean git tree to rename the old identifiers in source. Review the diff; git is the backup. Dist and mirrored build folders are skipped, so rebuild them.
3. Delete lines from `legacy-aliases.css` as references reach zero. When the file is empty, remove it.

`export/legacy-map.json` is the single source for both the aliases and the script. The composer modes (agent, plan, debug, ask, multitask) set `--assistant-shared-composer-mode-accent` and its strong pair through `data-composer-mode`, which is how `shell.css` already switches them. Strong fills keep at least 4.5:1 against white in both themes; mode accents keep at least 5:1 on `surface`.

Some legacy names (`--nav-*`, `--agentsam-mark-color`) were mapped from how `shell.css` uses them rather than from a stated contract. Check those against the product before you delete the aliases.

## Companions

Characters (Geaux, Meaux, Coder, Architect, Engineer, Py) are identity, not an assistant interface. Their art, manifest and animation timing stay in each versioned package and are never redrawn here. Presentation sizes come from `companion-icon` (64), `companion-avatar` (128) and `companion-portrait` (256). Three settings stay separate: the brand character for an app or campaign, the companion a person chooses, and where companions may appear, including off. Reduced motion swaps the animation for the static avatar.
