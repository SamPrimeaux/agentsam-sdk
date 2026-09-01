import path from 'node:path';
import {
  DOCKER_APP_TYPES,
  DOCKER_APP_TYPE_LABELS,
  dockerize,
  listManagedContainers,
  stopDockerContainer,
} from '../lib/dockerize.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    timeoutSeconds: undefined,
    list: false,
    stopName: '',
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
    else if (a === '--timeout') opts.timeoutSeconds = Number(argv[++i]) || undefined;
    else if (a === '--list') opts.list = true;
    else if (a === '--stop') opts.stopName = argv[++i] || '';
  }
  return opts;
}

export function printDockerizeHelp() {
  console.log(`
  agentsam dockerize — generate + build + run a fresh, ephemeral local Docker container

  Usage:
    agentsam dockerize --type <static|vite_react|node_service|wrangler_dev> [options]
    agentsam dockerize --list
    agentsam dockerize --stop <name>

  Options:
    --type <name>     App shape (default: node_service)
    --name <slug>     Image/container name (default: current directory name)
    --port <n>        Host port (default depends on --type)
    --cwd <path>      Target directory (default: current directory)
    --write-only      Only generate files under .agentsam/docker/<hash>/
    --build-only      Generate + build image, skip run
    --no-cache        Build with --no-cache
    --overwrite       Overwrite the shared .dockerignore at project root
    --timeout <secs>  Auto-stop the container after N seconds (process stays alive until then)
    --list            Show every agentsam-managed container (running or stopped), any project
    --stop <name>     Stop a running container by name

  App types:
${DOCKER_APP_TYPES.map((t) => `    ${t.padEnd(14)} ${DOCKER_APP_TYPE_LABELS[t].label} — ${DOCKER_APP_TYPE_LABELS[t].sublabel}`).join('\n')}

  Every build is content-hash versioned: identical Dockerfile+compose -> identical hash ->
  identical image tag (<slug>:<hash>, plus a mutable <slug>:latest). Files land under
  .agentsam/docker/<hash>/ instead of clobbering project root on every run, and each
  successful build is registered as a #hashtag in this SDK's cross-repo ledger (bin/tag).

  Every run is ephemeral by default: --rm + capped memory/cpu. Nothing auto-stops unless
  you pass --timeout — the container keeps running until you (or --timeout) stop it. Every
  run prints the exact stop command so nothing is ever silently left running.
  `);
}

function printManagedContainers(containers) {
  if (containers.length === 0) {
    console.log('\n  No agentsam-managed containers found.\n');
    return;
  }
  console.log(`\n  ${containers.length} agentsam-managed container(s):\n`);
  for (const c of containers) {
    console.log(`  ${c.Names.padEnd(24)} ${c.Status.padEnd(28)} ${c.Image}`);
  }
  console.log('');
}

export async function runDockerize(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    printDockerizeHelp();
    return;
  }

  const opts = parseDockerizeArgs(argv);

  if (opts.list) {
    const { ok, containers, stderr } = await listManagedContainers();
    if (!ok) {
      console.error(`\n  ✗ Could not list containers: ${stderr}\n`);
      process.exit(1);
    }
    printManagedContainers(containers);
    return;
  }

  if (opts.stopName) {
    const res = await stopDockerContainer(opts.stopName);
    if (!res.ok) {
      console.error(`\n  ✗ Could not stop "${opts.stopName}": ${res.stderr}\n`);
      process.exit(1);
    }
    console.log(`\n  ✓ Stopped ${opts.stopName}\n`);
    return;
  }

  if (!DOCKER_APP_TYPES.includes(opts.type)) {
    console.error(`\n  ✗ Unknown --type "${opts.type}". Expected one of: ${DOCKER_APP_TYPES.join(', ')}\n`);
    process.exit(1);
  }

  const appSlug = opts.name || path.basename(opts.cwd);
  const meta = DOCKER_APP_TYPE_LABELS[opts.type];

  console.log(`\n  agentsam dockerize — ${meta.label} (${meta.sublabel})`);
  console.log(`  target: ${opts.cwd}`);
  console.log(`  slug:   ${appSlug}\n`);

  let result;
  try {
    result = await dockerize(opts.cwd, opts.type, {
      appSlug,
      port: opts.port,
      writeOnly: opts.writeOnly,
      buildOnly: opts.buildOnly,
      noCache: opts.noCache,
      overwrite: opts.overwrite,
      timeoutSeconds: opts.timeoutSeconds,
      onData: (chunk) => process.stdout.write(chunk),
      onAutoStop: () => console.log(`\n  ⏱  --timeout reached — auto-stopped ${appSlug}\n`),
    });
  } catch (e) {
    console.error(`\n  ✗ ${e?.message || e}\n`);
    process.exit(1);
  }

  console.log(`\n  ✓ Wrote: ${path.relative(opts.cwd, result.written.dockerfilePath)}, docker-compose.yml, .dockerignore`);
  console.log(`  hash:   ${result.plan.hash}  (${result.plan.hashtag})`);

  if (opts.writeOnly) {
    console.log('  (--write-only: skipped build/run)\n');
    return;
  }

  if (!result.build?.ok) {
    console.error(`\n  ✗ docker build failed (exit ${result.build?.code})\n`);
    process.exit(1);
  }
  console.log(`  ✓ Built ${result.plan.imageTag}  (also tagged ${result.plan.latestTag})`);

  if (opts.buildOnly) {
    console.log('  (--build-only: skipped run)\n');
    return;
  }

  if (!result.run?.ok) {
    console.error(`\n  ✗ docker run failed (exit ${result.run?.code})\n${result.run?.stderr || ''}\n`);
    process.exit(1);
  }
  console.log(`  ✓ Running — http://localhost:${result.plan.hostPort}  (container: ${result.plan.slug})`);

  if (result.tagRegistration?.ok) {
    console.log(`  ✓ Registered ${result.plan.hashtag} in the cross-repo tag ledger`);
  } else if (result.tagRegistration?.skipped) {
    console.log(`  (tag ledger not available — skipped registering ${result.plan.hashtag})`);
  }

  if (opts.timeoutSeconds) {
    console.log(`\n  Auto-stopping in ${opts.timeoutSeconds}s. Stop early with: docker stop ${result.plan.slug}\n`);
    await sleep(opts.timeoutSeconds * 1000 + 200);
    return;
  }

  console.log(`\n  Stop anytime with: docker stop ${result.plan.slug}\n`);
}
