# SamSpeaks

Guided voice, lighting and camera direction studio. Part of the creative agentic department
alongside SamSketch and SamSculpt (CAD family).

Imported verbatim from `SamPrimeaux/SamSpeaks` @ `edea42c7` via `scripts/ingest-app-zips.py`
(see `IMPORT_PROVENANCE.json`). Source preserved; normalization is tracked in the ledger below.

## Run

```sh
cd apps/samspeaks
npm ci
PORT=3210 npm run dev     # Node >= 22.18 (runs server.ts directly); set PORT explicitly
npm run lint              # tsc --noEmit
```

Voice/TTS needs `GEMINI_API_KEY` in the server environment (declared in `agentsam.app.json`
under `secrets.server_only`). Moving it to the vault is Slice 2.

## Boundary (enforced, not advisory)

This app is its own workspace root. It must not import from another app, and nothing outside
`apps/` may import from it. Shared code leaves only through `packages/*`.
`npm run app:boundaries` enforces this repo-wide in CI; SamSpeaks has zero baselined violations.

## Mining ledger

Rule: a piece leaves this app only when a second app needs it.

| Source (SamSpeaks @ edea42c) | Destination | Status |
| --- | --- | --- |
| `bun.lock` | `package-lock.json` (app-owned npm lockfile) | done |
| `public/assets/aistudio/` (3 unreferenced screenshots, 8.9 MB) | dropped at import; originals remain in the standalone repo | done |
| `StudioDeckCard.ts`, `VoiceStudioCard.ts`, Creativity Flow Canvas in `StudioApp.ts` | shared creative `packages/agentsam-*` (generic name) | Slice 1 |
| `src/index.css` (baked colors) | theme tokens | with Slice 1 |
| `src/web/MiniAgentSam.ts` | replaced by the shared composer | Slice 1 or 2 |
| `server.ts` (Express, `GEMINI_API_KEY` env) | Worker / agentsamd route + vault BYOK | Slice 2 |
| `ttsService.ts`, `audioEngine.ts`, `studio/cameraDirector.ts` | voice and direction layer | Slice 2 |
| `studio/sculptBrush.ts` | SamSculpt seed | Slice 3 |
| `studio/environment.ts`, `scenery.ts`, `subjects.ts`, `materials.ts`, `textures.ts` | consume `agentsam-3d-viewer` instead of a private scene | shared textures, 5 atmosphere presets, 5 studio finishes, 2 additional PBR recipes, and brush tube geometry consumed from the viewer package; XR lifecycle and branded scenery remain local |

Known gaps: `runtime.cloudflare` is `unsupported` until `server.ts` is replaced (Slice 2).
Vite HMR uses a fixed port (24678), so two instances at once collide.
