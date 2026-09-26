/**
 * agentsam setup runtime — goal profiles → hard constraints → GOAP → utility → receipts.
 * Physical registry remains terminal_* (Studio/IAM). This CLI owns local plan/install receipts.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { planGoap, GOAP_ENGINE } from '../../sam/planning/goap.js';
import {
  RUNTIME_PROTOCOL_SCHEMA,
  RUNTIME_ADAPTERS,
  RUNTIME_TRANSPORTS,
  capabilitiesSatisfy,
} from '../../../packages/runtime-protocol/src/index.js';
import { discoverEnvironment } from './discover.js';

export const RUNTIME_SETUP_SCHEMA = 'agentsam.runtime-setup.v1';

/** Five goal profiles (+ advanced). */
export const RUNTIME_PROFILES = Object.freeze([
  {
    id: 'my_computer',
    label: 'My Computer',
    description: 'This Mac/Linux host as a persistent agentsamd machine.',
    provider: 'local',
    substrate: 'host',
    lifecycle: 'persistent',
    runtime_adapter: 'agentsamd',
    transport: 'direct_https',
    required_capabilities: { exec: true, pty: true, filesystem: true, process: true },
  },
  {
    id: 'isolated_local',
    label: 'Isolated Local',
    description: 'Local Docker container running agentsamd.',
    provider: 'local',
    substrate: 'container',
    lifecycle: 'persistent',
    provider_product: 'docker',
    runtime_adapter: 'agentsamd',
    transport: 'direct_https',
    required_capabilities: { exec: true, pty: true, filesystem: true, docker: true },
  },
  {
    id: 'cloud_computer',
    label: 'Cloud Computer',
    description: 'Persistent cloud VM (GCP today) with agentsamd.',
    provider: 'google_cloud',
    substrate: 'vm',
    lifecycle: 'persistent',
    provider_product: 'compute_engine',
    runtime_adapter: 'agentsamd',
    transport: 'cloudflare_tunnel',
    required_capabilities: { exec: true, pty: true, filesystem: true, process: true },
  },
  {
    id: 'on_demand',
    label: 'On-demand',
    description: 'Scale-to-zero cloud container (CF Containers / Cloud Run).',
    provider: 'cloudflare',
    substrate: 'container',
    lifecycle: 'scale_to_zero',
    provider_product: 'containers',
    runtime_adapter: 'agentsamd',
    transport: 'service_binding',
    required_capabilities: { exec: true, filesystem: true },
  },
  {
    id: 'safe_sandbox',
    label: 'Safe Sandbox',
    description: 'Ephemeral Cloudflare Sandbox adapter (no full daemon required).',
    provider: 'cloudflare',
    substrate: 'sandbox',
    lifecycle: 'ephemeral',
    provider_product: 'sandbox',
    runtime_adapter: 'cloudflare_sandbox',
    transport: 'service_binding',
    required_capabilities: { exec: true },
  },
]);

function clean(value) {
  return value == null ? '' : String(value).trim();
}

export function runtimeStateDir(home = os.homedir()) {
  return path.join(home, '.agentsam', 'runtime');
}

export function ensureRuntimeStateDir(home = os.homedir()) {
  const dir = runtimeStateDir(home);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Discover facts for runtime placement (providers as adapters).
 */
export async function discoverRuntimeFacts(options = {}) {
  const env = await discoverEnvironment(options);
  const home = options.home || os.homedir();
  const stateDir = runtimeStateDir(home);
  const receiptPath = path.join(stateDir, 'latest.install-receipt.json');
  let prior = null;
  try {
    if (fs.existsSync(receiptPath)) prior = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  } catch {
    prior = null;
  }

  const agentsamdBin =
    (await whichBinary('agentsamd')) ||
    (fs.existsSync(path.join(home, '.agentsam', 'bin', 'agentsamd'))
      ? path.join(home, '.agentsam', 'bin', 'agentsamd')
      : null);

  return {
    schema: RUNTIME_SETUP_SCHEMA,
    discovered_at: new Date().toISOString(),
    protocol: RUNTIME_PROTOCOL_SCHEMA,
    host: {
      hostname: env.hostname,
      platform: env.platform,
      arch: env.arch,
      label: env.host_label,
    },
    tools: {
      docker: Boolean(env.tools?.docker),
      gcloud: Boolean(env.tools?.gcloud),
      wrangler: Boolean(env.tools?.wrangler),
      go: Boolean(await whichBinary('go')),
    },
    agentsamd: {
      binary: agentsamdBin,
      installed: Boolean(agentsamdBin),
      prior_receipt: prior?.product || prior?.profile_id || null,
    },
    available_capabilities: {
      exec: true,
      pty: env.platform !== 'win32',
      filesystem: true,
      process: true,
      git: Boolean(env.tools?.git),
      docker: Boolean(env.tools?.docker),
      gpu: false,
      browser: false,
      gui: env.platform === 'darwin',
      ports: true,
      snapshot: false,
      persistent_filesystem: true,
    },
  };
}

async function whichBinary(bin) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const { stdout } = await execFileAsync(cmd, [bin], { timeout: 4000 });
    return String(stdout || '').trim().split(/\r?\n/)[0] || null;
  } catch {
    return null;
  }
}

function hardConstraintsOk(profile, facts) {
  const caps = capabilitiesSatisfy(profile.required_capabilities || {}, facts.available_capabilities || {});
  const missingTools = [];
  if (profile.substrate === 'container' && profile.provider === 'local' && !facts.tools.docker) {
    missingTools.push('docker');
  }
  if (profile.provider === 'google_cloud' && !facts.tools.gcloud && !facts.tools.wrangler) {
    // tunnel path can work with wrangler alone later; flag soft for now
  }
  if (profile.runtime_adapter === 'agentsamd' && !facts.tools.go && !facts.agentsamd.installed) {
    missingTools.push('go_or_agentsamd_binary');
  }
  return {
    ok: caps.ok && missingTools.length === 0,
    missing_capabilities: caps.missing,
    missing_tools: missingTools,
  };
}

/**
 * GOAP install actions for a profile.
 */
function goapCatalogFor(profile) {
  return [
    {
      id: 'ensure_agentsamd_binary',
      cost: 3,
      preconditions: { need_agentsamd: true, has_agentsamd: false },
      effects: { has_agentsamd: true },
    },
    {
      id: 'ensure_docker',
      cost: 2,
      preconditions: { need_docker: true, has_docker: false },
      effects: { has_docker: true },
    },
    {
      id: 'create_instance_record',
      cost: 1,
      preconditions: { has_plan: true },
      effects: { instance_planned: true },
    },
    {
      id: 'create_connection_record',
      cost: 1,
      preconditions: { instance_planned: true },
      effects: { connection_planned: true },
    },
    {
      id: 'configure_transport',
      cost: 2,
      preconditions: { connection_planned: true },
      effects: { transport_ready: true },
    },
    {
      id: 'install_launch_agent',
      cost: 2,
      preconditions: { has_agentsamd: true, need_launchd: true },
      effects: { launch_agent_installed: true },
    },
    {
      id: 'enroll_runtime',
      cost: 2,
      preconditions: { transport_ready: true, has_agentsamd: true },
      effects: { enrolled: true },
    },
    {
      id: 'health_probe',
      cost: 1,
      preconditions: { enrolled: true },
      effects: { healthy: true },
    },
  ];
}

function utilityScore(profile, facts, constraints) {
  let score = 50;
  if (constraints.ok) score += 40;
  else score -= 30;
  if (profile.id === 'my_computer' && facts.host.platform === 'darwin') score += 10;
  if (profile.runtime_adapter === 'agentsamd' && facts.agentsamd.installed) score += 15;
  if (profile.substrate === 'container' && facts.tools.docker) score += 8;
  if (profile.provider === 'google_cloud' && facts.tools.gcloud) score += 8;
  if (!constraints.ok) score -= constraints.missing_capabilities.length * 5;
  return score;
}

/**
 * Rank eligible profiles and build GOAP install plans.
 */
export async function planRuntimeSetup(options = {}) {
  const facts = options.facts || (await discoverRuntimeFacts(options));
  const profileId = clean(options.profileId || options.profile);
  const profiles = profileId
    ? RUNTIME_PROFILES.filter((p) => p.id === profileId)
    : [...RUNTIME_PROFILES];

  const candidates = [];
  for (const profile of profiles) {
    const constraints = hardConstraintsOk(profile, facts);
    const initialState = {
      has_plan: true,
      need_agentsamd: profile.runtime_adapter === 'agentsamd',
      has_agentsamd: Boolean(facts.agentsamd.installed),
      need_docker: profile.substrate === 'container' && profile.provider === 'local',
      has_docker: Boolean(facts.tools.docker),
      need_launchd: profile.substrate === 'host' && facts.host.platform === 'darwin',
      instance_planned: false,
      connection_planned: false,
      transport_ready: false,
      launch_agent_installed: facts.host.platform !== 'darwin',
      enrolled: false,
      healthy: false,
    };
    const goal = {
      healthy: true,
      enrolled: true,
      ...(profile.runtime_adapter === 'agentsamd' ? { has_agentsamd: true } : {}),
    };
    const goap = planGoap({
      initialState,
      goal,
      actions: goapCatalogFor(profile),
      maxExpansions: 200,
    });
    const score = utilityScore(profile, facts, constraints);
    candidates.push({
      profile,
      eligible: constraints.ok,
      constraints,
      utility: score,
      goap: {
        engine: goap.engine || GOAP_ENGINE,
        ok: goap.ok,
        status: goap.status,
        action_ids: goap.action_ids || [],
        total_cost: goap.total_cost || 0,
        error: goap.error || null,
      },
      target: {
        protocol: RUNTIME_PROTOCOL_SCHEMA,
        provider: profile.provider,
        substrate: profile.substrate,
        lifecycle: profile.lifecycle,
        provider_product: profile.provider_product || null,
        runtime_adapter: profile.runtime_adapter,
        transport: profile.transport,
        auth_mode: profile.runtime_adapter === 'agentsamd' ? 'connection_token' : 'service_binding',
      },
    });
  }

  candidates.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return b.utility - a.utility;
  });

  return {
    schema: RUNTIME_SETUP_SCHEMA,
    protocol: RUNTIME_PROTOCOL_SCHEMA,
    facts,
    candidates,
    recommended: candidates.find((c) => c.eligible) || candidates[0] || null,
    adapters: RUNTIME_ADAPTERS,
    transports: RUNTIME_TRANSPORTS,
  };
}

export function writeRuntimePlanReceipt(plan, home = os.homedir()) {
  const dir = ensureRuntimeStateDir(home);
  const file = path.join(dir, 'latest.plan.json');
  const body = {
    ...plan,
    written_at: new Date().toISOString(),
  };
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
  return file;
}

export function writeRuntimeInstallReceipt(receipt, home = os.homedir()) {
  const dir = ensureRuntimeStateDir(home);
  const file = path.join(dir, 'latest.install-receipt.json');
  const body = {
    schema: 'agentsam.runtime-install-receipt.v1',
    written_at: new Date().toISOString(),
    ...receipt,
  };
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
  return file;
}

export function renderRuntimePlan(plan) {
  const lines = [
    '',
    '  Agent Sam · setup runtime',
    '  ────────────────────────────────────────',
    '',
    `  Host     ${plan.facts.host.label} · ${plan.facts.host.hostname} · ${plan.facts.host.platform}/${plan.facts.host.arch}`,
    `  Protocol ${plan.protocol}`,
    `  agentsamd ${plan.facts.agentsamd.installed ? `✓ ${plan.facts.agentsamd.binary}` : '○ not installed'}`,
    '',
    '  Profiles (hard constraints → GOAP → utility)',
    '',
  ];
  for (const c of plan.candidates) {
    const mark = c.eligible ? '✓' : '✕';
    lines.push(`  ${mark} ${c.profile.label.padEnd(18)} utility ${String(c.utility).padStart(3)}  adapter=${c.target.runtime_adapter}  ${c.target.provider}/${c.target.substrate}`);
    if (!c.eligible) {
      if (c.constraints.missing_capabilities.length) {
        lines.push(`      missing caps: ${c.constraints.missing_capabilities.join(', ')}`);
      }
      if (c.constraints.missing_tools.length) {
        lines.push(`      missing tools: ${c.constraints.missing_tools.join(', ')}`);
      }
    } else if (c.goap.action_ids.length) {
      lines.push(`      plan: ${c.goap.action_ids.join(' → ')}`);
    }
  }
  lines.push('');
  if (plan.recommended) {
    lines.push(`  Recommended  ${plan.recommended.profile.label} (${plan.recommended.profile.id})`);
    lines.push(`  Next         agentsam setup runtime --profile ${plan.recommended.profile.id} --yes`);
    lines.push(`               agentsam runtime install`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}
