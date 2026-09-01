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

export function sdkDependencySpec(rawVersion) {
  const version = String(rawVersion || '').trim();
  if (!version) return 'latest';
  return version.includes('-') ? version : `^${version}`;
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
  const sdkRange = sdkDependencySpec(sdkVersion);
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
          db_path: '.agentsam/data/agentsam.sqlite',
          db_schema: 'db/schema.sql',
          ui: 'terminal',
          scaffold_version: sdkVersion,
        },
        null,
        2,
      )}\n`,
    },
    {
      path: '.agentsam/start-local.md',
      content: `# Agent Sam local project

Local is the default authority. No Worker, Cloudflare account, tunnel, or hosted database is required.

\`\`\`bash
npm install
npm run smoke
npm run dev
\`\`\`

Useful local surfaces:

\`\`\`bash
npm run db:status
npm run tui
npm run tui:rich -- --install   # optional Rich UI in isolated .agentsam venv
npx agentsam start-local        # PTY on ws://127.0.0.1:3099
\`\`\`

The local SQLite database lives at \`.agentsam/data/agentsam.sqlite\` and is initialized from \`db/schema.sql\`.

When you're intentionally ready to add cloud infrastructure:

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
            dev: 'node --env-file=.env --watch src/dev-server.js',
            start: 'node --env-file=.env src/dev-server.js',
            smoke: 'node --env-file=.env ./scripts/smoke.mjs',
            'db:init': 'agentsam db init',
            'db:status': 'agentsam db status',
            pty: 'agentsam start-local',
            tui: 'agentsam tui',
            'tui:rich': 'agentsam tui rich --scene dashboard',
            deploy: 'agentsam deploy',
          },
          engines: {
            node: '>=22.5.0',
          },
          dependencies: {
            '@inneranimalmedia/agentsam-sdk': sdkRange,
          },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: '.env',
      content: `AGENTSAM_PROJECT=${projectName}
AGENTSAM_LANE=${laneKey}
AGENTSAM_AGENT=${agent}
AGENTSAM_DB=.agentsam/data/agentsam.sqlite
PORT=8787
`,
    },
    {
      path: '.env.example',
      content: `AGENTSAM_PROJECT=${projectName}
AGENTSAM_LANE=${laneKey}
AGENTSAM_AGENT=${agent}
AGENTSAM_DB=.agentsam/data/agentsam.sqlite
PORT=8787
`,
    },
    {
      path: 'db/schema.sql',
      content: `${migration}\n`,
    },
    {
      path: 'src/agent.js',
      content: `import { AgentSam } from '@inneranimalmedia/agentsam-sdk';

export function createAgent(options = {}) {
  return new AgentSam({
    env: options.env || {},
    project: process.env.AGENTSAM_PROJECT || '${projectName}',
    lane: process.env.AGENTSAM_LANE || '${laneKey}',
    agent: process.env.AGENTSAM_AGENT || '${agent}',
  });
}
`,
    },
    {
      path: 'src/dev-server.js',
      content: `import { createServer } from 'node:http';
import { createLocalSqliteDatabase } from '@inneranimalmedia/agentsam-sdk/local/sqlite';
import { createAgent } from './agent.js';

const port = Number(process.env.PORT || 8787);
const DB = await createLocalSqliteDatabase(
  process.env.AGENTSAM_DB || '.agentsam/data/agentsam.sqlite',
);
const app = createAgent({ env: { DB } });

const server = createServer(async (req, res) => {
  const url = \`http://127.0.0.1:\${port}\${req.url || '/'}\`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value != null) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = Buffer.concat(chunks);
  }

  try {
    const response = await app.handle(new Request(url, { method: req.method, headers, body }));
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: error?.message || String(error) }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(\`Agent Sam local API  http://127.0.0.1:\${port}\`);
  console.log(\`SQLite               \${process.env.AGENTSAM_DB || '.agentsam/data/agentsam.sqlite'}\`);
});

function shutdown() {
  server.close(() => {
    DB.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
`,
    },
    {
      path: 'scripts/smoke.mjs',
      content: `import { createAgent } from '../src/agent.js';

const app = await createAgent();

const health = await app.handle(new Request('http://127.0.0.1:8787/api/health'));
const healthData = await health.json();
if (!healthData.ok) throw new Error('health check failed');

const created = await app.handle(
  new Request('http://127.0.0.1:8787/api/agentsam/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ goal: 'prove local persistence' }),
  }),
);
const createdData = await created.json();
if (!createdData.ok || !createdData.session?.id) throw new Error('session create failed');

const loaded = await app.handle(
  new Request(\`http://127.0.0.1:8787/api/agentsam/session/\${createdData.session.id}\`),
);
const loadedData = await loaded.json();
if (!loadedData.ok || loadedData.session?.id !== createdData.session.id) {
  throw new Error('local SQLite persistence check failed');
}

app.env?.DB?.close?.();
console.log('Agent Sam local smoke passed');
console.log('  health   ok');
console.log('  sqlite   session persisted');
console.log('  project  ${projectName}');
`,
    },
    {
      path: 'README.md',
      content: `# ${projectName}

Agent Sam local project — **${laneLabel}** lane, \`${agent}\` agent.

## Start locally

\`\`\`bash
npm install
npm run smoke
npm run dev
\`\`\`

Local API: **http://127.0.0.1:8787**

Local state:

- Git repository initialized by \`agentsam init\`
- \`.env\` for local configuration
- SQLite at \`.agentsam/data/agentsam.sqlite\`
- schema at \`db/schema.sql\`

## Agent Sam terminal experience

\`\`\`bash
npm run tui                  # zero-dependency ANSI dashboard
npm run tui:rich             # Python Rich dashboard if installed
npm run tui:rich -- --install
npm run pty                  # local PTY on ws://127.0.0.1:3099
npm run db:status
\`\`\`

No Worker or cloud account is required for local development.

## Graduate intentionally

\`\`\`bash
npm run deploy
\`\`\`

Selected future deploy target: **${runTarget}**. Cloud-specific adapters and credentials belong to deploy time, not local init.
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
      'npm run tui',
      'npm run db:status',
      'Optional: npm run tui:rich -- --install',
      'Optional: npm run pty',
      'When ready for cloud: npm run deploy',
    ],
  };
}
