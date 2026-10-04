        # Stage 04 — Google Desktop OAuth Exchange Internals

        ## Change

        Renamed the two implementation files representing the desktop
        Google OAuth/native handoff lane:

        `apps/local-studio/backend/worker/google-desktop-exchange.js`
        → `apps/local-studio/backend/worker/goaude.js`

        `packages/identity/src/oauth/google-desktop-exchange.js`
        → `packages/identity/src/oauth/goaude.js`

        `goaude` is the compact internal name for the Google OAuth
        desktop/dashboard exchange implementation.

        ## Preserved behavior

        The existing desktop PKCE/native OAuth architecture remains
        unchanged.

        This stage does not rename or redesign:

        - OAuth callback URLs
        - native deep-link protocols
        - PKCE semantics
        - native handoff records
        - IAM session semantics
        - Google provider identity
        - browser-to-native exchange behavior

        ## Tracked references revised

        - `apps/local-studio/backend/worker/goaude.js`
- `apps/local-studio/backend/worker/index.js`
- `apps/local-studio/scripts/google-desktop-exchange.test.mjs`
- `apps/local-studio/scripts/smoke-desktop-auth.mjs`
- `docs/engineering/provider-internal-renames/README.md`
- `package.json`
- `packages/identity/src/index.js`
- `packages/identity/src/oauth/README.md`
- `packages/identity/src/server/worker-router.js`
- `packages/identity/tests/google-desktop-identity-login.test.mjs`
- `packages/identity/tests/oauth-presets-accounts-ssot.test.mjs`

        ## SDK law

        Installed Local Studio remains independently usable. Desktop
        Google OAuth must continue through its existing native/PKCE
        authority rather than depending on a hosted-only Work UI flow.
