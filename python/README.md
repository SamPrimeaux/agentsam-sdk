# Python audit toolkit — wrong tree

**Do not develop portable D1/repository audits here.**

Canonical package (PR [#74](https://github.com/SamPrimeaux/inneranimalmedia/pull/74) on
`feat/agentsam-sdk-d1-audit-port` → `feature/agentsam-sdk-scaffold`):

```
inneranimalmedia/agentsam-sdk/agentsam_sdk/
```

Including:

- `agentsam_sdk.data.d1_bloat`
- `agentsam_sdk.data.agentsam_walk`
- `agentsam_sdk.repository.inventory` (full category + size scan; jq-friendly)
- Host tooling: `agentsam-sdk/docs/tooling.md` (`jq`, wrangler, env checks)

This npm repo (`@inneranimalmedia/agentsam-sdk`) remains the **JS** CLI / scaffold.
Any `python/` tree that briefly landed on `main` here was a mis-route — prefer the
in-monorepo package above.
