# Plan of action — CLI cutover + Local Studio desktop = apps/local-studio

**Status:** active · 2026-09-25  
**Shipped tonight:** `58fddae` (SAM/codebaseindex WIP) · Local Studio Worker `c62a7350` on `agentsam.inneranimalmedia.com`  
**Desktop note:** installed `.app` still needs a Tauri rebuild to pick up `launch_path: /agentsam`

---

## A. Finish CLI / SAM machine revisions

1. **Catalog owns dispatch** — migrate remaining `cli.js` if/else handlers into `src/cli/dispatch.js` lazy loaders; shrink `cli.js` to bootstrap + resolve + dispatch + errors.
2. **Delete legacy help authority** — remove `printLegacyHelp()`; help/overview only from `CLI_COMMAND_CATALOG`.
3. **Per-command skill law** — every machine command declares `skill` or explicit exemption; human tip on stderr; `--json` stays clean (`help.skill` in envelope when graduated).
4. **`--format pretty|json|jsonl`** — normalize machine output; keep `--json` alias.
5. **Shared material resolver** — promote `src/lib/ingest/materials.js` for brand/cad/security; archive sandbox limits + tests.
6. **Embedding dims are per-provider profile fingerprints** — not Ollama SSOT. Ollama is an *optional* local offer only. When CF credentials are present, Workers AI **Text Embeddings** models must appear in the ingest pool (chat allowlist must not hide them) so Vectorize lanes work from the same account model pool. Prefer adapter/probe length when available; name heuristics are hints only.
7. **Storage lanes object** — `metadata` vs `vectors` in knowledge config (local / supabase / vectorize presets).
8. **`agentsam app options`** — discover `apps/*/`, theme packages, manifests (kill hardcoded init menus).
9. **Graduate ops** — `brand.preview`, BrandPack export/import; keep scan read-only.
10. **Skills + tools registry parity** — portable `skills/catalog.json` ↔ D1 `agentsam_skill`; filesystem/AST/DAG tools in `agentsam_tools` schema+seed so new users get the same inspection surface as the IAM host. No stale skills.
11. **Tests from sprint §31** — catalog help, JSON tips absent, inventory-before-scope, profile mismatch, archive fixtures, CF embed discovery.

## B. Installed AgentSam Local Studio = apps/local-studio experience

### Product surfaces (locked)

| Surface | URL | Role |
|---------|-----|------|
| PUBLIC | `/` | Marketing — never desktop home |
| IDENTITY | `/auth/login` | Real portal (email + OAuth) |
| PRODUCT | `/agentsam` | Local Studio / Workbench (`apps/local-studio`) |

### Desktop chain

```text
AgentSam Local Studio.app  (Tauri · agentsam-desktop-shell)
        │
        ▼  launch_url
https://agentsam.inneranimalmedia.com/agentsam
        │
        ▼  session check (server-authoritative)
   ┌────┴────┐
valid      missing
   │          │
   ▼          ▼
Workbench   /auth/login?next=/agentsam
              │
              ▼ success
           /agentsam
```

### Steps

1. **Rebuild desktop** (picks up manifest `/agentsam`):
   ```bash
   cd packages/agentsam-desktop-shell
   node scripts/build-brand.mjs local-studio
   npm run build   # or: npx tauri build  after build-brand
   ```
   Install/replace `/Applications/AgentSam Local Studio.app` from the new `.app`/DMG.

2. **Auth adapter (tiny)** — session status → begin login → deep-link `agentsamstudio://callback` → logout. No Tauri auth DB; reuse `packages/identity` + same-origin cookies for email/password.

3. **Gate `/agentsam`** — unauthenticated users always land on `/auth/login?next=/agentsam`; never fall back to `/`.

4. **Logged-in dashboard UX** — audit Workbench routes under `apps/local-studio/frontend/src/routes/(apps)/agentsam*` (Chat/Work/Browser/terminal); fix any deep-link that returns to marketing home.

5. **Native affordances** — tray, keychain (session/account state only — not raw API keys in webview), updater later, local-node enrollment when agentsamd lands.

6. **Parity QA checklist**
   - Cold launch → `/agentsam` (or login), never homepage
   - Email login → return `/agentsam`
   - OAuth (Google/GitHub/CF) → deep link → `/agentsam`
   - Logout → identity, re-open app → login again
   - Hosted browser vs installed app show same Workbench build (Worker version)

7. **Later** — bundle Local Studio assets offline + agentsamd IPC; keep same route/auth contract.

## C. Order of attack (recommended)

| # | Work | Outcome |
|---|------|---------|
| 1 | Tauri rebuild `local-studio` + reinstall | Installed app opens `/agentsam` |
| 2 | Session gate + login next= | Login ↔ Workbench loop solid |
| 3 | CLI catalog cutover (dispatch) | No dual truth in `cli.js` |
| 4 | Material + format + app options | Machine CLI usable without LLM |
| 5 | brand.preview + BrandPack | Brand product path |
| 6 | agentsamd + bundled UI | Desktop = workstation, not wrapper |

---

## Proof already live

- Git: `58fddae` on `main`
- Worker: `agentsam-sdk` version `c62a7350-f68d-40cb-9a45-a4fe5b3d48f5`
- `GET /agentsam` → 200 · `GET /auth/login` → 200
