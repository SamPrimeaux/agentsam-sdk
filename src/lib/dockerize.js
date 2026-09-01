// Portable Dockerfile/.dockerignore/docker-compose.yml generator + build/run orchestration.
// Ported from AgentSamWorkMode-Prototype's dockerfileTemplates.ts/dockerFileOps.ts so any
// repo — including AgentSam itself — can spin up a fresh, ephemeral local container without
// depending on that app's UI. No shell-heredoc needed here: we're native Node, so files are
// written directly via fs.
//
// Design intent carried over from the original work:
//   - docker run defaults to --rm + capped memory/cpu (ephemeral, no idle-container billing)
//   - assumes nothing pre-exists on disk; every file is generated fresh
//   - four app shapes cover the common prototyping cases, including a fully offline
//     Cloudflare Worker lane (wrangler dev --local — no live CF resources touched)

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const DOCKER_APP_TYPES = ['static', 'vite_react', 'node_service', 'wrangler_dev'];

export const DOCKER_APP_TYPE_LABELS = {
  static: { label: 'Static site', sublabel: 'HTML/dist export -> nginx' },
  vite_react: { label: 'Vite / React app', sublabel: 'npm build -> nginx (multi-stage)' },
  node_service: { label: 'Node service', sublabel: 'Express/Fastify/etc, npm start' },
  wrangler_dev: { label: 'Cloudflare Worker (offline)', sublabel: 'wrangler dev --local, no CF resources hit' },
};

const DEFAULT_PORTS = {
  static: 8080,
  vite_react: 4173,
  node_service: 3000,
  wrangler_dev: 8787,
};

export function slugifyForDocker(input) {
  return (
    String(input || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'app'
  );
}

const COMMON_DOCKERIGNORE = `node_modules
.git
.env
.env.*
dist
build
*.log
.DS_Store
`;

function generateStatic(opts) {
  const slug = slugifyForDocker(opts.appSlug);
  const port = opts.port ?? DEFAULT_PORTS.static;
  const dockerfile = `# Static site — serves a prebuilt export
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
# nginx listens on :80 internally — remap externally via -p ${port}:80
`;
  const compose = `services:
  ${slug}:
    build: .
    ports:
      - "${port}:80"
    restart: "no"
`;
  return { dockerfile, dockerignore: COMMON_DOCKERIGNORE, compose };
}

function generateViteReact(opts) {
  const slug = slugifyForDocker(opts.appSlug);
  const port = opts.port ?? DEFAULT_PORTS.vite_react;
  const buildCmd = opts.buildCommand ?? 'npm run build';
  const dockerfile = `# Vite/React app — multi-stage: build, then serve static output via nginx
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN ${buildCmd}

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
# nginx listens on :80 internally — remap externally via -p ${port}:80
`;
  const compose = `services:
  ${slug}:
    build: .
    ports:
      - "${port}:80"
    restart: "no"
`;
  return { dockerfile, dockerignore: COMMON_DOCKERIGNORE, compose };
}

function generateNodeService(opts) {
  const slug = slugifyForDocker(opts.appSlug);
  const port = opts.port ?? DEFAULT_PORTS.node_service;
  const startCmd = opts.startCommand ?? 'npm start';
  const dockerfile = `# Generic Node service — Express/Fastify/etc.
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY . .
ENV PORT=${port}
EXPOSE ${port}
CMD ["sh", "-c", "${startCmd}"]
`;
  const compose = `services:
  ${slug}:
    build: .
    ports:
      - "${port}:${port}"
    environment:
      - PORT=${port}
    restart: "no"
`;
  return { dockerfile, dockerignore: COMMON_DOCKERIGNORE, compose };
}

function generateWranglerDev(opts) {
  const slug = slugifyForDocker(opts.appSlug);
  const port = opts.port ?? DEFAULT_PORTS.wrangler_dev;
  const entry = opts.entryFile ?? 'src/index.ts';
  const dockerfile = `# Cloudflare Worker — runs wrangler dev inside the container for fully offline prototyping.
# --local means no live CF resources (D1/R2/KV/etc.) are touched — pure local sandbox.
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
EXPOSE ${port}
CMD ["npx", "wrangler", "dev", "${entry}", "--ip", "0.0.0.0", "--port", "${port}", "--local"]
`;
  const compose = `services:
  ${slug}:
    build: .
    ports:
      - "${port}:${port}"
    restart: "no"
    # --local keeps this fully offline — no wrangler.jsonc bindings hit real CF resources
`;
  return { dockerfile, dockerignore: COMMON_DOCKERIGNORE + '.wrangler\n', compose };
}

export function generateDockerFileSet(appType, opts = {}) {
  switch (appType) {
    case 'static':
      return generateStatic(opts);
    case 'vite_react':
      return generateViteReact(opts);
    case 'node_service':
      return generateNodeService(opts);
    case 'wrangler_dev':
      return generateWranglerDev(opts);
    default:
      throw new Error(`Unknown Docker app type "${appType}". Expected one of: ${DOCKER_APP_TYPES.join(', ')}`);
  }
}

/** Writes Dockerfile/.dockerignore/docker-compose.yml into targetDir. Refuses to clobber unless overwrite:true. */
export function writeDockerFileSet(targetDir, fileSet, { overwrite = false } = {}) {
  const files = {
    Dockerfile: fileSet.dockerfile,
    '.dockerignore': fileSet.dockerignore,
    'docker-compose.yml': fileSet.compose,
  };
  const written = [];
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(targetDir, name);
    if (!overwrite && fs.existsSync(filePath)) {
      throw new Error(`${name} already exists at ${filePath} — pass { overwrite: true } to replace it.`);
    }
    fs.writeFileSync(filePath, content, 'utf8');
    written.push(filePath);
  }
  return written;
}

function runCommand(cmd, args, { cwd, onData } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd, shell: false });
    } catch (err) {
      resolve({ ok: false, code: -1, stdout: '', stderr: String(err?.message || err) });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => {
      stdout += d.toString();
      onData?.(d.toString(), 'stdout');
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
      onData?.(d.toString(), 'stderr');
    });
    child.on('close', (code) => resolve({ ok: code === 0, code, stdout, stderr }));
    child.on('error', (err) => resolve({ ok: false, code: -1, stdout, stderr: String(err?.message || err) }));
  });
}

export async function buildDockerImage(targetDir, imageTag, { noCache = false, onData } = {}) {
  const args = noCache ? ['build', '--no-cache', '-t', imageTag, '.'] : ['build', '-t', imageTag, '.'];
  return runCommand('docker', args, { cwd: targetDir, onData });
}

export async function runDockerContainer(
  imageTag,
  { name, hostPort, containerPort, memory = '512m', cpus = '1', detach = true, rm = true, extraArgs = [], onData } = {},
) {
  const args = [];
  if (detach) args.push('-d');
  if (rm) args.push('--rm');
  args.unshift('run');
  args.push(`--memory=${memory}`, `--cpus=${cpus}`);
  if (hostPort && containerPort) args.push('-p', `${hostPort}:${containerPort}`);
  if (name) args.push('--name', name);
  args.push(...extraArgs, imageTag);
  return runCommand('docker', args, { onData });
}

export async function stopDockerContainer(name) {
  return runCommand('docker', ['stop', name]);
}

export function buildDockerDeployPlan(appType, opts = {}) {
  const files = generateDockerFileSet(appType, opts);
  const slug = slugifyForDocker(opts.appSlug || 'app');
  const hostPort = opts.port ?? DEFAULT_PORTS[appType];
  const containerPort = appType === 'static' || appType === 'vite_react' ? 80 : hostPort;
  return { files, slug, hostPort, containerPort, imageTag: `${slug}:local` };
}

/**
 * Full "assume nothing exists" flow: write files, build, run --rm (ephemeral, capped).
 * Pass { writeOnly: true } or { buildOnly: true } to stop early.
 * Returns { plan, written, build, run } — build/run are null if skipped.
 */
export async function dockerize(targetDir, appType, opts = {}) {
  const plan = buildDockerDeployPlan(appType, opts);
  const written = writeDockerFileSet(targetDir, plan.files, { overwrite: opts.overwrite });
  const result = { plan, written, build: null, run: null };

  if (opts.writeOnly) return result;

  result.build = await buildDockerImage(targetDir, plan.imageTag, { noCache: opts.noCache, onData: opts.onData });
  if (!result.build.ok || opts.buildOnly) return result;

  result.run = await runDockerContainer(plan.imageTag, {
    name: plan.slug,
    hostPort: plan.hostPort,
    containerPort: plan.containerPort,
    memory: opts.memory,
    cpus: opts.cpus,
    onData: opts.onData,
  });
  return result;
}
