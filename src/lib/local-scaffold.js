/**
 * Local-first scaffold — no IAM, no Cloudflare, no OAuth.
 * Connor proves the pattern on localhost; `agentsam deploy` graduates to cloud.
 */

const LANE_KEYS = {
  '1': 'fullstack',
  '2': 'cms',
  '3': 'data',
  '4': 'crm',
  '5': 'creative',
  fullstack: 'fullstack',
  cms: 'cms',
  data: 'data',
  crm: 'crm',
  creative: 'creative',
};

const LANE_LABELS = {
  fullstack: 'Full Stack',
  cms: 'CMS',
  data: 'Data Solutions',
  crm: 'Customer Management',
  creative: 'Creative & Design',
};

const AGENT_FOR_LANE = {
  fullstack: 'orchestrator',
  cms: 'cms',
  data: 'data',
  crm: 'crm',
  creative: 'creative',
};

const RUN_TARGETS = {
  '1': 'local',
  '2': 'cloudflare',
  '3': 'gcp',
  local: 'local',
  cloudflare: 'cloudflare',
  gcp: 'gcp',
};

export { LANE_KEYS, LANE_LABELS, RUN_TARGETS };

export function normalizeLane(raw) {
  const k = String(raw || 'fullstack').trim().toLowerCase();
  return LANE_KEYS[k] || (LANE_LABELS[k] ? k : 'fullstack');
}

export function normalizeRunTarget(raw) {
  const k = String(raw || 'local').trim().toLowerCase();
  return RUN_TARGETS[k] || 'local';
}

function migrationSql(laneKey) {
  const cmsExtra =
    laneKey === 'cms'
      ? `
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
`
      : '';

  return `-- AgentSam local schema (${laneKey})
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
${cmsExtra}
`.trim();
}

/**
 * @param {{ projectName: string, laneKey: string, laneLabel: string, agent: string, runTarget: string, sdkVersion: string }}
 */
export function buildLocalScaffoldFiles({
  projectName,
  laneKey,
  laneLabel,
  agent,
  runTarget,
  sdkVersion = '1.5.1',
}) {
  const sdkRange = `^${sdkVersion.split('.').slice(0, 2).join('.')}.0`;
  const migration = migrationSql(laneKey);

  return [
    {
      path: 'agentsam.config.js',
      content: `export default {
  project: '${projectName}',
  lane: '${laneKey}',
  agent: '${agent}',
  runTarget: '${runTarget}',
  api: { baseUrl: '/api/agentsam' },
};
`,
    },
    {
      path: '.agentsam/config.json',
      content: `${JSON.stringify(
        {
          project: projectName,
          lane: laneKey,
          agent,
          run_target: 'local',
          deploy_target: runTarget === 'local' ? null : runTarget,
          pty_port: 3099,
          dev_port: 8787,
          ui_port: 5173,
          ui: 'gorilla',
          scaffold_version: sdkVersion,
        },
        null,
        2,
      )}\n`,
    },
    {
      path: '.agentsam/start-local.md',
      content: `# Local terminal (no Cloudflare tunnel)

Agent Sam runs a PTY on **your machine** — no accounts, no cloudflared, no IAM login required.

\`\`\`bash
# Terminal 1 — local PTY (Agent Sam shell bridge)
npx agentsam start-local

# Terminal 2 — Gorilla Mode UI + local Worker API
npm run dev
npm run db:migrate   # first time only
\`\`\`

Open **http://localhost:5173** — pixel Gorilla shell proxies \`/api\` → Worker on :8787.

PTY listens on \`ws://127.0.0.1:3099\`. Health: \`curl http://127.0.0.1:3099/health\`

When you're ready to ship to Cloudflare or GCP:

\`\`\`bash
npx agentsam deploy
\`\`\`
`,
    },
    {
      path: '.gitignore',
      content: `node_modules/
.env
.dev.vars
dist/
.wrangler/
*.db
`,
    },
    {
      path: 'package.json',
      content: `${JSON.stringify(
        {
          name: projectName,
          version: '0.1.0',
          type: 'module',
          private: true,
          scripts: {
            dev: 'concurrently -k "npm run dev:worker" "npm run dev:ui"',
            'dev:worker': 'wrangler dev --local --port 8787',
            'dev:ui': 'vite',
            'dev:node': 'node --watch src/dev-server.js',
            deploy: 'wrangler deploy',
            smoke: 'node ./scripts/smoke.mjs',
            'db:migrate': 'wrangler d1 migrations apply DB --local',
            'start:pty': 'agentsam start-local',
          },
          dependencies: {
            '@inneranimalmedia/agentsam-sdk': sdkRange,
            react: '^19.0.0',
            'react-dom': '^19.0.0',
          },
          devDependencies: {
            wrangler: '^4.0.0',
            vite: '^6.0.0',
            '@vitejs/plugin-react': '^4.0.0',
            concurrently: '^9.0.0',
          },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: '.env',
      content: `VITE_PROJECT_NAME=${projectName}
VITE_LANE_KEY=${laneKey}
VITE_AGENT=${agent}
`,
    },
    {
      path: 'wrangler.toml',
      content: `name = "${projectName}"
main = "src/index.js"
compatibility_date = "2026-06-27"

[[d1_databases]]
binding = "DB"
database_name = "${projectName}-db"
database_id = "local-dev"

[dev]
port = 8787
local_protocol = "http"
`,
    },
    {
      path: 'migrations/0001_agentsam_core.sql',
      content: `${migration}\n`,
    },
    {
      path: 'src/index.js',
      content: `import { AgentSam } from '@inneranimalmedia/agentsam-sdk';

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
`,
    },
    {
      path: 'src/dev-server.js',
      content: `/**
 * Plain Node dev server — no Cloudflare account required.
 * Use when wrangler is unavailable: npm run dev:node
 */
import { createServer } from 'node:http';
import { AgentSam } from '@inneranimalmedia/agentsam-sdk';

const app = new AgentSam({
  project: '${projectName}',
  lane: '${laneKey}',
  agent: '${agent}',
});

const port = Number(process.env.PORT || 8787);

createServer(async (req, res) => {
  const url = \`http://127.0.0.1\${req.url || '/'}\`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  }
  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = Buffer.concat(chunks);
  }
  const response = await app.handle(new Request(url, { method: req.method, headers, body }));
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, '127.0.0.1', () => {
  console.log(\`Agent Sam dev server http://127.0.0.1:\${port}\`);
});
`,
    },
    {
      path: 'scripts/smoke.mjs',
      content: `import { AgentSam } from '@inneranimalmedia/agentsam-sdk';

const app = new AgentSam({ project: '${projectName}', lane: '${laneKey}', agent: '${agent}' });
const res = await app.handle(new Request('https://example.com/api/health'));
const data = await res.json();

if (!data.ok) {
  console.error(data);
  process.exit(1);
}

console.log('AgentSam smoke test passed:', data);
`,
    },
    {
      path: 'README.md',
      content: `# ${projectName}

Built locally with [Agent Sam SDK](https://inneranimalmedia.com) — **${laneLabel}** lane, \`${agent}\` agent.

## Gorilla Mode (default UI)

\`\`\`bash
npm install
npm run smoke
npm run dev                 # Worker :8787 + Vite :5173
\`\`\`

Open **http://localhost:5173** — pixel Gorilla shell. Live \`/health\`, \`/samiam\`, and demo scenarios proxy to your local Worker.

\`\`\`bash
npx agentsam start-local    # optional — local PTY on :3099
npm run db:migrate          # apply local D1 schema
\`\`\`

Everything works offline. No Cloudflare account required to start.

## Graduate to cloud

\`\`\`bash
npx agentsam deploy
\`\`\`

Cloudflare OAuth is prompted **only** when you deploy — not at init.

Run target selected at init: **${runTarget}**
`,
    },
  ];
}

export function buildLocalScaffoldMeta(body, sdkVersion = '1.5.1') {
  const projectName = String(body.projectName || body.project_name || 'agentsam-project')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'agentsam-project';
  const laneKey = normalizeLane(body.lane);
  const laneLabel = LANE_LABELS[laneKey] || 'Full Stack';
  const agent = AGENT_FOR_LANE[laneKey] || 'orchestrator';
  const runTarget = normalizeRunTarget(body.runTarget || body.run_target || 'local');

  return {
    projectName,
    laneKey,
    laneLabel,
    agent,
    runTarget,
    files: buildLocalScaffoldFiles({ projectName, laneKey, laneLabel, agent, runTarget, sdkVersion }),
    next_steps: [
      'npm install',
      'npm run smoke',
      'npm run dev',
      'Open http://localhost:5173 — Gorilla Mode UI',
      'npm run db:migrate',
      'Optional: npx agentsam start-local',
      'When ready: npx agentsam deploy',
    ],
  };
}
