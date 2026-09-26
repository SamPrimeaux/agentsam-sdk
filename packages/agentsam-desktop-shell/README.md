# AgentSam desktop shell

Tauri multi-brand shell. **Local Studio** is the primary product install.

## What you open when you launch the .app

| Flag | Meaning |
|---|---|
| `offline_shell: true` | Window loads **bundled** `packages/agentsam-desktop-shell/dist/` (not the hosted URL). |
| `agentsamd_sidecar: true` | Shell supervises local `agentsamd` (probe → spawn → handshake). |

**Target:** `dist/` = production build of **`apps/local-studio`** (Chat/Work/Monaco/xterm). That is the same product as `agentsam.inneranimalmedia.com/agentsam`, shipped inside the `.app` so it works offline.

**Today if sync has not run:** `dist/index.html` is a thin boot/status page only — **not** full Studio. Always run sync before shipping an installable:

```bash
# agentsam-sdk only (not inneranimalmedia)
cd apps/local-studio && npm run build
cd ../../packages/agentsam-desktop-shell
npm run sync:local-studio   # copies Local Studio → dist/
npm run build               # brand + sync + tauri build
```

`feature_flags.offline_shell` and `agentsamd_sidecar` are **true** for Local Studio — do not flip them false; the desktop app is the proving ground for offline + agentsamd + LSP.

## Auth

`IAM_CLIENT_ID=iam_agentsam_sdk_web` (same as CLI). Identity stays on IAM; this package lives in **agentsam-sdk**.

## Brands

```bash
npm run build:brand -- local-studio
npm run build:brand -- cad-creator
```
