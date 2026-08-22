# Backend — identity runtime

Worker-side identity: providers, OAuth finalize, sessions, adapters.

## IAM extraction map (stable production — do not rewrite)

| SDK target | IAM source today | Notes |
|------------|------------------|-------|
| `providers/google/*` | `src/core/auth/providers/google.js` | ✅ ported Sprint 2 |
| `providers/github/*` | `src/core/auth/providers/github.js` | ✅ ported Sprint 2 |
| `oauth/callback.js` | `src/api/oauth-login-callbacks.js` → `finalizeInboundOAuth` | **bulletproof path** |
| `oauth/authorize.js` | `src/api/auth.js` OAuth start handlers | PKCE + state |
| `core/session-service.js` | `src/core/auth.js` | cookie, `createLoginSession`, revoke |
| `core/account-linking.js` | `ensureIdentityPlaneBeforeSession`, `ensureAppUser` | account_identities |
| `adapters/inneranimalmedia/*` | D1 writes in auth side-effects | tenant/workspace stays adapter-only |

## Rule

Move files; **do not** change OAuth behavior until IAM runs parallel proof (existing users, Google/GitHub callbacks, session cookie).

## Public entry

```js
import { createIdentity, GoogleProvider } from '@agentsam/identity';
// resolves to backend/index.js
```
