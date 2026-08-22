# Legendary-OS — @agentsam/identity customer proof

Target: fresh install path (Phase 7).

## Day 1

```bash
npm install @agentsam/identity
npx agentsam identity init --adapter cloudflare-d1
```

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
