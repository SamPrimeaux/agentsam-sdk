        # Runtime Environment Contract

        Schema: `agentsam.runtime-environment-contract.v1`

        Status: **APPROVED / PROTECTED**

        ## Meaning of "safe"

        These runtime bindings are known-good parts of the existing
        AgentSam / Local Studio environment contract.

        "Safe" means:

        - preserve the binding name
        - preserve its existing environment value
        - preserve Variable vs Secret classification
        - allow existing Production / Previews / Base wiring to continue
        - do not reinterpret the name during internal provider refactors

        It does **not** mean secret values are public.

        Secret values must remain encrypted and must never be written into
        this repository, logs, frontend state, query parameters, generated
        documentation, test snapshots, or Git diffs.

        ## Approved runtime variables

        - `CLOUDFLARE_ACCOUNT_ID`
- `GITHUB_APP_ID`
- `GITHUB_CLIENT_ID`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_DESKTOP_CLIENT_ID`
- `IAM_CLIENT_ID`
- `IAM_OAUTH_ISSUER`

        ## Approved runtime secrets

        - `AGENTSAM_API_KEY`
- `AGENTSAM_BRIDGE_KEY`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_BREAK_GLASS_ADMIN_TOKEN`
- `CLOUDFLARE_OAUTH_CLIENT_ID`
- `CURSOR_API_KEY`
- `GEMINI_API_KEY`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_WEBHOOK_SECRET`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_DESKTOP_CLIENT_SECRET`
- `IAM_CLIENT_SECRET`
- `OPENAI_API_KEY`
- `VAULT_MASTER_KEY`

        ## Refactor protection

        Internal provider abbreviations are implementation-path vocabulary:

        - `cfoa`
        - `gclioa`
        - `goaude`
        - `gdrv`

        They MUST NOT cause environment variables such as:

        - `CLOUDFLARE_ACCOUNT_ID`
        - `CLOUDFLARE_API_TOKEN`
        - `CLOUDFLARE_OAUTH_CLIENT_ID`
        - `GOOGLE_CLIENT_ID`
        - `GOOGLE_CLIENT_SECRET`
        - `GOOGLE_DESKTOP_CLIENT_ID`
        - `GOOGLE_DESKTOP_CLIENT_SECRET`

        to be renamed.

        Environment-variable names are runtime contracts, not implementation
        filenames.

        ## Existing `.env` / deployment behavior

        Preserve the working runtime environment pattern.

        This lane does not require moving, deleting, rotating, renaming, or
        changing the values of these bindings.

        Environment-specific values remain managed by their existing runtime
        environment / secret-management authority.

        ## OAuth boundary

        Provider implementation-file cleanup does not redesign authentication.

        Existing Google, Google Desktop, Cloudflare, IAM, GitHub, AgentSam,
        bridge, Vault, and model-provider credentials retain their current
        runtime authority.

        Portable UI packages must consume server/native capability adapters.
        They must not ingest these secrets directly.

        ## Environments

        Approved contract scopes:

        - Production
        - Previews
        - Base

        A later deployment hardening pass may intentionally vary whether a
        particular credential is populated in each environment, but that is
        separate from this mechanical rename lane.

        ## Values

        Actual runtime values are intentionally omitted from this document.

        The repository records the contract, not the credentials.
