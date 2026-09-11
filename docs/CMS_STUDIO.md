# AgentSam CMS Studio architecture

The SDK treats CMS authoring and the public website as separate deployment products that share publication contracts.

```text
apps/client-cms-editor/                 authenticated authoring/control app
        │
        ├─ pages / sections / themes / assets
        ├─ AgentSam workbench
        ├─ preview
        └─ publish
                ↓
        structured publication snapshot
             ┌──┴──┐
             │     │
            D1     R2 WEBSITE_ASSETS
        metadata   content/media/theme artifacts
             │     │
             └──┬──┘
                ↓
        small public CMS runtime
```

The public runtime must not inherit the full authoring dependency graph. Monaco, terminal, browser automation, authenticated admin UI, and the AgentSam workbench stay in the authoring application unless a public feature explicitly requires them.

## Shared AgentSam platform

CMS consumes `@inneranimalmedia/agentsam-contracts` and `@inneranimalmedia/agentsam-workbench`, the same product-neutral layer proven first by Local Studio. `CmsAgentSurface` supplies explicit CMS context to the shared `AgentWorkbenchAdapter`; it does not scrape editor state or invent a CMS-specific chat transport.

Identity is resolved before AgentSam execution:

```text
IAM
 ↓
authenticated principal (accountId + authUserId)
 ↓
application authorization
 ↓
CMS context / capabilities
 ↓
optional browser or container runtime
```

`SESSION_CACHE` is an optional cache only. `MY_CONTAINER` and `MYBROWSER` are execution infrastructure only. None may become identity/session authority.

## Cloudflare capability contract

Baseline `cms-cloud` requires `DB` and `WEBSITE_ASSETS`. Other bindings are capability-driven:

- `iam` → `IAM_CLIENT_ID`, `IAM_CLIENT_SECRET`, `IAM_ORIGIN`
- `workers-ai` → `AGENTSAM_WAI`
- `browser` → `MYBROWSER`
- `container` → `MY_CONTAINER`
- `encrypted-secrets` → `SECRETS_ENCRYPTION_KEY`
- `acp` → `ACP_CLIENT_ID`, `ACP_CLIENT_SECRET`

`IAM_ORIGIN` means the canonical IAM issuer/auth service. It must not silently mean the current website origin.

## Routes

The intended ownership boundary is:

```text
/*                    public CMS
/auth/*                identity
/dashboard/*           authenticated application
/dashboard/agentsam    authenticated AgentSam product
/dashboard/cms         authenticated CMS Studio
/api/public/*          visitor-safe CMS APIs
/api/auth/*            identity/session
/api/cms/*             authenticated editor/publishing APIs
/api/agentsam/*        authenticated AgentSam APIs
```

## Publication data

Prefer versioned structured sections such as:

```json
{
  "publicationId": "pub_example",
  "route": "/about",
  "revision": 18,
  "theme": "iam-classy",
  "sections": [
    {
      "type": "hero",
      "props": {
        "title": "About us",
        "imageAsset": "asset_example"
      }
    }
  ]
}
```

The renderer may produce sanitized HTML/static snapshots from this data. Arbitrary executable HTML from the editor is not the public-content authority.

## Current server authority

The imported app contains only the portable CMS API/routing/preview bridge. The current full CMS domain remains in `inneranimalmedia/src/core/agentsam/cms/` at the import provenance revision. The next server-side extraction should create reusable `packages/agentsam-cms-*` packages rather than copy that domain into this app.
