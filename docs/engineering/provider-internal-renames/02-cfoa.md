        # Stage 02 — Cloudflare OAuth Internal Directory

        ## Change

        Renamed:

        `packages/connectors/cloudflare/`
        → `packages/connectors/cfoa/`

        `cfoa` means **Cloudflare OAuth**.

        ## Scope

        This stage changes implementation filesystem naming only.

        It does **not** rename:

        - runtime provider ID `cloudflare`
        - Cloudflare OAuth routes
        - Cloudflare API URLs
        - environment variables
        - D1/R2 scope strings
        - D1/R2 provider IDs
        - persisted connection/provider values
        - public package names

        ## Rewritten tracked references

        - `apps/agentsamd/agentsam.package.json`
- `apps/local-studio/backend/worker/cloudflare-code-mode.js`
- `apps/local-studio/backend/worker/connections-registry.js`
- `apps/local-studio/backend/worker/database-service.js`
- `apps/local-studio/backend/worker/index.js`
- `apps/local-studio/backend/worker/plugin-registry.js`
- `apps/local-studio/package-lock.json`
- `docs/SOURCE_ARCHITECTURE.md`
- `docs/engineering/provider-internal-renames/README.md`
- `package-lock.json`
- `package.json`
- `packages/agentsam-knowledge/src/backends/index.js`
- `packages/connectors/cfoa/package.json`
- `packages/identity/src/oauth/credentials.js`
- `scripts/verify-package.mjs`
- `src/commands/cloudflare-login.js`
- `src/commands/cloudflare.js`
- `src/commands/connections.js`
- `src/lib/deploy/local-studio.js`
- `src/lib/whoami-capabilities.js`
- `src/mcp/cloudflare-bundles.js`
- `test/cloudflare-connector.test.mjs`
- `test/local-studio-deploy.test.mjs`

        ## Architecture

        Cloudflare authentication remains a host/provider authority.
        Portable Work/content UI packages consume capability-bearing
        adapters and must not own OAuth tokens themselves.
