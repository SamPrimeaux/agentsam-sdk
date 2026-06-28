import fs from 'fs';
import path from 'path';

const DEFAULT_API_BASE = 'https://inneranimalmedia.com';

/**
 * @param {object} opts
 * @param {string} opts.projectName
 * @param {string} opts.lane
 * @param {string} opts.provider
 * @param {string} opts.agent
 * @param {string} [opts.cfAccountId]
 * @param {string} [opts.sdkVersion]
 */
export function scaffoldProject({ projectName, lane, provider, agent, cfAccountId, sdkVersion = '1.1.0' }) {
  const dir = path.resolve(process.cwd(), projectName);

  if (fs.existsSync(dir)) {
    console.error(`\n  ✗ Directory "${projectName}" already exists.\n`);
    process.exit(1);
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(`${dir}/src`, { recursive: true });

  fs.writeFileSync(
    `${dir}/agentsam.config.js`,
    `
export default {
  project: '${projectName}',
  lane: '${lane}',
  provider: '${provider}',
  agent: '${agent}',
  cloudflare: {
    accountId: '${cfAccountId || ''}',
  },
  api: {
    baseUrl: '${DEFAULT_API_BASE}',
  },
};
`.trimStart(),
  );

  fs.writeFileSync(
    `${dir}/.env.example`,
    `
AGENTSAM_API_KEY=
AGENTSAM_API_BASE=${DEFAULT_API_BASE}
CLOUDFLARE_ACCOUNT_ID=${cfAccountId || ''}
CLOUDFLARE_API_TOKEN=
`.trimStart(),
  );

  fs.writeFileSync(
    `${dir}/.gitignore`,
    `
node_modules/
.env
.dev.vars
dist/
.wrangler/
`.trimStart(),
  );

  const sdkRange = `^${sdkVersion.split('.').slice(0, 2).join('.')}.0`;

  fs.writeFileSync(
    `${dir}/package.json`,
    JSON.stringify(
      {
        name: projectName,
        version: '0.1.0',
        type: 'module',
        private: true,
        scripts: {
          dev: 'wrangler dev',
          deploy: 'wrangler deploy',
          'check:health': 'curl -s http://localhost:8787/health | node -e "process.stdin.on(\'data\',d=>{const j=JSON.parse(d); if(!j.ok) process.exit(1); console.log(j);})"',
        },
        dependencies: {
          '@inneranimalmedia/agentsam-sdk': sdkRange,
        },
        devDependencies: {
          wrangler: '^4.0.0',
        },
      },
      null,
      2,
    ),
  );

  if (lane === 'Full Stack' || lane === 'Data Solutions') {
    fs.mkdirSync(`${dir}/migrations`, { recursive: true });
    fs.writeFileSync(
      `${dir}/migrations/0001_init.sql`,
      `
-- Initial schema for ${projectName}
CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);
`.trimStart(),
    );
  }

  if (lane === 'Full Stack' || provider === 'Cloudflare Workers' || provider === 'GitHub + Cloudflare') {
    fs.writeFileSync(
      `${dir}/wrangler.toml`,
      `
name = "${projectName}"
main = "src/index.js"
compatibility_date = "2025-06-01"

[vars]
AGENTSAM_API_BASE = "${DEFAULT_API_BASE}"

[[d1_databases]]
binding = "DB"
database_name = "${projectName}-db"
database_id = ""
`.trimStart(),
    );
  }

  const agentId = agent || 'orchestrator';

  const workers = {
    'Full Stack': workerTemplate(agentId),
    'Data Solutions': workerTemplate('data'),
    'Customer Management': workerTemplate('crm'),
    'Creative & Design': workerTemplate('creative'),
  };

  fs.writeFileSync(`${dir}/src/index.js`, workers[lane].trimStart());

  fs.writeFileSync(
    `${dir}/README.md`,
    `
# ${projectName}

Scaffolded with [@inneranimalmedia/agentsam-sdk](https://www.npmjs.com/package/@inneranimalmedia/agentsam-sdk).

## Lane
**${lane}** — ${agent} agent, ${provider}

## Setup

\`\`\`bash
cp .env.example .env
npm install
\`\`\`

Add secrets to \`.dev.vars\` for local wrangler:

\`\`\`
AGENTSAM_API_KEY=your_key
\`\`\`

## Dev

\`\`\`bash
npm run dev
curl http://localhost:8787/health
\`\`\`

## Deploy

\`\`\`bash
npm run deploy
\`\`\`
`.trimStart(),
  );

  return dir;
}

function workerTemplate(agentId) {
  return `
import { AgentSam } from '@inneranimalmedia/agentsam-sdk';

export default {
  async fetch(request, env, ctx) {
    const agent = new AgentSam({ env, agent: '${agentId}' });
    return agent.handle(request);
  },
};
`;
}
