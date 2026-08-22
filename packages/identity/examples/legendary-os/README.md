# Legendary-OS — identity customer proof

Target: fresh install path (Phase 7).

## Day 1 (alpha — preview + contracts)

```bash
npm install @inneranimalmedia/agentsam-sdk@alpha
npx agentsam identity preview --open
```

Verify `/auth/login`, `/auth/signup`, `/auth/reset` match expectations before wiring Worker routes.

Preview login: `preview@example.com` / `preview` (globe exit demo).

```js
import { createIdentityClient, GoogleProvider } from '@inneranimalmedia/agentsam-sdk';

const identity = createIdentityClient({
  providers: [GoogleProvider],
  portal: { brand: { name: 'Legendary OS', logoUrl: '/logo.svg' } },
});
```

`agentsam identity init` (D1 scaffold) lands Phase 5 — not in alpha CLI yet.

## Day 2 proof checklist

- [ ] Email signup → session cookie
- [ ] Email login
- [ ] Logout clears session
- [ ] Google OAuth round-trip
- [ ] GitHub OAuth round-trip

## Day 3

- [ ] Workspace creation on first login
- [ ] Dashboard requires auth

Record curl transcripts and D1 row counts in `PROOF.md` when complete.

See: `inneranimalmedia/plans/active/AGENTSAM-IDENTITY-SDK-PRODUCTIZATION-2026-08.md`
