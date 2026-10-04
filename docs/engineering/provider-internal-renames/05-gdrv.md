        # Stage 05 — Google Drive Provider Internal Filename

        ## Change

        Renamed:

        `packages/agentsam-content/src/providers/google-drive.ts`
        → `packages/agentsam-content/src/providers/gdrv.ts`

        `gdrv` is only the implementation filename.

        ## Runtime identity remains unchanged

        The provider/source identifier remains:

        `google-drive`

        This matters because Work routing, library metadata, provider
        registries, persisted records, capability resolution, analytics,
        and external integrations may depend on that stable semantic ID.

        ## Tracked module/path references revised

        - `docs/engineering/provider-internal-renames/README.md`
- `packages/agentsam-content/src/providers/index.ts`

        ## Future Work integration

        The Work product should consume this provider through the
        `agentsam-content` contract.

        Work must not directly acquire Google OAuth credentials or keep
        provider tokens in React/frontend state.
