        # Stage 03 — Google CLI OAuth Internal Filename

        ## Change

        Renamed:

        `apps/local-studio/backend/worker/google-cli-cloud.js`
        → `apps/local-studio/backend/worker/gclioa.js`

        `gclioa` means **Google CLI OAuth**.

        ## Important boundary

        This stage intentionally does not globally replace the string
        `google-cli-cloud`.

        Any external OAuth route, callback identifier, protocol value,
        persisted value, or API contract retains its existing name.

        Only the implementation filename and module references were
        mechanically revised.

        ## Tracked files rewritten

        - `apps/local-studio/backend/worker/index.js`
- `docs/engineering/provider-internal-renames/README.md`

        ## Auth authority

        This remains the existing Google CLI/cloud OAuth lane. No new
        credential store, identity system, or frontend token transport
        is introduced.
