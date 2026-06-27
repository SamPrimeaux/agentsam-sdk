import fs from 'fs';
import path from 'path';

const LANE_KEYS = {
  'Full Stack': 'fullstack',
  CMS: 'cms',
  'Data Solutions': 'data',
  'Customer Management': 'crm',
  'Creative & Design': 'creative',
};

const AGENT_FOR_LANE = {
  fullstack: 'orchestrator',
  cms: 'cms',
  data: 'data',
  crm: 'crm',
  creative: 'creative',
};

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart());
}

function slugify(value) {
  return String(value || 'agentsam-project')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'agentsam-project';
}

function workerTemplate({ projectName, laneKey, agent }) {
  return `
import { AgentSam } from '@inneranimalmedia/agentsam-sdk';

export default {
  async fetch(request, env, ctx) {
    const agent = new AgentSam({
      env,
      ctx,
      project: '${projectName}',
      lane: '${laneKey}',
      agent: '${agent}',
    });

    return agent.handle(request);
  },
};
`;
}

function migrationTemplate({ projectName, laneKey }) {
  return `
-- AgentSam core schema for ${projectName}
CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  agent TEXT NOT NULL,
  lane TEXT NOT NULL,
  goal TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES agent_sessions(id)
);

CREATE TABLE IF NOT EXISTS agent_tool_calls (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  input_json TEXT,
  output_json TEXT,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (session_id) REFERENCES agent_sessions(id)
);

${laneKey === 'cms' ? `
CREATE TABLE IF NOT EXISTS cms_pages (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  hero_asset_key TEXT,
  content_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cms_assets (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL UNIQUE,
  title TEXT,
  alt_text TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
` : ''}
`;
}

function readmeTemplate({ projectName, lane, provider, agent }) {
  return `
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

## Smoke test

\`\`\`bash
npm run smoke
\`\`\`

## Deploy

\`\`\`bash
npm run deploy
\`\`\`

## Endpoints

- \`GET /api/health\`
- \`GET /api/agentsam/info\`
- \`POST /api/agentsam/session\`
- \`POST /api/agentsam/message\`
`;
}

export function scaffoldProject({ projectName, lane, provider, agent, cfAccountId }) {
  const safeName = slugify(projectName);
  const dir = path.resolve(process.cwd(), safeName);
  const laneKey = LANE_KEYS[lane] ?? 'fullstack';
  const selectedAgent = agent || AGENT_FOR_LANE[laneKey] || 'orchestrator';

  if (fs.existsSync(dir)) {
    throw new Error(`Directory "${safeName}" already exists.`);
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(`${dir}/src`, { recursive: true });
  fs.mkdirSync(`${dir}/migrations`, { recursive: true });

  write(`${dir}/agentsam.config.js`, `
export default {
  project: '${safeName}',
  lane: '${laneKey}',
  provider: '${provider}',
  agent: '${selectedAgent}',
  cloudflare: {
    accountId: '${cfAccountId || ''}',
  },
  api: {
    baseUrl: '/api/agentsam',
  },
};
`);

  write(`${dir}/.env.example`, `
AGENTSAM_API_KEY=
CLOUDFLARE_ACCOUNT_ID=${cfAccountId || ''}
CLOUDFLARE_API_TOKEN=
`);

  write(`${dir}/.gitignore`, `
node_modules/
.env
.dev.vars
dist/
.wrangler/
`);

  write(`${dir}/package.json`, `${JSON.stringify({
    name: safeName,
    version: '0.1.0',
    type: 'module',
    scripts: {
      dev: 'wrangler dev',
      deploy: 'wrangler deploy',
      smoke: 'node ./scripts/smoke.mjs',
    },
    dependencies: {
      '@inneranimalmedia/agentsam-sdk': '^1.1.0',
    },
    devDependencies: {
      wrangler: '^4.0.0',
    },
  }, null, 2)}\n`);

  write(`${dir}/wrangler.toml`, `
name = "${safeName}"
main = "src/index.js"
compatibility_date = "2026-06-27"

[[d1_databases]]
binding = "DB"
database_name = "${safeName}-db"
database_id = "REPLACE_WITH_D1_DATABASE_ID"

[[kv_namespaces]]
binding = "KV"
id = "REPLACE_WITH_KV_NAMESPACE_ID"

[[r2_buckets]]
binding = "R2"
bucket_name = "${safeName}"
`);

  write(`${dir}/migrations/0001_agentsam_core.sql`, migrationTemplate({ projectName: safeName, laneKey }));
  write(`${dir}/src/index.js`, workerTemplate({ projectName: safeName, laneKey, agent: selectedAgent }));
  write(`${dir}/README.md`, readmeTemplate({ projectName: safeName, lane, provider, agent: selectedAgent }));

  write(`${dir}/scripts/smoke.mjs`, `
import { AgentSam } from '@inneranimalmedia/agentsam-sdk';

const app = new AgentSam({ project: '${safeName}', lane: '${laneKey}', agent: '${selectedAgent}' });
const res = await app.handle(new Request('https://example.com/api/health'));
const data = await res.json();

if (!data.ok) {
  console.error(data);
  process.exit(1);
}

console.log('AgentSam smoke test passed:', data);
`);

  return dir;
}
