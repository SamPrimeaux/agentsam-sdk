# @agentsam/identity

**AgentSam SDK package #1** — portable identity infrastructure.

| App | Role |
|-----|------|
| **InnerAnimalMedia** | Reference implementation (`adapters/inneranimalmedia`) |
| **Legendary-OS** | Fresh customer proof (`examples/legendary-os`) |

## Install (after npm publish)

```bash
npm install @agentsam/identity
```

## Quick start

```js
import {
  createIdentity,
  GoogleProvider,
  GithubProvider,
} from '@agentsam/identity';

const identity = createIdentity({
  providers: [GoogleProvider, GithubProvider],
  storage: { adapter: 'cloudflare-d1', binding: 'DB' },
  session: { cookie: 'agentsam_session' },
});
```

## Layout

```
src/
  contracts/     # NormalizedExternalIdentity, session contracts
  providers/     # google, github, gcp, email
  provider-contract.js
  index.js       # createIdentity()
adapters/
  inneranimalmedia/   # IAM D1 mapping (Sprint 5)
  cloudflare-d1/      # generic D1 adapter (Sprint 5)
frontend/auth-portal/ # login/signup/recover kit (Sprint 5)
examples/
  legendary-os/       # customer Day-1 proof
```

## Plan

Full productization: `inneranimalmedia/plans/active/AGENTSAM-IDENTITY-SDK-PRODUCTIZATION-2026-08.md`

## npm org note

Target publish name: `@agentsam/identity`. If the `@agentsam` org is not provisioned yet, first publish may use `@inneranimalmedia/agentsam-identity` — see plan Phase 8.

## Dual-home

Canonical source: **this repo** (`agentsam-sdk/packages/identity`).

IAM monorepo `packages/agentsam-identity/` is a staging mirror until `identity-v0.1.0` tags.
