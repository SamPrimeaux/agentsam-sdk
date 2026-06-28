# Developing agentsam-sdk with Inner Animal Media

## Local smoke test

```bash
cd agentsam-sdk
npm test
```

## Link into a scaffolded project

```bash
cd agentsam-sdk && npm link
cd /path/to/your-project && npm link @inneranimalmedia/agentsam-sdk
npm run dev
```

## Link into inneranimalmedia (monorepo-style)

From the platform repo:

```bash
cd inneranimalmedia
npm link ../agentsam-sdk
```

Then in any Worker or script:

```js
import { AgentSam } from '@inneranimalmedia/agentsam-sdk';
```

## Non-interactive init (CI / smoke)

```bash
npx agentsam init \
  --name my-agent \
  --lane fullstack \
  --provider cloudflare \
  --agent orchestrator \
  --yes
```

## Publish checklist

1. `npm test` passes
2. Bump version in `package.json`
3. `npm publish --access public`
4. Tag: `git tag v1.1.1 && git push origin v1.1.1`

## Known gaps (roadmap)

- `agentsam deploy`, `status`, `logs` — not implemented yet
- CMS lane in README — CLI has 4 lanes today (Full Stack, Data, CRM, Creative)
- Published API route may differ; stub mode works without `AGENTSAM_API_KEY`
