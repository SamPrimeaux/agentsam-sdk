# @inneranimalmedia/agentsam-ide

Publishable IDE building blocks for AgentSam Local Studio / desktop.

| Export | Role |
|---|---|
| `@inneranimalmedia/agentsam-ide/monaco` | Document model + languageId from path |
| `@inneranimalmedia/agentsam-ide/filetree` | Collapsible tree (dirs closed by default) |
| `@inneranimalmedia/agentsam-ide/terminal` | Boot banner + agentsamd health probe |
| `@inneranimalmedia/agentsam-ide/lsp` | Language capability SSOT + handshake |
| `@inneranimalmedia/agentsam-ide/onboarding` | First-login CLI tutorial (one prompt at a time) |

Plan: `docs/plans/LOCAL-STUDIO-GRADUATION-2026-09-26.md`  
Brand: `docs/brand/AGENT_SAM_ICON_GRAMMAR.md`  
Auth: `IAM_CLIENT_ID=iam_agentsam_sdk_web`

```bash
cd packages/agentsam-ide && npm test
```
