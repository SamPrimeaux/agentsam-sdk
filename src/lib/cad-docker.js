import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const sdkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CAD_SERVER_FILE = 'services/cad/server.py';

export const CAD_TOOLS = Object.freeze(['openscad', 'freecad', 'blender']);

const APT_PACKAGES = Object.freeze({
  openscad: ['openscad', 'xvfb', 'xauth'],
  freecad: ['freecad'],
  blender: ['blender'],
});

export function normalizeCadTools(input) {
  const raw = Array.isArray(input) ? input : String(input || 'openscad').split(',');
  const expanded = raw.flatMap(value => String(value).split(',')).map(value => value.trim().toLowerCase()).filter(Boolean);
  const values = expanded.includes('all') ? [...CAD_TOOLS] : expanded;
  const unique = [...new Set(values.length ? values : ['openscad'])];
  for (const tool of unique) {
    if (!CAD_TOOLS.includes(tool)) throw new Error(`Unknown CAD tool "${tool}". Expected: ${CAD_TOOLS.join(', ')}, or all.`);
  }
  return CAD_TOOLS.filter(tool => unique.includes(tool));
}

export function cadDefaultResources(tools) {
  const selected = normalizeCadTools(tools);
  if (selected.includes('blender')) return { memory: '4g', cpus: '2' };
  if (selected.includes('freecad')) return { memory: '2g', cpus: '2' };
  return { memory: '1g', cpus: '1' };
}

function runtimeDigest() {
  const digest = createHash('sha256');
  digest.update(CAD_SERVER_FILE).update('\0').update(fs.readFileSync(path.join(sdkRoot, CAD_SERVER_FILE))).update('\0');
  return digest.digest('hex');
}

export function generateCadDocker(opts = {}) {
  const slug = opts.appSlug || 'agentsam-cad';
  const port = opts.port ?? 8793;
  const tools = normalizeCadTools(opts.tools);
  const resources = cadDefaultResources(tools);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('CAD service name must be a lowercase Docker slug.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be 1..65535.');

  const packages = ['python3', 'ca-certificates', 'passwd', ...new Set(tools.flatMap(tool => APT_PACKAGES[tool]))];
  const q = JSON.stringify;
  const dockerfile = `# AgentSam CAD runtime SHA-256: ${runtimeDigest()}
# Tools: ${tools.join(', ')}
FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \\
 && apt-get install -y --no-install-recommends ${packages.join(' ')} \\
 && rm -rf /var/lib/apt/lists/* \\
 && useradd --system --uid 10001 --create-home --home-dir /home/cad cad \\
 && mkdir -p /srv /work \\
 && chown -R cad:cad /work
WORKDIR /srv
COPY server.py /srv/server.py
ENV PORT=${port} AGENTSAM_CAD_TOKEN_FILE=/config/service.token AGENTSAM_CAD_WORK_ROOT=/work AGENTSAM_CAD_TOOLS=${tools.join(',')} QT_QPA_PLATFORM=offscreen PYTHONUNBUFFERED=1 HOME=/tmp/home XDG_CACHE_HOME=/tmp/cache XDG_CONFIG_HOME=/tmp/config
EXPOSE ${port}
USER cad
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=4 CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:${port}/healthz', timeout=3).read()"
CMD ["python3", "/srv/server.py"]
`;

  const configDir = opts.configurationDir || `../cad/${slug}`;
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
    security_opt: ["no-new-privileges:true"]
    mem_limit: ${q(opts.memory || resources.memory)}
    cpus: ${q(String(opts.cpus || resources.cpus))}
    pids_limit: 256
    tmpfs:
      - "/tmp:rw,noexec,nosuid,size=128m"
      - "/work:rw,noexec,nosuid,size=512m,mode=1777"
    environment:
      AGENTSAM_CAD_TOKEN_FILE: /config/service.token
      AGENTSAM_CAD_TOOLS: ${q(tools.join(','))}
    labels:
      agentsam.managed: "true"
      agentsam.type: cad_service
      agentsam.cad.tools: ${q(tools.join(','))}
    volumes:
      - ${q({ type: 'bind', source: configDir, target: '/config', read_only: true })}
`;
  return { dockerfile, compose, dockerignore: '.git\n.env*\n.agentsam\nnode_modules\ndist\nbuild\n', tools };
}

export function prepareCadDeployment(targetDir, opts = {}) {
  const slug = opts.appSlug || 'agentsam-cad';
  const tools = normalizeCadTools(opts.tools);
  const configurationDir = path.join(targetDir, '.agentsam/docker/cad', slug);
  fs.mkdirSync(configurationDir, { recursive: true, mode: 0o700 });
  for (const dir of [configurationDir, path.join(targetDir, '.agentsam/docker')]) {
    try {
      fs.writeFileSync(path.join(dir, '.gitignore'), '*\n', { flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  const tokenFile = path.join(configurationDir, 'service.token');
  try {
    fs.writeFileSync(tokenFile, randomBytes(32).toString('hex') + '\n', { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  fs.writeFileSync(path.join(configurationDir, 'service.json'), JSON.stringify({
    service: 'agentsam-cad',
    slug,
    tools,
    port: opts.port ?? 8793,
    createdAt: new Date().toISOString(),
  }, null, 2) + '\n', { mode: 0o600 });
  if (/[,\n\r]/.test(configurationDir)) throw new Error('CAD deployment path cannot contain commas or newlines.');
  return { ...opts, configurationDir, tokenFile, tools };
}

export function stageCadContext(versionDir) {
  const context = path.join(versionDir, 'context');
  fs.mkdirSync(context, { recursive: true });
  fs.copyFileSync(path.join(sdkRoot, CAD_SERVER_FILE), path.join(context, 'server.py'));
  return context;
}

export function cadRunArguments(opts = {}) {
  const config = opts.configurationDir;
  if (!config) throw new Error('CAD service configuration directory is required.');
  return [
    '--restart', 'unless-stopped',
    '--init',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--pids-limit=256',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=128m',
    '--tmpfs', '/work:rw,noexec,nosuid,size=512m,mode=1777',
    '--log-opt=max-size=10m',
    '--log-opt=max-file=3',
    '-e', 'AGENTSAM_CAD_TOKEN_FILE=/config/service.token',
    '-e', `AGENTSAM_CAD_TOOLS=${normalizeCadTools(opts.tools).join(',')}`,
    '--mount', `type=bind,src=${config},dst=/config,readonly`,
  ];
}
