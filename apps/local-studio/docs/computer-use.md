# Computer use + managed environments

Studio fullscreen (header maximize) keeps the composer docked so an agent can take over the visible surface.

## Providers (adapter list)

| Provider | What it is | Who executes actions |
|---|---|---|
| Google Antigravity | Managed Linux sandbox, reuse `environment_id` | Google |
| Gemini Computer Use | Screenshot + click/type loop (browser/mobile/desktop) | Client (Playwright / tunnel) |
| OpenAI Computer Use | CUA tool loop | Client |
| Anthropic Computer Use | Claude computer tool | Client |
| Local Playwright | Chromium on the iMac | Desk |
| AgentSam desk | `agentsam_terminal_local` + existing tunnel | Desk |

Keys stay in vault / `.env`. The UI Worker never hosts model weights.

Contract: `app/frontend/src/lib/work/computer-use.ts`
