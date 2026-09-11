# app/backend

Destination for:

- `worker/` (vault Worker + future `/api/llm/*` proxy)
- `wrangler.workmode.toml`
- `migrations/`
- `server/`

Deploy stays:

```
npx wrangler deploy -c app/backend/wrangler.workmode.toml
```

after the restructure script. Until then use repo-root `wrangler.workmode.toml`.
