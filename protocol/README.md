# agentsam-sdk protocol (LOCKED)

Canonical copy also lives in the platform monorepo:
`inneranimalmedia/agentsam-sdk/protocol/`.

Every Agent Sam **tool / feature SDK surface** is dual-homed:

| Home | Role |
|------|------|
| `inneranimalmedia/agentsam-sdk/` | Build + platform deploy |
| This repo → npm `@inneranimalmedia/agentsam-sdk` | Published CLI / consumer SDK |

**Rules:** author once → land in **both** repos; shared contracts/CLI/JSON;
npm publish is **manual** (operator); no “audits only belong in IAM” split.
Full checklist: keep `dual-repo-sync.md` mirrored from the monorepo when it
changes. Inspiration for code-intel ports: IAM `src/core/code-indexer.js` +
AST-RAG skill (see IAM plan
`plans/active/CLAUDE-AGENTSAM-SDK-CODE-INTEL-CATCHUP-2026-08.md`).
