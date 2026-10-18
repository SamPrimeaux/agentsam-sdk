import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const sdkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CAD_SERVER_FILE = 'services/cad/server.py';

export const CAD_TOOLS = Object.freeze(['openscad', 'freecad', 'blender', 'ifc', 'media', 'occt']);

// Pinned so every build, on any machine, gets the same toolchain. ifcopenshell 0.9.x wheels need a newer
// glibc than Debian 12 ships; 0.8.4.post1 is the newest that imports on bookworm. The distro Node is too
// old for current glTF tooling, so Node is installed from a checksum-verified tarball.
export const CAD_PINS = Object.freeze({ ifcopenshell: '0.8.4.post1', ezdxf: '1.4.5', gltfTransformCli: '4.5.1', node: 'v20.20.2' });

const APT_PACKAGES = Object.freeze({
  openscad: ['openscad', 'xvfb', 'xauth'],
  freecad: ['freecad'],
  blender: ['blender'],
  ifc: ['python3-venv'],
  media: ['ffmpeg'],
  occt: ['libocct-data-exchange-7.6', 'libocct-modeling-algorithms-7.6', 'libocct-modeling-data-7.6', 'libocct-foundation-7.6'],
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
  for (const extra of ['services/cad/provision/install_node.py', 'services/cad/occt/main.cpp', 'services/cad/occt/CMakeLists.txt']) {
    const file = path.join(sdkRoot, extra);
    if (fs.existsSync(file)) digest.update(extra).update('\0').update(fs.readFileSync(file)).update('\0');
  }
  digest.update(JSON.stringify(CAD_PINS));
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
  const copyLines = ['COPY server.py /srv/server.py'];
  if (tools.includes('freecad')) copyLines.push('COPY freecad/ /srv/freecad/');
  if (tools.includes('blender')) copyLines.push('COPY blender/ /srv/blender/');
  const provision = [];
  if (tools.includes('ifc')) {
    provision.push(`RUN python3 -m venv /opt/agentsam-venv \\\n && /opt/agentsam-venv/bin/pip install --no-cache-dir ifcopenshell==${CAD_PINS.ifcopenshell} ezdxf==${CAD_PINS.ezdxf}`);
  }
  if (tools.includes('media')) {
    provision.push('COPY provision/install_node.py /tmp/install_node.py');
    provision.push(`RUN python3 /tmp/install_node.py ${CAD_PINS.node} /opt/node \\\n && PATH=/opt/node/bin:$PATH npm install -g --no-audit --no-fund @gltf-transform/cli@${CAD_PINS.gltfTransformCli} \\\n && rm -rf /tmp/install_node.py /root/.npm`);
  }
  if (tools.includes('occt')) provision.push('COPY --from=occt-build /build/agentsam-occt /usr/local/bin/agentsam-occt');
  const extraEnv = [
    tools.includes('media') ? 'PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' : '',
    tools.includes('ifc') ? 'AGENTSAM_CAD_PYTHON=/opt/agentsam-venv/bin/python' : '',
  ].filter(Boolean);
  const occtStage = tools.includes('occt') ? `FROM debian:bookworm-slim AS occt-build
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \\
 && apt-get install -y --no-install-recommends ca-certificates g++ cmake ninja-build libocct-data-exchange-dev libocct-modeling-algorithms-dev libocct-modeling-data-dev libocct-foundation-dev \\
 && rm -rf /var/lib/apt/lists/*
COPY occt/ /src/occt/
RUN cmake -S /src/occt -B /build -G Ninja -DCMAKE_BUILD_TYPE=Release -DAGENTSAM_OCCT_PREFIX=/usr -DAGENTSAM_OCCT_LIBDIR=/usr/lib/$(gcc -dumpmachine) \\
 && cmake --build /build

` : '';

  const dockerfile = `# AgentSam CAD runtime SHA-256: ${runtimeDigest()}
# Tools: ${tools.join(', ')}
${occtStage}FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \\
 && apt-get install -y --no-install-recommends ${packages.join(' ')} \\
 && rm -rf /var/lib/apt/lists/* \\
 && useradd --system --uid 10001 --create-home --home-dir /home/cad cad \\
 && mkdir -p /srv /work \\
 && chown -R cad:cad /work
${provision.length ? provision.join('\n') + '\n' : ''}WORKDIR /srv
${copyLines.join('\n')}
ENV${extraEnv.length ? ' ' + extraEnv.join(' ') : ''} PORT=${port} AGENTSAM_CAD_TOKEN_FILE=/config/service.token AGENTSAM_CAD_WORK_ROOT=/work AGENTSAM_CAD_TOOLS=${tools.join(',')} QT_QPA_PLATFORM=offscreen PYTHONUNBUFFERED=1 HOME=/tmp/home XDG_CACHE_HOME=/tmp/cache XDG_CONFIG_HOME=/tmp/config
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

export function stageCadContext(versionDir, opts = {}) {
  const context = path.join(versionDir, 'context');
  fs.mkdirSync(context, { recursive: true });
  fs.copyFileSync(path.join(sdkRoot, CAD_SERVER_FILE), path.join(context, 'server.py'));
  const tools = opts.tools ? normalizeCadTools(opts.tools) : [];
  if (tools.includes('freecad')) {
    const freecadAdapter = path.join(sdkRoot, 'services/cad/freecad/adapter.py');
    if (fs.existsSync(freecadAdapter)) {
      fs.mkdirSync(path.join(context, 'freecad'), { recursive: true });
      fs.copyFileSync(freecadAdapter, path.join(context, 'freecad', 'adapter.py'));
    }
  }
  if (tools.includes('media')) {
    fs.mkdirSync(path.join(context, 'provision'), { recursive: true });
    fs.copyFileSync(path.join(sdkRoot, 'services/cad/provision/install_node.py'), path.join(context, 'provision', 'install_node.py'));
  }
  if (tools.includes('occt')) {
    fs.mkdirSync(path.join(context, 'occt'), { recursive: true });
    for (const file of ['main.cpp', 'CMakeLists.txt']) fs.copyFileSync(path.join(sdkRoot, 'services/cad/occt', file), path.join(context, 'occt', file));
  }
  if (tools.includes('blender')) {
    const blenderAdapter = path.join(sdkRoot, 'services/cad/blender/adapter.py');
    if (fs.existsSync(blenderAdapter)) {
      fs.mkdirSync(path.join(context, 'blender'), { recursive: true });
      fs.copyFileSync(blenderAdapter, path.join(context, 'blender', 'adapter.py'));
    }
  }
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
