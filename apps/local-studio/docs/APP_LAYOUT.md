# App layout

Target (not a stuffed `src/` at repo root):

```
app/
  frontend/     TanStack Start + Vite UI (today: still `src/` until cutover script)
  backend/      Cloudflare Workers (vault + LLM proxy stubs)
scripts/        local Ollama workhorse, brand-check, wrangler helpers
docs/
```

## Why `src/` is still at the root tonight

`cursor/mobile-shell-multipage-0362` and `main` diverged on the same Studio files
(add/add). GitHub PR #5 cannot merge until those 13 files are resolved in a
**merge commit** and pushed. This environment can write files through the
GitHub API; it cannot push that merge commit.

After you push the merge (commands in `scripts/finish-mobile-shell-merge.sh`),
run `scripts/restructure-app-layout.sh` to move:

- `src/` → `app/frontend/`
- `public/` → `app/frontend/public/`
- `worker/` → `app/backend/worker/`
- `wrangler*.toml` → `app/backend/`
- `migrations/` → `app/backend/migrations/`

Vite / wrangler paths are updated by the same script.

## Conflict policy

| Path | Keep |
|---|---|
| `scripts/as_workhorse.py` | Cursor branch (full CLI) |
| all `src/components/shell/*` | Cursor mobile-shell |
| `src/lib/work/store.ts` | Cursor |
| `src/routes/_app/*` | Cursor |
| wrangler / D1 / vault worker | existing `wrangler.workmode.toml` |
