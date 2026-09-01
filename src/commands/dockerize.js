import path from 'node:path';
import { DOCKER_APP_TYPES, DOCKER_APP_TYPE_LABELS, dockerize } from '../lib/dockerize.js';

export function parseDockerizeArgs(argv) {
  const opts = {
    type: 'node_service',
    name: '',
    port: undefined,
    cwd: process.cwd(),
    writeOnly: false,
    buildOnly: false,
    noCache: false,
    overwrite: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--type') opts.type = argv[++i] || opts.type;
    else if (a === '--name') opts.name = argv[++i] || '';
    else if (a === '--port') opts.port = Number(argv[++i]) || undefined;
    else if (a === '--cwd') opts.cwd = path.resolve(argv[++i] || opts.cwd);
    else if (a === '--write-only') opts.writeOnly = true;
    else if (a === '--build-only') opts.buildOnly = true;
    else if (a === '--no-cache') opts.noCache = true;
    else if (a === '--overwrite') opts.overwrite = true;
  }
  return opts;
}

export function printDockerizeHelp() {
  console.log(`
  agentsam dockerize — generate + build + run a fresh, ephemeral local Docker container

  Usage:
    agentsam dockerize --type <static|vite_react|node_service|wrangler_dev> [options]

  Options:
    --type <name>     App shape (default: node_service)
    --name <slug>     Image/container name (default: current directory name)
    --port <n>        Host port (default depends on --type)
    --cwd <path>      Target directory (default: current directory)
    --write-only      Only generate Dockerfile/.dockerignore/docker-compose.yml
    --build-only      Generate + build image, skip run
    --no-cache        Build with --no-cache
    --overwrite       Overwrite existing Dockerfile/.dockerignore/docker-compose.yml

  App types:
${DOCKER_APP_TYPES.map((t) => `    ${t.padEnd(14)} ${DOCKER_APP_TYPE_LABELS[t].label} — ${DOCKER_APP_TYPE_LABELS[t].sublabel}`).join('\n')}

  Every run is generated fresh (assumes nothing pre-exists) and runs ephemeral by
  default: --rm + capped memory/cpu, so nothing lingers or bills you after it stops.
  `);
}

export async function runDockerize(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    printDockerizeHelp();
    return;
  }

  const opts = parseDockerizeArgs(argv);

  if (!DOCKER_APP_TYPES.includes(opts.type)) {
    console.error(`\n  ✗ Unknown --type "${opts.type}". Expected one of: ${DOCKER_APP_TYPES.join(', ')}\n`);
    process.exit(1);
  }

  const appSlug = opts.name || path.basename(opts.cwd);
  const meta = DOCKER_APP_TYPE_LABELS[opts.type];

  console.log(`\n  agentsam dockerize — ${meta.label} (${meta.sublabel})`);
  console.log(`  target: ${opts.cwd}`);
  console.log(`  image:  ${appSlug}:local\n`);

  let result;
  try {
    result = await dockerize(opts.cwd, opts.type, {
      appSlug,
      port: opts.port,
      writeOnly: opts.writeOnly,
      buildOnly: opts.buildOnly,
      noCache: opts.noCache,
      overwrite: opts.overwrite,
      onData: (chunk) => process.stdout.write(chunk),
    });
  } catch (e) {
    console.error(`\n  ✗ ${e?.message || e}\n`);
    process.exit(1);
  }

  console.log(`\n  ✓ Wrote: ${result.written.map((p) => path.basename(p)).join(', ')}`);

  if (opts.writeOnly) {
    console.log('  (--write-only: skipped build/run)\n');
    return;
  }

  if (!result.build?.ok) {
    console.error(`\n  ✗ docker build failed (exit ${result.build?.code})\n`);
    process.exit(1);
  }
  console.log(`  ✓ Built ${result.plan.imageTag}`);

  if (opts.buildOnly) {
    console.log('  (--build-only: skipped run)\n');
    return;
  }

  if (!result.run?.ok) {
    console.error(`\n  ✗ docker run failed (exit ${result.run?.code})\n${result.run?.stderr || ''}\n`);
    process.exit(1);
  }
  console.log(`  ✓ Running — http://localhost:${result.plan.hostPort}  (container: ${result.plan.slug}, --rm, capped resources)\n`);
}
