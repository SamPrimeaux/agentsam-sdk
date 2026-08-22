# Legendary-OS — identity customer proof

Target: fresh install path (Phase 7).

## Day 1 (alpha — scaffold + preview)

```bash
npm install @inneranimalmedia/agentsam-sdk@alpha
npx agentsam identity init --name legendary-os --brand "Legendary OS"
cd legendary-os
npm install
npx wrangler d1 create legendary-os
# paste database_id into wrangler.toml
npm run db:migrate:local
npm run dev
```

Or preview portal only before init:

```bash
npx agentsam identity preview --open
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
