import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CONFIG_PATH, defaultConfig, readConfig } from '../knowledge/config.js';

const sdkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtimeFiles = () => {
  const files = ['services/knowledge/package.json', 'services/knowledge/package-lock.json', 'src/lib/merkle/hash.js'];
  const walk = dir => { for (const entry of fs.readdirSync(path.join(sdkRoot, dir), { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(file); else if (entry.isFile() && /\.(js|sql)$/.test(entry.name)) files.push(file);
  } };
  walk('src/knowledge'); return files.sort();
};

export function generateKnowledgeDocker(opts = {}) {
  const slug = opts.appSlug || 'agentsam-knowledge', port = opts.port ?? 8792;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('Knowledge service name must be a lowercase Docker slug.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be 1..65535.');
  const digest = createHash('sha256');
  for (const file of runtimeFiles()) digest.update(file).update('\0').update(fs.readFileSync(path.join(sdkRoot, file))).update('\0');
  const dockerfile = `# AgentSam knowledge runtime SHA-256: ${digest.digest('hex')}
FROM node:22.22.2-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY src ./src
ENV NODE_ENV=production PORT=${port} GIT_OPTIONAL_LOCKS=0
EXPOSE ${port}
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/knowledge/service/server.js"]
`;
  const volume = opts.volume || `${slug}-data`;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(volume)) throw new Error('Invalid state volume name.');
  const configMount = { type: 'bind', source: opts.configurationDir || `../knowledge/${slug}`, target: '/config', read_only: true };
  const mounts = [configMount, { type: 'volume', source: 'knowledge_data', target: '/data' }, ...(opts.mounts || [])];
  const q = JSON.stringify;
  const compose = `services:
  ${slug}:
    build:
      context: ./context
      dockerfile: ../Dockerfile
    container_name: ${slug}
    ports: [${q(`127.0.0.1:${port}:${port}`)}]
    restart: unless-stopped
    init: true
    read_only: true
    cap_drop: [ALL]
    cap_add: [CHOWN, SETUID, SETGID]
    security_opt: ["no-new-privileges:true"]
    mem_limit: ${q(opts.memory || '768m')}
    cpus: ${q(String(opts.cpus || '1'))}
    pids_limit: 128
    tmpfs: ["/tmp:rw,noexec,nosuid,size=64m"]
    environment:
      AGENTSAM_RUNTIME_UID: ${q(String(opts.runtimeUid ?? process.getuid?.() ?? 1000))}
      AGENTSAM_RUNTIME_GID: ${q(String(opts.runtimeGid ?? process.getgid?.() ?? 1000))}
      GIT_CONFIG_COUNT: "1"
      GIT_CONFIG_KEY_0: safe.directory
      GIT_CONFIG_VALUE_0: "*"
    labels:
      agentsam.managed: "true"
      agentsam.type: knowledge_service
    volumes:
${mounts.map(m => `      - ${q(m)}`).join('\n')}
volumes:
  knowledge_data:
    name: ${q(volume)}
`;
  return { dockerfile, compose, dockerignore: 'node_modules\n.git\n.env*\n.agentsam\n' };
}

/** Creates only deployment config; repositories are never initialized or modified. */
export function prepareKnowledgeDeployment(targetDir, opts) {
  const slug = opts.appSlug || 'agentsam-knowledge';
  if (!opts.repositories?.length) throw new Error('knowledge_service requires --repository alias=/absolute/repository (repeatable).');
  const configurationDir = path.join(targetDir, '.agentsam/docker/knowledge', slug);
  const registrations = Object.create(null), mounts = [], hostRoots = Object.create(null);
  const metadataFile = path.join(configurationDir, 'host-roots.json'), registryFile = path.join(configurationDir, 'repositories.json');
  const oldRoots = fs.existsSync(metadataFile) ? JSON.parse(fs.readFileSync(metadataFile, 'utf8')) : {};
  const oldRegistry = fs.existsSync(registryFile) ? JSON.parse(fs.readFileSync(registryFile, 'utf8')) : {};
  for (const spec of opts.repositories) {
    const separator = spec.indexOf('='), name = spec.slice(0, separator), inputRoot = spec.slice(separator + 1);
    if (separator < 1 || !/^[a-z][a-z0-9_-]{0,47}$/.test(name) || Object.hasOwn(registrations, name)) throw new Error('Use unique --repository aliases: alias=/absolute/path.');
    const root = fs.realpathSync(path.resolve(targetDir, inputRoot));
    if (!fs.statSync(root).isDirectory() || /[,\n\r]/.test(root)) throw new Error('Repository must be a directory with no commas or newlines in its path.');
    if (Object.hasOwn(oldRoots, name) && oldRoots[name] !== root) throw new Error(`Alias ${name} already identifies another repository. Choose a new alias.`);
    const config = oldRegistry[name]?.config || (fs.existsSync(path.join(root, CONFIG_PATH)) ? readConfig(root) : defaultConfig());
    if (config.storage.driver !== 'sqlite') throw new Error('knowledge_service currently requires a SQLite repository profile.');
    registrations[name] = { root: `/repositories/${name}`, config }; hostRoots[name] = root;
    mounts.push({ type: 'bind', source: root, target: `/repositories/${name}`, read_only: true });
    // Linked worktrees have absolute gitdir pointers outside their source mount.
    if (fs.existsSync(path.join(root, '.git')) && fs.statSync(path.join(root, '.git')).isFile()) {
      const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim();
      if (/[,\n\r]/.test(common)) throw new Error('Unsupported Git metadata path.');
      if (!mounts.some(m => m.target === common)) mounts.push({ type: 'bind', source: common, target: common, read_only: true });
    }
  }
  fs.mkdirSync(configurationDir, { recursive: true, mode: 0o700 });
  for (const dir of [configurationDir, path.join(targetDir, '.agentsam/docker')]) {
    try { fs.writeFileSync(path.join(dir, '.gitignore'), '*\n', { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  for (const [file, value] of [[metadataFile, hostRoots], [registryFile, registrations]]) fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  const tokenFile = path.join(configurationDir, 'service.token');
  try { fs.writeFileSync(tokenFile, randomBytes(32).toString('hex') + '\n', { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  if (/[,\n\r]/.test(configurationDir)) throw new Error('Deployment path cannot contain commas or newlines.');
  return { ...opts, configurationDir, mounts, tokenFile, volume: opts.volume || `${slug}-data` };
}

export function stageKnowledgeContext(versionDir) {
  const context = path.join(versionDir, 'context');
  // A positive file allowlist keeps host repositories, API keys and local indexes out of images.
  for (const relative of runtimeFiles()) {
    const target = path.join(context, relative.startsWith('services/knowledge/') ? path.basename(relative) : relative);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(sdkRoot, relative), target);
  }
  return context;
}

export function knowledgeRunArguments(opts) {
  const mounts = [{ type: 'bind', source: opts.configurationDir, target: '/config', read_only: true },
    { type: 'volume', source: opts.volume, target: '/data' }, ...opts.mounts];
  return ['--restart', 'unless-stopped', '--init', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=128',
    '--cap-add=CHOWN', '--cap-add=SETUID', '--cap-add=SETGID',
    '-e', `AGENTSAM_RUNTIME_UID=${process.getuid?.() ?? 1000}`, '-e', `AGENTSAM_RUNTIME_GID=${process.getgid?.() ?? 1000}`,
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m', '--log-opt=max-size=10m', '--log-opt=max-file=3',
    '-e', 'GIT_CONFIG_COUNT=1', '-e', 'GIT_CONFIG_KEY_0=safe.directory', '-e', 'GIT_CONFIG_VALUE_0=*',
    ...mounts.flatMap(m => ['--mount', `type=${m.type},src=${m.source},dst=${m.target}${m.read_only ? ',readonly' : ''}`])];
}
