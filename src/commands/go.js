import path from 'node:path';
import { cancel, intro, isCancel, outro, select } from '@clack/prompts';
import pc from 'picocolors';
import {
  DEFAULT_PRODUCT,
  discoverGoRuntime,
  resolveProductRoot,
  ensureProductContract,
  preflightToolchain,
  buildGoProduct,
  deployGoCloudflare,
  verifyGoProduct,
  readLatestStatus,
  runGoTests,
  runGoVet,
  runGoBuild,
} from '../go/index.js';
import { renderGoShipScenery, renderArchitectureExplorer } from '../ui/wireframes.js';

function parse(argv = []) {
  const out = {
    subcommand: null,
    product: DEFAULT_PRODUCT,
    cwd: process.cwd(),
    json: false,
    cloudflare: false,
    dryRun: false,
    skipDeploy: false,
    skipRegistry: false,
    help: false,
    positionals: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--skip-deploy') out.skipDeploy = true;
    else if (arg === '--skip-registry') out.skipRegistry = true;
    else if (arg === '--cwd') out.cwd = path.resolve(argv[++i] || out.cwd);
    else if (arg === '--cloudflare') {
      out.cloudflare = true;
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        out.product = next;
        i += 1;
      }
    } else if (['status', 'inspect', 'build', 'test', 'verify', 'deploy', 'products', 'runtime', 'dev', 'logs', 'explore'].includes(arg) && !out.subcommand) {
      out.subcommand = arg;
    } else if (!arg.startsWith('-')) {
      out.positionals.push(arg);
    } else {
      throw new Error(`unknown go option: ${arg}`);
    }
  }

  if (!out.subcommand && out.positionals[0] && !out.cloudflare) {
    const maybe = out.positionals[0];
    if (['status', 'inspect', 'build', 'test', 'verify', 'deploy', 'products', 'runtime', 'explore'].includes(maybe)) {
      out.subcommand = maybe;
      out.positionals = out.positionals.slice(1);
    }
  }
  if (out.positionals[0] && out.product === DEFAULT_PRODUCT) {
    out.product = out.positionals[0];
  }
  if (out.cloudflare && !out.subcommand) out.subcommand = 'cloudflare-ship';
  if (!out.subcommand) out.subcommand = 'menu';
  return out;
}

const HELP = `Agent Sam · Go

  agentsam go                         Interactive status / actions (TTY)
  agentsam go status [--json]         Runtime + product status
  agentsam go explore                 Architecture + operation wireframes (ANSI)
  agentsam go inspect [--json]        Discover Go source / toolchain
  agentsam go test                    go test ./...
  agentsam go build                   go build + build receipt
  agentsam go verify [name] [--json]  Local tests + optional live probe
  agentsam go --cloudflare [name]      Discover → build → validate → deploy → probe → D1 → receipt
  agentsam go deploy [name] --cloudflare

  First happy path:
    agentsam go --cloudflare agentsam-go-worker

  Flags:
    --json            Machine-readable output
    --dry-run         Validate and print plan without deploying
    --skip-deploy     Build/test/receipt only (no Wrangler deploy)
    --skip-registry   Skip remote D1 agentsam_products upsert
    --cwd <path>      Repository root override
`;

function writeHumanSteps(lines, write) {
  write('\n  Agent Sam · Go\n\n');
  for (const line of lines) write(`  ${line}\n`);
  write('\n');
}

export async function runGo(argv = [], options = {}) {
  const args = parse(argv);
  const write = options.write || ((value) => process.stdout.write(value));
  if (args.help) {
    write(HELP);
    return { ok: true, help: true };
  }

  const discovery = discoverGoRuntime(args.cwd);
  const productRoot = resolveProductRoot(discovery, args.product);
  const runtimeRoot = discovery.runtime?.runtimeRoot || path.join(productRoot, 'runtime');

  if (args.subcommand === 'menu' && process.stdout.isTTY && !args.json) {
    return runInteractiveMenu({ discovery, productRoot, runtimeRoot, args, write });
  }

  if (args.subcommand === 'inspect' || args.subcommand === 'runtime') {
    const payload = { ok: true, discovery, productRoot, runtimeRoot };
    write(args.json ? `${JSON.stringify(payload)}\n` : `${JSON.stringify(payload, null, 2)}\n`);
    return payload;
  }

  if (args.subcommand === 'explore') {
    const scenery = renderGoShipScenery({
      product: args.product,
      discovery,
      deploy: { url: readLatestStatus(productRoot).deployment?.url, receipt: readLatestStatus(productRoot).deployment, probes: { ok: readLatestStatus(productRoot).deployment?.health === 'healthy' } },
      build: { receipt: readLatestStatus(productRoot).build },
    });
    if (args.json) {
      write(`${JSON.stringify({ ok: true, scenery: 'ansi', product: args.product })}\n`);
    } else {
      write(`\n${scenery}\n\n`);
      write(`${pc.dim('Wireframes are reasoning scenery for the inline CLI — not pixel mockups.')}\n\n`);
    }
    return { ok: true, explore: true };
  }

  if (args.subcommand === 'status' || args.subcommand === 'products') {
    const latest = readLatestStatus(productRoot);
    const status = {
      ok: true,
      product: args.product,
      discovery: {
        go: discovery.go,
        runtime: discovery.runtime
          ? { module: discovery.runtime.module, runtimeRoot: discovery.runtime.runtimeRoot, entry: discovery.runtime.entry }
          : null,
        product_exists: discovery.product_exists,
      },
      build: latest.build,
      deployment: latest.deployment,
      registry: latest.product,
    };
    if (args.json) write(`${JSON.stringify(status)}\n`);
    else {
      writeHumanSteps([
        discovery.go?.ok ? `✓ Go ${discovery.go.goversion || discovery.go.version}` : '✗ Go toolchain missing',
        discovery.runtime ? `✓ AgentSam Go source · ${discovery.runtime.module}` : '✗ Go runtime not discovered',
        status.deployment?.url ? `✓ deployed · ${status.deployment.url} · ${status.deployment.health}` : '· no deployment receipt yet',
      ], write);
      write(`${JSON.stringify(status, null, 2)}\n`);
    }
    return status;
  }

  if (args.subcommand === 'test') {
    const tests = runGoTests(runtimeRoot);
    const vet = runGoVet(runtimeRoot);
    const payload = { ok: tests.ok && vet.ok, tests, vet };
    write(args.json ? `${JSON.stringify(payload)}\n` : `${tests.stdout}${tests.stderr}${vet.stdout}${vet.stderr}`);
    if (!payload.ok) {
      const err = new Error('go_test_failed');
      err.reported = true;
      throw err;
    }
    return payload;
  }

  if (args.subcommand === 'build') {
    ensureProductContract(productRoot);
    const result = buildGoProduct({
      productRoot,
      runtimeRoot,
      repositoryRoot: discovery.repository_root,
      dryRun: args.dryRun,
    });
    write(args.json ? `${JSON.stringify(result)}\n` : `✓ build receipt · ${result.receiptPath}\n`);
    return result;
  }

  if (args.subcommand === 'verify') {
    const result = await verifyGoProduct({
      productRoot,
      runtimeRoot,
      skipLive: args.dryRun || args.skipDeploy,
    });
    write(args.json ? `${JSON.stringify(result)}\n` : `${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) {
      const err = new Error('go_verify_failed');
      err.reported = true;
      throw err;
    }
    return result;
  }

  if (args.subcommand === 'deploy' || args.subcommand === 'cloudflare-ship') {
    return shipCloudflare({ discovery, productRoot, runtimeRoot, args, write });
  }

  write(HELP);
  return { ok: true, help: true };
}

async function shipCloudflare({ discovery, productRoot, runtimeRoot, args, write }) {
  const steps = [];
  const note = (line) => {
    steps.push(line);
    if (!args.json) write(`  ${line}\n`);
  };

  if (!args.json) write('\n  Agent Sam · Go\n\n');

  note(discovery.runtime ? '✓ existing AgentSam Go runtime discovered' : '✗ Go runtime missing');
  if (!discovery.runtime) throw new Error('go_runtime_not_found');
  note(discovery.go?.ok ? '✓ go toolchain' : '✗ go toolchain');
  if (!discovery.go?.ok) throw new Error('go_toolchain_missing');

  const preflight = preflightToolchain({
    requireDocker: !(args.dryRun || args.skipDeploy),
    productRoot,
  });
  for (const check of preflight.checks) {
    note(`${check.ok ? '✓' : '·'} ${check.id}${check.detail ? ` · ${String(check.detail).slice(0, 80)}` : ''}`);
  }

  const contract = ensureProductContract(productRoot);
  note(contract.existing ? '✓ existing product contract' : '✓ product contract established');
  note('✓ deployment contract · cloudflare worker-container');

  if (!args.json) {
    write(`\n  Product\n    ${args.product}\n`);
    write('  Target\n    cloudflare\n');
    write('  Runtime\n    go/native + worker edge\n\n');
  }

  if (!args.json) write('  Building\n');
  const build = buildGoProduct({
    productRoot,
    runtimeRoot,
    repositoryRoot: discovery.repository_root,
    dryRun: args.dryRun,
  });
  note('✓ go test ./...');
  note('✓ go vet ./...');
  note(build.build.binary ? `✓ Go binary · ${path.basename(build.build.binary)}` : '✓ Go build skipped (dry-run)');

  if (!args.json) write('\n  Deploying\n');
  const deploy = await deployGoCloudflare({
    productRoot,
    product: args.product,
    dryRun: args.dryRun,
    skipDeploy: args.skipDeploy,
    skipRegistry: args.skipRegistry,
  });
  if (deploy.deployed) note(`✓ ${args.product}`);
  else if (args.dryRun) note('· dry-run · deploy skipped');
  else if (args.skipDeploy) note('· skip-deploy · local receipts only');
  else note('· deploy not completed');

  if (deploy.url && !args.json) write(`\n  Live\n    ${deploy.url}\n`);
  if (!args.json) write('\n  Validation\n');
  if (deploy.probes?.results) {
    for (const [key, value] of Object.entries(deploy.probes.results)) {
      note(`${value.ok ? '✓' : '✗'} ${key}`);
    }
  } else {
    note('· live probes skipped');
  }

  if (!args.json) write('\n  Registered\n');
  if (deploy.registry?.remote) note('✓ agentsam_products · remote D1 upsert');
  else if (deploy.registry?.skipped) note(`· agentsam_products · ${deploy.registry.reason || 'local only'}`);
  else note('✓ agentsam_products (local projection)');
  if (deploy.registry?.remote) note('✓ asset_relationships · remote D1 upsert');
  else note('✓ asset relationships (local metadata)');
  note('✓ deployment receipt');

  const payload = {
    ok: Boolean(build && (args.dryRun || args.skipDeploy || deploy.probes?.ok || deploy.deployed)),
    product: args.product,
    existing_product: contract.existing,
    scaffold_changes_required: contract.created.length > 0,
    discovery,
    contract,
    build: build.receipt,
    deploy,
    steps,
  };

  // Idempotent success: second run with healthy prior deploy still ok even if live probe skipped.
  if (args.dryRun || args.skipDeploy) payload.ok = true;
  if (deploy.deployed && deploy.probes && !deploy.probes.skipped) payload.ok = deploy.probes.ok;

  if (args.json) write(`${JSON.stringify(payload)}\n`);
  else {
    write(`\n${renderGoShipScenery({ product: args.product, discovery, deploy, build })}\n`);
    write(`\n  ${payload.ok ? 'ready' : 'incomplete'} · ${args.product}\n`);
    if (contract.existing && !contract.created.length) {
      write('  ✓ existing product · update/redeploy path (no sibling scaffold)\n');
    }
    write('\n');
  }

  if (!payload.ok && !args.dryRun && !args.skipDeploy) {
    const err = new Error('go_cloudflare_ship_incomplete');
    err.detail = payload;
    err.reported = true;
    throw err;
  }
  return payload;
}

async function runInteractiveMenu({ discovery, productRoot, runtimeRoot, args, write }) {
  intro(pc.bgCyan(pc.black(' Agent Sam · Go ')));
  const status = readLatestStatus(productRoot);
  write(`\n  Runtime\n`);
  write(`    ${discovery.go?.ok ? '✓' : '✗'} Go ${discovery.go?.goversion || ''}\n`);
  write(`    ${discovery.runtime ? '✓' : '✗'} AgentSam Go source discovered\n`);
  write(`\n  Products\n`);
  write(`    ${args.product.padEnd(28)} ${status.deployment?.health || 'undeployed'} ${status.deployment?.url || ''}\n\n`);

  write(`\n${renderArchitectureExplorer({
    repo: 'agentsam-sdk',
    git: discovery.git,
    tree: ['apps/', 'packages/', 'protocol/', 'src/go/', 'runtime/'],
    focus: {
      package: args.product,
      owns: 'Go runtime + CF container edge',
      runtime: 'go/native + worker',
      imported_by: 'CLI · deploy adapter · D1 registry',
      files: 'main.go · wrangler · Dockerfile',
    },
  })}\n\n`);

  const action = await select({
    message: 'What would you like to do?',
    options: [
      { value: 'explore', label: 'Explore wireframes' },
      { value: 'build', label: 'Build' },
      { value: 'test', label: 'Test' },
      { value: 'inspect', label: 'Inspect' },
      { value: 'cloudflare-ship', label: 'Deploy to Cloudflare' },
      { value: 'verify', label: 'Verify deployment' },
      { value: 'status', label: 'Show runtime' },
    ],
  });
  if (isCancel(action)) {
    cancel('Cancelled.');
    return { ok: false, cancelled: true };
  }
  outro(`Running ${action}`);
  return runGo([action, args.product, ...(args.json ? ['--json'] : [])], { write });
}
