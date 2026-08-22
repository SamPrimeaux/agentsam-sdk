# Backend — identity runtime

Worker-side identity: providers, OAuth finalize, sessions, adapters.

## IAM extraction map (stable production — do not rewrite)

| SDK target | IAM source today | Notes |
|------------|------------------|-------|
| `providers/google/*` | `src/core/auth/providers/google.js` | ✅ ported Sprint 2 |
| `providers/github/*` | `src/core/auth/providers/github.js` | ✅ ported Sprint 2 |
| `oauth/callback.js` | `src/core/auth/oauth-finalize.js` → `finalizeInboundOAuth` | **bulletproof path** |
| `oauth/authorize.js` | `src/api/auth.js` OAuth start handlers | PKCE + state — next sprint |
| `core/session-service.js` | `src/core/auth.js` | cookie, `createLoginSession`, revoke |
| `core/account-linking.js` | `ensureIdentityPlaneBeforeSession`, `ensureAppUser` | account_identities |
| `adapters/inneranimalmedia/*` | D1 writes in auth side-effects | tenant/workspace stays adapter-only |

## Rule

Move files; **do not** change OAuth behavior until IAM runs parallel proof (existing users, Google/GitHub callbacks, session cookie).

## Public entry

```js
import { createIdentityClient, GoogleProvider } from '@inneranimalmedia/agentsam-sdk';
import { finalizeInboundOAuth } from '@inneranimalmedia/agentsam-sdk/identity/oauth/callback';
```

`finalizeInboundOAuth` is a contract stub in alpha — wire your Identity Service adapter before production OAuth.
