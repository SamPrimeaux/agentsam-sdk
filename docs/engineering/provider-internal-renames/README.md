# Provider Internal Rename Lane

Branch: `feat/work-suite-graduation-20261003`

## Purpose

This lane performs mechanical internal path cleanup before the
Work Suite graduation begins.

It intentionally separates internal implementation names from
externally meaningful provider identities.

## Planned internal names

| Existing path | Internal path |
| --- | --- |
| `packages/connectors/cfoa/` | `packages/connectors/cfoa/` |
| `apps/local-studio/backend/worker/gclioa.js` | `apps/local-studio/backend/worker/gclioa.js` |
| `apps/local-studio/backend/worker/google-desktop-exchange.js` | `apps/local-studio/backend/worker/goaude.js` |
| `packages/identity/src/oauth/google-desktop-exchange.js` | `packages/identity/src/oauth/goaude.js` |
| `packages/agentsam-content/src/providers/google-drive.ts` | `packages/agentsam-content/src/providers/gdrv.ts` |

Mnemonics:

- `cfoa` = Cloudflare OAuth
- `gclioa` = Google CLI OAuth
- `goaude` = Google OAuth desktop/dashboard exchange
- `gdrv` = Google Drive provider implementation

## Hard boundaries

These changes MUST NOT rename external/runtime contracts merely
because their names contain Google or Cloudflare.

Preserve:

- provider IDs such as `cloudflare`
- provider IDs such as `google`
- source IDs such as `google-drive`
- R2 / D1 capability identifiers
- OAuth callback URLs
- API route URLs
- Google API URLs
- Cloudflare API URLs
- environment-variable names
- persisted provider/database values
- public SDK package names and APIs unless separately approved

## Authentication authority

This rename is not an authentication redesign.

Existing authorities remain authoritative:

- hosted Google OAuth
- Google desktop / installed-app PKCE
- Google CLI/cloud OAuth
- Cloudflare OAuth
- Local Studio hosted identity/session infrastructure
- Local Studio desktop native identity/session infrastructure
- provider capability grants and persisted connection records

UI packages must never become credential stores.

`@inneranimalmedia/agentsam-work` consumes capability-bearing host
adapters. It does not own Google or Cloudflare authentication.

## Change sequence

01. Establish clean worktree and trace documentation.
02. Rename Cloudflare connector implementation directory.
03. Rename Google CLI OAuth implementation file.
04. Rename Google desktop OAuth exchange implementation files.
05. Rename Google Drive provider implementation file.
06. Run contract/reference verification and tests.

Feature work begins only after this mechanical lane is green.
