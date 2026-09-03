// Portable Dockerfile/.dockerignore/docker-compose.yml generator + build/run orchestration,
// with content-hash versioning, a lightweight per-project JSON manifest, and integration
// into agentsam-sdk's own cross-repo hashtag ledger (bin/tag / tags/registry.json).
//
// Design intent:
//   - docker run defaults to --rm + capped memory/cpu (ephemeral, no idle-container billing)
//   - every build is content-addressed: identical Dockerfile+compose -> identical hash ->
//     identical image tag. Multiple versions coexist under .agentsam/docker/<hash>/ instead
//     of silently clobbering each other at the project root.
//   - every container gets agentsam.* labels so `docker ps` itself is the source of truth
//     for "what's running" -- no separate state file that can drift out of sync.
//   - optional --timeout auto-stops a container; every run still prints an explicit manual
//     stop command regardless, so nothing is ever silently left running.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateKnowledgeDocker, prepareKnowledgeDeployment, stageKnowledgeContext, knowledgeRunArguments } from './knowledge-docker.js';
import { generateCadDocker, prepareCadDeployment, stageCadContext, cadRunArguments, cadDefaultResources } from './cad-docker.js';

export const DOCKER_APP_TYPES = ['static', 'vite_react', 'node_service', 'wrangler_dev', 'knowledge_service', 'cad_service'];

export const DOCKER_APP_TYPE_LABELS = {
  static: { label: 'Static site', sublabel: 'HTML/dist export -> nginx' },
  vite_react: { label: 'Vite / React app', sublabel: 'npm build -> nginx (multi-stage)' },
  node_service: { label: 'Node service', sublabel: 'Express/Fastify/etc, npm start' },
  wrangler_dev: { label: 'Cloudflare Worker (offline)', sublabel: 'wrangler dev --local, no CF resources hit' },
  knowledge_service: { label: 'Knowledge service', sublabel: 'Durable background indexing, read-only repositories, localhost API' },
  cad_service: { label: 'CAD execution service', sublabel: 'Local OpenSCAD / optional FreeCAD + Blender runtime' },
};

const DEFAULT_PORTS = {
  static: 8080,
  vite_react: 4173,
  node_service: 3000,
  wrangler_dev: 8787,
  knowledge_service: 8792,
  cad_service: 8793,
};

const AGENTSAM_DOCKER_DIR = '.agentsam/docker';

export function slugifyForDocker(input) {
  return (
    String(input || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'app'
  );
}

/** Content hash of the versioned files (Dockerfile + compose) -- the "hashtag" identity. */
export function computeFileSetHash(fileSet) {
  const h = crypto.createHash('sha256');
  h.update(fileSet.dockerfile);
  h.update('\u0000');
  h.update(fileSet.compose);
  return h.digest('hex').slice(0, 10);
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
    case 'knowledge_service':
      return generateKnowledgeDocker({ ...opts, appSlug: slugifyForDocker(opts.appSlug || 'agentsam-knowledge') });
    case 'cad_service':
      return generateCadDocker({ ...opts, appSlug: slugifyForDocker(opts.appSlug || 'agentsam-cad') });
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

function manifestPath(targetDir) {
  return path.join(targetDir, AGENTSAM_DOCKER_DIR, 'index.json');
}

/** Reads the per-project JSON manifest mapping hash -> build metadata. Empty object if none yet. */
export function readManifest(targetDir) {
  const p = manifestPath(targetDir);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

function writeManifestEntry(targetDir, hash, entry) {
  const p = manifestPath(targetDir);
  const manifest = readManifest(targetDir);
  manifest[hash] = { ...manifest[hash], ...entry };
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return manifest;
}

/**
 * Writes the versioned files under .agentsam/docker/<hash>/Dockerfile + docker-compose.yml
 * (content-addressed -- always safe/idempotent to rewrite, same hash means same bytes) and
 * .dockerignore at the project root (shared across versions; respects `overwrite`).
 */
export function writeDockerFileSet(targetDir, fileSet, hash, { overwrite = false, isolatedContext = false } = {}) {
  const versionDir = path.join(targetDir, AGENTSAM_DOCKER_DIR, hash);
  fs.mkdirSync(versionDir, { recursive: true });

  const dockerfilePath = path.join(versionDir, 'Dockerfile');
  const composePath = path.join(versionDir, 'docker-compose.yml');
  fs.writeFileSync(dockerfilePath, fileSet.dockerfile, 'utf8');
  fs.writeFileSync(composePath, fileSet.compose, 'utf8');

  const dockerignorePath = isolatedContext ? path.join(versionDir, 'context/.dockerignore') : path.join(targetDir, '.dockerignore');
  fs.mkdirSync(path.dirname(dockerignorePath), { recursive: true });
  if (!overwrite && fs.existsSync(dockerignorePath)) {
    // shared/mutable file -- leave existing one alone unless explicitly told to replace it
  } else {
    fs.writeFileSync(dockerignorePath, fileSet.dockerignore, 'utf8');
  }

  return { dockerfilePath, composePath, dockerignorePath, versionDir };
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

export async function buildDockerImage(targetDir, { dockerfilePath, imageTag, latestTag, noCache = false, onData } = {}) {
  const args = ['build', '-f', dockerfilePath, '-t', imageTag];
  if (latestTag) args.push('-t', latestTag);
  if (noCache) args.splice(1, 0, '--no-cache');
  args.push('.');
  return runCommand('docker', args, { cwd: targetDir, onData });
}

export async function runDockerContainer(
  imageTag,
  { name, hostPort, containerPort, hostIp, memory = '512m', cpus = '1', detach = true, rm = true, labels = {}, extraArgs = [], onData } = {},
) {
  const args = [];
  if (detach) args.push('-d');
  if (rm) args.push('--rm');
  args.unshift('run');
  args.push(`--memory=${memory}`, `--cpus=${cpus}`);
  if (hostPort && containerPort) args.push('-p', `${hostIp ? hostIp + ':' : ''}${hostPort}:${containerPort}`);
  if (name) args.push('--name', name);
  for (const [k, v] of Object.entries(labels)) args.push('--label', `${k}=${v}`);
  args.push(...extraArgs, imageTag);
  return runCommand('docker', args, { onData });
}

export async function stopDockerContainer(name) {
  return runCommand('docker', ['stop', name]);
}

/**
 * Remove an existing container name only when it belongs to AgentSam and matches
 * the expected managed service type. This makes persistent service setup idempotent
 * without ever deleting an unrelated user container that happens to share the name.
 */
export async function replaceManagedContainer(name, expectedType) {
  const inspect = await runCommand('docker', [
    'inspect',
    '--format', '{{json .Config.Labels}}',
    name,
  ]);
  if (!inspect.ok) {
    const missing = /No such object|No such container/i.test(`${inspect.stdout}
${inspect.stderr}`);
    return missing
      ? { ok: true, existed: false, removed: false }
      : { ok: false, existed: false, removed: false, stderr: inspect.stderr || inspect.stdout };
  }

  let labels = {};
  try {
    labels = JSON.parse(inspect.stdout.trim() || '{}') || {};
  } catch {
    return { ok: false, existed: true, removed: false, stderr: `Could not inspect labels for existing container ${name}.` };
  }

  if (labels['agentsam.managed'] !== 'true' || (expectedType && labels['agentsam.type'] !== expectedType)) {
    return {
      ok: false,
      existed: true,
      removed: false,
      stderr: `Container name ${name} is already in use by a container not managed as AgentSam ${expectedType || 'service'}; refusing to remove it.`,
    };
  }

  const removed = await runCommand('docker', ['rm', '-f', name]);
  return { ...removed, existed: true, removed: removed.ok };
}

/** All containers (running or stopped) that agentsam dockerize has launched, via label filter. */
export async function listManagedContainers() {
  const res = await runCommand('docker', [
    'ps', '-a',
    '--filter', 'label=agentsam.managed=true',
    '--format', '{{json .}}',
  ]);
  if (!res.ok) return { ok: false, containers: [], stderr: res.stderr };
  const containers = res.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return { ok: true, containers };
}

/** Schedules an auto-stop after timeoutSeconds. Caller (CLI) is responsible for staying alive. */
export function scheduleAutoStop(name, timeoutSeconds, onStopped) {
  const timer = setTimeout(async () => {
    const res = await stopDockerContainer(name);
    onStopped?.(res);
  }, timeoutSeconds * 1000);
  return () => clearTimeout(timer);
}

const SDK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG_SCRIPT = path.join(SDK_ROOT, 'bin', 'tag');

/**
 * Registers this build in agentsam-sdk's own cross-repo hashtag ledger (bin/tag / tags/registry.json)
 * so a dockerize build is findable the same way as any other cross-repo ref. Best-effort: never
 * throws, never blocks dockerize() -- a machine without bin/tag or jq just skips this quietly.
 */
export async function registerDockerTag({ hashtag, repo, ref, note }) {
  if (!fs.existsSync(TAG_SCRIPT)) return { ok: false, skipped: true, reason: 'bin/tag not found' };
  const res = await runCommand('bash', [TAG_SCRIPT, 'add', hashtag, '--repo', repo, '--ref', ref, '--note', note]);
  return { ok: res.ok, skipped: false, stdout: res.stdout, stderr: res.stderr };
}

export function buildDockerDeployPlan(appType, opts = {}) {
  const files = generateDockerFileSet(appType, opts);
  const hash = computeFileSetHash(files);
  const slug = slugifyForDocker(opts.appSlug || 'app');
  const hostPort = opts.port ?? DEFAULT_PORTS[appType];
  const containerPort = appType === 'static' || appType === 'vite_react' ? 80 : hostPort;
  return {
    files,
    hash,
    slug,
    hostPort,
    containerPort,
    imageTag: `${slug}:${hash}`,
    latestTag: `${slug}:latest`,
    hashtag: `#docker-${slug}-${hash}`,
  };
}

/**
 * Full "assume nothing exists" flow: write versioned files, build (dual-tagged), run --rm
 * (ephemeral, capped, labeled), optionally auto-stop after opts.timeoutSeconds, and register
 * the build in the cross-repo hashtag ledger.
 * Pass { writeOnly: true } or { buildOnly: true } to stop early.
 * Returns { plan, written, manifest, build, run, tagRegistration, cancelAutoStop } --
 * fields are null/undefined when skipped.
 */
export async function dockerize(targetDir, appType, opts = {}) {
  const knowledge = appType === 'knowledge_service';
  const cad = appType === 'cad_service';
  if (knowledge) {
    if (opts.timeoutSeconds) throw new Error('knowledge_service is persistent; use agentsam dockerize --stop instead of --timeout.');
    opts = prepareKnowledgeDeployment(path.resolve(targetDir), { ...opts, appSlug: slugifyForDocker(opts.appSlug || 'agentsam-knowledge') });
  }
  if (cad) {
    opts = prepareCadDeployment(path.resolve(targetDir), { ...opts, appSlug: slugifyForDocker(opts.appSlug || 'agentsam-cad') });
  }
  const plan = buildDockerDeployPlan(appType, opts);
  const isolatedContext = knowledge || cad;
  const written = writeDockerFileSet(targetDir, plan.files, plan.hash, { overwrite: opts.overwrite, isolatedContext });
  const buildContext = knowledge ? stageKnowledgeContext(written.versionDir) : cad ? stageCadContext(written.versionDir) : targetDir;
  const manifest = writeManifestEntry(targetDir, plan.hash, {
    appType,
    appSlug: plan.slug,
    port: plan.hostPort,
    imageTag: plan.imageTag,
    latestTag: plan.latestTag,
    hashtag: plan.hashtag,
    dockerfilePath: written.dockerfilePath,
    composePath: written.composePath,
    createdAt: new Date().toISOString(),
    ...(cad ? { tools: opts.tools } : {}),
  });

  const result = { plan, written, manifest, build: null, run: null, tagRegistration: null, cancelAutoStop: null,
    ...(knowledge ? { configurationDir: opts.configurationDir, tokenFile: opts.tokenFile, volume: opts.volume } : {}),
    ...(cad ? { configurationDir: opts.configurationDir, tokenFile: opts.tokenFile, tools: opts.tools } : {}) };
  if (opts.writeOnly) return result;

  result.build = await buildDockerImage(buildContext, {
    dockerfilePath: written.dockerfilePath,
    imageTag: plan.imageTag,
    latestTag: plan.latestTag,
    noCache: opts.noCache,
    onData: opts.onData,
  });
  if (!result.build.ok || opts.buildOnly) return result;

  const labels = {
    'agentsam.managed': 'true',
    'agentsam.hash': plan.hash,
    'agentsam.type': appType,
    'agentsam.slug': plan.slug,
  };
  if (opts.timeoutSeconds) {
    labels['agentsam.expires-at'] = new Date(Date.now() + opts.timeoutSeconds * 1000).toISOString();
  }

  if (cad) {
    const replacement = await replaceManagedContainer(plan.slug, 'cad_service');
    if (!replacement.ok) {
      result.run = { ok: false, code: 1, stdout: '', stderr: replacement.stderr || `Could not prepare container name ${plan.slug}.` };
      return result;
    }
  }

  const cadResources = cad ? cadDefaultResources(opts.tools) : null;
  result.run = await runDockerContainer(plan.imageTag, {
    name: plan.slug,
    hostPort: plan.hostPort,
    containerPort: plan.containerPort,
    memory: opts.memory || (knowledge ? '768m' : cad ? cadResources.memory : undefined),
    cpus: opts.cpus || (cad ? cadResources.cpus : undefined),
    ...(knowledge ? { hostIp: '127.0.0.1', rm: false, extraArgs: knowledgeRunArguments(opts) } : {}),
    ...(cad ? { hostIp: '127.0.0.1', rm: false, extraArgs: cadRunArguments(opts) } : {}),
    labels,
    onData: opts.onData,
  });
  if (!result.run.ok) return result;

  if (knowledge) {
    const deadline = Date.now() + 15000;
    let ready = false;
    while (Date.now() < deadline && !ready) {
      try {
        const response = await fetch(`http://127.0.0.1:${plan.hostPort}/healthz`, { signal: AbortSignal.timeout(1000) });
        ready = response.ok && (await response.json()).service === 'agentsam-knowledge';
      } catch { /* Container is still starting. */ }
      if (!ready) await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!ready) {
      await stopDockerContainer(plan.slug);
      result.run = { ...result.run, ok: false, code: 1, stderr: `Knowledge service did not become ready; stopped ${plan.slug}. Inspect docker logs; data volume retained.` };
      return result;
    }
  }

  if (cad) {
    const deadline = Date.now() + 60000;
    let ready = false;
    let health = null;
    while (Date.now() < deadline && !ready) {
      try {
        const response = await fetch(`http://127.0.0.1:${plan.hostPort}/healthz`, { signal: AbortSignal.timeout(2000) });
        health = response.ok ? await response.json() : null;
        ready = health?.service === 'agentsam-cad';
      } catch { /* Native CAD packages can make first startup slightly slower. */ }
      if (!ready) await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!ready) {
      await stopDockerContainer(plan.slug);
      result.run = { ...result.run, ok: false, code: 1, stderr: `CAD service did not become ready; stopped ${plan.slug}. Inspect docker logs.` };
      return result;
    }
    result.health = health;
  }

  if (opts.timeoutSeconds) {
    result.cancelAutoStop = scheduleAutoStop(plan.slug, opts.timeoutSeconds, opts.onAutoStop);
  }

  if (opts.registerTag !== false) {
    result.tagRegistration = await registerDockerTag({
      hashtag: plan.hashtag,
      repo: opts.repoLabel || path.basename(targetDir),
      ref: plan.imageTag,
      note: `agentsam dockerize --type ${appType} --port ${plan.hostPort} (${targetDir})`,
    });
  }

  return result;
}
