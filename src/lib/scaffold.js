import fs from 'fs';
import path from 'path';

export function scaffoldProject({ projectName, lane, provider, agent, cfAccountId }) {
  const dir = path.resolve(process.cwd(), projectName);

  if (fs.existsSync(dir)) {
    console.error(`\n  ✗ Directory "${projectName}" already exists.\n`);
    process.exit(1);
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(`${dir}/src`, { recursive: true });

  // agentsam.config.js
  fs.writeFileSync(`${dir}/agentsam.config.js`, `
export default {
  project: '${projectName}',
  lane: '${lane}',
  provider: '${provider}',
  agent: '${agent}',
  cloudflare: {
    accountId: '${cfAccountId || ''}',
  },
  api: {
    baseUrl: 'https://api.inneranimalmedia.com',
  },
};
`.trimStart());

  // .env.example
  fs.writeFileSync(`${dir}/.env.example`, `
AGENTSAM_API_KEY=
CLOUDFLARE_ACCOUNT_ID=${cfAccountId || ''}
CLOUDFLARE_API_TOKEN=
`.trimStart());

  // .gitignore
  fs.writeFileSync(`${dir}/.gitignore`, `
node_modules/
.env
.dev.vars
dist/
`.trimStart());

  // package.json
  fs.writeFileSync(`${dir}/package.json`, JSON.stringify({
    name: projectName,
    version: '0.1.0',
    type: 'module',
    scripts: {
      dev: 'wrangler dev',
      deploy: 'wrangler deploy',
    },
    dependencies: {
      '@inneranimalmedia/agentsam-sdk': '^1.0.0',
    },
  }, null, 2));

  // Lane-specific files
  if (lane === 'Full Stack' || lane === 'Data Solutions') {
    fs.mkdirSync(`${dir}/migrations`, { recursive: true });
    fs.writeFileSync(`${dir}/migrations/0001_init.sql`, `
-- Initial schema for ${projectName}
CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);
`.trimStart());
  }

  if (lane === 'Full Stack' || provider === 'Cloudflare Workers' || provider === 'GitHub + Cloudflare') {
    fs.writeFileSync(`${dir}/wrangler.toml`, `
name = "${projectName}"
main = "src/index.js"
compatibility_date = "2025-01-01"

[[d1_databases]]
binding = "DB"
database_name = "${projectName}-db"
database_id = ""
`.trimStart());
  }

  // src/index.js — lane-specific worker
  const workers = {
    'Full Stack': `
import { AgentSam } from '@inneranimalmedia/agentsam-sdk';

export default {
  async fetch(request, env, ctx) {
    const agent = new AgentSam({ env, agent: 'orchestrator' });
    return agent.handle(request);
  },
};
`,
    'Data Solutions': `
import { AgentSam } from '@inneranimalmedia/agentsam-sdk';

export default {
  async fetch(request, env, ctx) {
    const agent = new AgentSam({ env, agent: 'data' });
    return agent.handle(request);
  },
};
`,
    'Customer Management': `
import { AgentSam } from '@inneranimalmedia/agentsam-sdk';

export default {
  async fetch(request, env, ctx) {
    const agent = new AgentSam({ env, agent: 'crm' });
    return agent.handle(request);
  },
};
`,
    'Creative & Design': `
import { AgentSam } from '@inneranimalmedia/agentsam-sdk';

export default {
  async fetch(request, env, ctx) {
    const agent = new AgentSam({ env, agent: 'creative' });
    return agent.handle(request);
  },
};
`,
  };

  fs.writeFileSync(`${dir}/src/index.js`, workers[lane].trimStart());

  // README
  fs.writeFileSync(`${dir}/README.md`, `
# ${projectName}

Scaffolded with [Agent Sam SDK](https://www.npmjs.com/package/@inneranimalmedia/agentsam-sdk).

## Lane
**${lane}** — ${agent} agent, ${provider}

## Setup

\`\`\`bash
cp .env.example .env
npm install
\`\`\`

## Dev

\`\`\`bash
npm run dev
\`\`\`

## Deploy

\`\`\`bash
npm run deploy
\`\`\`
`.trimStart());

  return dir;
}
