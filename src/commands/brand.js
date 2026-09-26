import fs from 'node:fs';
import path from 'node:path';
import {
  cancel,
  confirm,
  intro,
  isCancel,
  note,
  outro,
  select,
  text,
} from '@clack/prompts';
import { repositorySnapshot } from '../capabilities/index.js';
import {
  brandScan,
  brandResolve,
  brandPlan,
  buildBrandContractDraft,
  brandGoapActions,
  brandWorldFromPlan,
  brandGoalFromPlan,
  runBrandAssetCommand,
  runBrandPromoteWizard,
} from '../../packages/agentsam-brand/src/index.js';
import { planGoap, GOAP_ENGINE } from '../sam/planning/goap.js';
import { suggestNextActions } from '../progression/index.js';
import { createRuntimeActivity } from '../ui/runtime-activity.js';

const ASSET_ACTIONS = new Set([
  'inspect',
  'derive',
  'assets',
  'promote',
  'publish',
  'verify',
  'presets',
]);

function parseArgs(argv = []) {
  const out = {
    json: false,
    cwd: process.cwd(),
    dryRun: false,
    goap: false,
    write: false,
    positionals: [],
    passthrough: [...argv],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--cwd') out.cwd = argv[++i] || out.cwd;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--goap') out.goap = true;
    else if (a === '--write') out.write = true;
    else if (a === '--snapshot-file') out.snapshotFile = argv[++i] || '';
    else out.positionals.push(a);
  }
  return out;
}

async function loadSnapshot(opts) {
  if (opts.snapshotFile) {
    return JSON.parse(fs.readFileSync(path.resolve(opts.cwd, opts.snapshotFile), 'utf8'));
  }
  return repositorySnapshot({ cwd: opts.cwd, churnDays: 30 });
}

function printNext(actions) {
  if (!actions?.length) return;
  console.log('\nSuggested');
  for (const a of actions.slice(0, 5)) {
    console.log(`→ ${a.label}`);
    if (a.command) console.log(`  ${a.command}`);
    if (a.reason) console.log(`  ${a.reason}`);
  }
  console.log('');
}

function attachProgression(capability, result, json) {
  const { next_actions } = suggestNextActions({ capability, result });
  const receipt = {
    capability,
    status: 'completed',
    repository_snapshot: result.repository?.snapshot_id || result.snapshot_id || null,
    content_hash: result.content_hash || null,
    next_actions,
  };
  if (json) return { ...result, receipt, next_actions };
  printNext(next_actions);
  return { ...result, receipt, next_actions };
}

export async function runBrand(argv = []) {
  const opts = parseArgs(argv);
  const [sub = '', ...rest] = opts.positionals;
  const action = sub || 'summary';

  if (action === 'help' || action === '--help') {
    console.log(`usage: agentsam brand [summary|scan|resolve|inspect|plan|apply|assets|promote|publish|verify|derive|presets]

Brand intelligence:
  summary|scan|resolve|inspect|plan|apply

Brand assets (portable SDK — same as agentsam-brand):
  agentsam brand promote                 interactive (TTY) or --manifest
  agentsam brand plan --manifest ./x.json --json
  agentsam brand promote --brand acme --asset logo --version v1 \\
    --source ./master.png --derive png:1024 --derive webp:1024:q92 --dry-run --json
  agentsam brand publish --brand acme --asset logo --version v1
  agentsam brand verify  --brand acme --asset logo --version v1
  agentsam brand presets

No product-specific defaults. AgentSam icons are ordinary manifests under apps/local-studio/brand/.
`);
    return;
  }

  // Asset/promote surface → shared controller (also used by agentsam-brand bin)
  if (ASSET_ACTIONS.has(action)) {
    const code = await runBrandAssetCommand(argv, {
      runWizard: runBrandPromoteWizard,
      prompts: { intro, outro, cancel, isCancel, select, text, confirm, note },
    });
    if (typeof code === 'number' && code !== 0) process.exitCode = code;
    return;
  }

  if (action === 'apply') {
    if (!opts.dryRun) {
      console.error('brand apply requires --dry-run until mutations are gated');
      process.exitCode = 2;
      return;
    }
    const out = {
      capability: 'brand.apply',
      status: 'dry-run',
      message: 'No files changed. Approve a brand.plan then re-run apply when mutation executor ships.',
    };
    if (opts.json) console.log(JSON.stringify(out, null, 2));
    else console.log(out.message);
    return;
  }

  const tty = process.stdout.isTTY && !opts.json;
  const activity = tty ? createRuntimeActivity({ label: 'Brand intelligence' }) : null;
  const onEvent = (ev) => {
    if (!activity) return;
    if (ev.type === 'operation.phase.started') activity.update(String(ev.phase || 'working'));
    if (ev.type === 'operation.progress') activity.update(String(ev.detail || ev.phase || 'scanning'));
  };

  try {
    activity?.start('snapshot');
    const snapshot = await loadSnapshot(opts);

    if (action === 'summary' || action === 'scan' || action === 'resolve' || action === 'inspect' || action === 'plan') {
      const scan = await brandScan({ cwd: opts.cwd, snapshot, onEvent });

      if (action === 'scan') {
        const enriched = attachProgression('brand.scan', scan, opts.json);
        if (opts.write) writeArtifacts(opts.cwd, { evidence: scan });
        if (opts.json) console.log(JSON.stringify(enriched, null, 2));
        else {
          console.log(`\nBrand scan complete · ${scan.repository.snapshot_id}`);
          console.log(`  colors     ${scan.tokens.colors.length}`);
          console.log(`  conflicts  ${scan.conflicts.length}`);
          console.log(`  hash       ${scan.content_hash}`);
        }
        return;
      }

      const resolved = brandResolve(scan);
      if (action === 'resolve') {
        const enriched = attachProgression('brand.resolve', { ...resolved, repository: scan.repository, content_hash: scan.content_hash }, opts.json);
        if (opts.write) writeArtifacts(opts.cwd, { evidence: scan, resolved });
        if (opts.json) console.log(JSON.stringify({ ...resolved, next_actions: enriched.next_actions }, null, 2));
        else {
          console.log(`\nBrand resolve · ${Object.keys(resolved.resolved.colors).length} color roles`);
          console.log(`  ambiguities ${resolved.ambiguities.length}`);
        }
        return;
      }

      if (action === 'inspect') {
        // brand intelligence inspect (conflicts) — asset inspect is ASSET_ACTIONS
        const focus = rest[0] || 'conflicts';
        const payload = focus === 'components'
          ? { capability: 'brand.inspect', focus, components: scan.components, patterns: scan.patterns }
          : { capability: 'brand.inspect', focus, conflicts: scan.conflicts, colors: scan.tokens.colors.slice(0, 20) };
        if (opts.json) console.log(JSON.stringify(payload, null, 2));
        else {
          console.log(`\nConflicts (${scan.conflicts.length})`);
          for (const c of scan.conflicts.slice(0, 15)) {
            console.log(`  ${c.values?.join(' ≈ ')} · d=${c.distance}`);
          }
        }
        return;
      }

      if (action === 'plan') {
        return runBrandPlanInner({ scan, resolved, opts });
      }

      const contract = buildBrandContractDraft({ scan, resolved });
      const plan = brandPlan({ scan, resolved, contract });
      const { next_actions } = suggestNextActions({ capability: 'brand.scan', result: scan });
      const summary = {
        capability: 'brand.summary',
        repository: scan.repository,
        sources: scan.sources,
        summary: plan.summary,
        confidence: resolved.confidence,
        ambiguities: resolved.ambiguities.slice(0, 5),
        next_actions,
      };
      if (opts.write) writeArtifacts(opts.cwd, { evidence: scan, resolved, contract });
      if (opts.json) console.log(JSON.stringify(summary, null, 2));
      else {
        console.log(`\nBrand · ${scan.repository.snapshot_id}`);
        console.log(`  ${plan.summary.colors} colors · ${plan.summary.near_duplicate_pairs} near-duplicates`);
        printNext(next_actions);
      }
    }
  } finally {
    activity?.stop?.();
  }
}

async function runBrandPlanInner({ scan, resolved, opts }) {
  const contract = buildBrandContractDraft({ scan, resolved });
  const plan = brandPlan({ scan, resolved, contract });
  let goap = null;
  if (opts.goap) {
    const world = brandWorldFromPlan(plan);
    const goal = brandGoalFromPlan(plan);
    const actions = brandGoapActions();
    const planned = planGoap({
      initialState: world,
      goal,
      actions,
      maxExpansions: 10_000,
    });
    goap = {
      ok: planned.ok,
      plan: planned.plan,
      cost: planned.total_cost ?? planned.cost,
      engine: planned.engine || GOAP_ENGINE,
      status: planned.status,
    };
  }
  const enriched = attachProgression('brand.plan', plan, opts.json);
  const out = { ...plan, goap, next_actions: enriched.next_actions };
  if (opts.write) {
    writeArtifacts(opts.cwd, { evidence: scan, resolved, contract });
    const dir = path.join(opts.cwd, '.agentsam', 'brand');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'plan.json'), `${JSON.stringify(out, null, 2)}\n`);
  }
  if (opts.json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log('\nBrand coherence plan');
    console.log(`  philosophy  ${plan.philosophy}`);
    for (const [i, s] of plan.steps.entries()) {
      console.log(`    ${i + 1}. [${s.action}] ${s.title}`);
    }
    if (goap?.ok) console.log(`  goap        cost=${goap.cost} · ${goap.plan?.join(' → ')}`);
  }
}

export async function runPlan(argv = []) {
  const opts = parseArgs(argv);
  const [domain, ...rest] = opts.positionals;
  if (!domain || domain === 'help') {
    console.log(`usage: agentsam plan <domain>\n\nDomains:\n  brand [--goap] [--json] [--write]\n`);
    return;
  }
  if (domain === 'brand') {
    return runBrand(['plan', ...rest, ...(opts.json ? ['--json'] : []), ...(opts.goap ? ['--goap'] : []), ...(opts.write ? ['--write'] : []), ...(opts.cwd !== process.cwd() ? ['--cwd', opts.cwd] : [])]);
  }
  console.error(`plan domain not implemented: ${domain}`);
  process.exitCode = 2;
}

function writeArtifacts(cwd, { evidence, resolved, contract }) {
  const dir = path.join(cwd, '.agentsam', 'brand');
  fs.mkdirSync(dir, { recursive: true });
  if (evidence) fs.writeFileSync(path.join(dir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  if (resolved) fs.writeFileSync(path.join(dir, 'resolved.json'), `${JSON.stringify(resolved, null, 2)}\n`);
  if (contract) fs.writeFileSync(path.join(dir, 'contract.json'), `${JSON.stringify(contract, null, 2)}\n`);
}
