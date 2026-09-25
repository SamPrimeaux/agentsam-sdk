import path from 'node:path';
import { cancel, confirm, intro, isCancel, outro, select } from '@clack/prompts';
import pc from 'picocolors';
import {
  DEFAULT_PRODUCT,
  discoverGoRuntime,
  resolveProductRoot,
  resolveGoStateRoot,
  ensureProductContract,
  preflightToolchain,
  buildGoProduct,
  deployGoCloudflare,
  resolveWranglerIdentity,
  verifyGoContainer,
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
    accountId: null,
    officialRelease: false,
    yes: false,
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
    else if (arg === '--official-release') out.officialRelease = true;
    else if (arg === '--yes' || arg === '-y') out.yes = true;
    else if (arg === '--account') out.accountId = String(argv[++i] || '').trim() || null;
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

  Normal AgentSam use does not require deploying this service.
  This command is for maintainers, contributors, and advanced self-hosters.

  agentsam go                         Interactive status / actions (TTY)
  agentsam go status [--json]         Runtime + service status
  agentsam go explore                 Architecture + operation wireframes (ANSI)
  agentsam go inspect [--json]        Discover packaged/development Go source
  agentsam go test                    go test ./...
  agentsam go build                   go build + local build receipt
  agentsam go verify [name] [--json]  Local tests + optional live probe
  agentsam go --cloudflare [name]     Self-host in YOUR explicit Cloudflare account
  agentsam go deploy [name] --cloudflare

  Self-host dry-run:
    agentsam go --cloudflare agentsam-go-worker --dry-run --account <account-id>

  Live self-host:
    agentsam go --cloudflare agentsam-go-worker --account <account-id> --yes

  IAM official release only:
    AGENTSAM_IAM_OFFICIAL_RELEASE=1 agentsam go --cloudflare agentsam-go-worker --official-release --account <account-id> --yes

  Flags:
    --account <id>       Explicit Cloudflare account target
    --yes, -y            Confirm a live non-interactive deployment
    --json               Machine-readable output
    --dry-run            Build/probe + Wrangler dry-run; no live deploy or IAM registry write
    --skip-deploy        Build/test/receipt only
    --skip-registry      Official-release escape hatch; self-host is isolated by default
    --official-release   IAM maintainer mode; guarded and never the self-host default
    --cwd <path>         Caller project/repository root
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
  const stateRoot = resolveGoStateRoot(discovery, args.cwd);
  const runtimeRoot = discovery.runtime?.runtimeRoot || path.join(productRoot, 'runtime');

  if (args.subcommand === 'menu' && process.stdout.isTTY && !args.json) {
    return runInteractiveMenu({ discovery, productRoot, stateRoot, runtimeRoot, args, write });
  }

  if (args.subcommand === 'inspect' || args.subcommand === 'runtime') {
    const payload = { ok: true, discovery, productRoot, stateRoot, runtimeRoot };
    write(args.json ? `${JSON.stringify(payload)}\n` : `${JSON.stringify(payload, null, 2)}\n`);
    return payload;
  }

  if (args.subcommand === 'explore') {
    const scenery = renderGoShipScenery({
      product: args.product,
      discovery,
      deploy: { url: readLatestStatus(stateRoot).deployment?.url, receipt: readLatestStatus(stateRoot).deployment, probes: { ok: readLatestStatus(stateRoot).deployment?.health === 'healthy' } },
      build: { receipt: readLatestStatus(stateRoot).build },
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
    const latest = readLatestStatus(stateRoot);
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
      stateRoot,
      dryRun: args.dryRun,
    });
    write(args.json ? `${JSON.stringify(result)}\n` : `✓ build receipt · ${result.receiptPath}\n`);
    return result;
  }

  if (args.subcommand === 'verify') {
    const result = await verifyGoProduct({
      productRoot,
      stateRoot,
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
    return shipCloudflare({ discovery, productRoot, stateRoot, runtimeRoot, args, write, options });
  }

  write(HELP);
  return { ok: true, help: true };
}

async function shipCloudflare({ discovery, productRoot, stateRoot, runtimeRoot, args, write, options = {} }) {
  const steps = [];
  const note = (line) => {
    steps.push(line);
    if (!args.json) write('  ' + line + '\n');
  };

  if (!args.json) write('\n  Agent Sam · Go\n\n');

  note(discovery.runtime ? '✓ existing AgentSam Go runtime discovered' : '✗ Go runtime missing');
  if (!discovery.runtime) throw new Error('go_runtime_not_found');
  note('✓ source · ' + (discovery.distribution?.origin || discovery.runtime.origin || 'unknown')
    + (discovery.distribution?.package_name
      ? ' · ' + discovery.distribution.package_name + '@' + discovery.distribution.package_version
      : ''));
  note(discovery.go?.ok ? '✓ go toolchain' : '✗ go toolchain');
  if (!discovery.go?.ok) throw new Error('go_toolchain_missing');

  if (args.officialRelease) {
    if (process.env.AGENTSAM_IAM_OFFICIAL_RELEASE !== '1') {
      const err = new Error('iam_official_release_guard_missing');
      err.hint = 'Set AGENTSAM_IAM_OFFICIAL_RELEASE=1 only in the authorized IAM maintainer release flow.';
      throw err;
    }
    if (discovery.runtime?.origin !== 'repository' && discovery.runtime?.origin !== 'sdk_development_tree') {
      const err = new Error('iam_official_release_requires_maintainer_source');
      err.hint = 'Official IAM releases must originate from the AgentSam SDK maintainer source tree.';
      throw err;
    }
    note('✓ release mode · IAM official');
  } else {
    note('✓ release mode · self-host · IAM D1 isolated');
  }

  let cfIdentity = null;
  if (!args.skipDeploy) {
    cfIdentity = resolveWranglerIdentity(productRoot, {
      requestedAccountId: args.accountId,
    });

    if (!cfIdentity.ok && cfIdentity.error === 'cloudflare_account_ambiguous' && !args.json && process.stdout.isTTY) {
      const selectImpl = options.selectImpl || select;
      const chosen = await selectImpl({
        message: 'Cloudflare account',
        options: cfIdentity.accounts.map((account) => ({
          value: account.id,
          label: account.name || account.id,
          hint: account.id,
        })),
      });
      if (isCancel(chosen)) {
        cancel('Cloudflare deployment cancelled.');
        return { ok: false, cancelled: true };
      }
      args.accountId = String(chosen);
      cfIdentity = resolveWranglerIdentity(productRoot, {
        requestedAccountId: args.accountId,
      });
    }

    if (!cfIdentity.ok || !cfIdentity.account?.id) {
      const err = new Error(cfIdentity.error || 'cloudflare_identity_unavailable');
      err.detail = cfIdentity;
      err.hint = cfIdentity.error === 'cloudflare_account_ambiguous'
        ? 'Pass --account <account-id> so the deployment target is explicit.'
        : 'Authenticate Wrangler with your Cloudflare account before self-hosting.';
      throw err;
    }

    args.accountId = cfIdentity.account.id;
    note('✓ Cloudflare identity · ' + (cfIdentity.auth_type || 'authenticated'));
    note('✓ Cloudflare account · ' + (cfIdentity.account.name || 'unnamed') + ' · ' + cfIdentity.account.id);

    if (!args.dryRun && !args.yes) {
      if (args.json || !process.stdout.isTTY) {
        const err = new Error('cloudflare_deploy_confirmation_required');
        err.hint = 'Re-run with --yes after reviewing the resolved Cloudflare account target.';
        throw err;
      }
      const confirmImpl = options.confirmImpl || confirm;
      const approved = await confirmImpl({
        message: 'Deploy ' + args.product + ' to ' + (cfIdentity.account.name || cfIdentity.account.id)
          + ' (' + cfIdentity.account.id + ')?',
        initialValue: false,
      });
      if (isCancel(approved) || approved !== true) {
        cancel('Cloudflare deployment cancelled.');
        return { ok: false, cancelled: true };
      }
    }
  }

  const preflight = preflightToolchain({
    requireDocker: !args.skipDeploy,
    productRoot,
  });
  for (const check of preflight.checks) {
    note((check.ok ? '✓' : '·') + ' ' + check.id
      + (check.detail ? ' · ' + String(check.detail).slice(0, 80) : ''));
  }

  const contract = ensureProductContract(productRoot);
  note(contract.existing ? '✓ existing product contract' : '✓ product contract established');
  note('✓ deployment contract · cloudflare worker-container');

  if (!args.json) {
    write('\n  Product\n    ' + args.product + '\n');
    write('  Target\n    cloudflare\n');
    write('  Runtime\n    go/native + worker edge\n');
    write('  State\n    ' + stateRoot + '\n\n');
  }

  if (!args.json) write('  Building\n');
  const build = buildGoProduct({
    productRoot,
    runtimeRoot,
    repositoryRoot: discovery.repository_root,
    stateRoot,
    dryRun: false,
  });
  note('✓ source identity · ' + build.receipt.source.identity);
  note('✓ go test ./...');
  note('✓ go vet ./...');
  note('✓ Go binary · ' + path.basename(build.build.binary) + ' · ' + build.receipt.artifact.digest);
  note('✓ native runtime boot/probe/shutdown');

  let container = null;
  if (!args.skipDeploy) {
    if (!args.json) write('\n  Container\n');
    container = await verifyGoContainer({
      productRoot,
      product: args.product,
      expectedSource: build.receipt.source.identity,
      expectedSourceCommit: build.receipt.source.commit,
      expectedBuiltAt: build.receipt.built_at,
    });
    note('✓ linux/' + container.architecture + ' · ' + container.user);
    note('✓ container runtime probe · ' + container.image_digest);
  }

  if (!args.json) write('\n  Deploying\n');
  const deploy = await deployGoCloudflare({
    productRoot,
    stateRoot,
    product: args.product,
    dryRun: args.dryRun,
    skipDeploy: args.skipDeploy,
    skipRegistry: args.skipRegistry,
    officialRelease: args.officialRelease,
    accountId: args.accountId,
    cloudflareIdentity: cfIdentity,
    source: build.receipt.source,
    builtAt: build.receipt.built_at,
    artifactDigest: build.receipt.artifact.digest,
    containerDigest: container?.image_digest || null,
  });

  if (deploy.deployed) note('✓ ' + args.product + ' · ' + deploy.deploymentId + ' · ' + deploy.versionId);
  else if (args.dryRun && deploy.dryRunValidated) note('✓ Wrangler dry-run validated Worker + Container config');
  else if (args.skipDeploy) note('· skip-deploy · local receipts only');
  else note('· deploy not completed');

  if (deploy.url && !args.json) write('\n  Live\n    ' + deploy.url + '\n');
  if (!args.json) write('\n  Validation\n');
  if (deploy.probes?.results) {
    for (const [key, value] of Object.entries(deploy.probes.results)) {
      note((value.ok ? '✓' : '✗') + ' ' + key);
    }
  } else {
    note('· live probes skipped');
  }

  if (!args.json) write('\n  Registry\n');
  if (deploy.registry?.remote) {
    note('✓ IAM agentsam_products + asset_relationships · official release');
  } else if (!args.officialRelease) {
    note('✓ local AgentSam registry · IAM D1 isolated');
  } else {
    note('· IAM registry · ' + (deploy.registry?.reason || 'not written'));
  }
  note('✓ deployment receipt');

  const buildOk = Boolean(
    build.receipt.tests.go_test
    && build.receipt.tests.go_vet
    && build.receipt.tests.runtime_probe
    && build.receipt.artifact.digest
    && build.receipt.source.identity,
  );
  const containerOk = args.skipDeploy ? true : Boolean(container?.ok && container?.image_digest);
  const deploymentOk = args.skipDeploy
    ? true
    : (args.dryRun ? Boolean(deploy.dryRunValidated) : Boolean(deploy.deployed && deploy.probes?.ok));
  const registryOk = !args.officialRelease
    ? deploy.registry?.reason === 'self_host_registry_isolated'
    : (args.skipRegistry || args.dryRun || args.skipDeploy ? true : Boolean(deploy.registry?.remote));

  const payload = {
    ok: buildOk && containerOk && deploymentOk && registryOk,
    mode: args.officialRelease ? 'iam_official_release' : 'self_host',
    product: args.product,
    state_root: stateRoot,
    cloudflare: deploy.cloudflare,
    existing_product: contract.existing,
    scaffold_changes_required: contract.created.length > 0,
    discovery,
    contract,
    build: build.receipt,
    container,
    deploy,
    steps,
  };

  if (args.json) write(JSON.stringify(payload) + '\n');
  else {
    write('\n' + renderGoShipScenery({ product: args.product, discovery, deploy, build }) + '\n');
    write('\n  ' + (payload.ok ? 'ready' : 'incomplete') + ' · ' + args.product + '\n');
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

async function runInteractiveMenu({ discovery, productRoot, stateRoot, runtimeRoot, args, write }) {
  intro(pc.bgCyan(pc.black(' Agent Sam · Go ')));
  const status = readLatestStatus(stateRoot);
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
      imported_by: 'CLI · deploy adapter · local registry · IAM official registry',
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
      { value: 'deploy', label: 'Self-host on Cloudflare' },
      { value: 'verify', label: 'Verify deployment' },
      { value: 'status', label: 'Show runtime' },
    ],
  });
  if (isCancel(action)) {
    cancel('Cancelled.');
    return { ok: false, cancelled: true };
  }
  outro(`Running ${action}`);
  const forwarded = [action, args.product, '--cwd', args.cwd];
  if (action === 'deploy') forwarded.push('--cloudflare');
  if (args.json) forwarded.push('--json');
  return runGo(forwarded, { write });
}
