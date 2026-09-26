import { SETUP_PLAN_SCHEMA } from './contract.js';
import { getCapabilityRecipe, listCapabilityRecipes } from './recipes.js';

function platformKey(platform) {
  if (platform === 'darwin') return 'darwin';
  if (platform === 'win32') return 'win32';
  return 'linux';
}

/**
 * Build an install plan for requested capability IDs (or all known recipes).
 */
export async function buildSetupPlan(options = {}) {
  const environment = options.environment;
  if (!environment) throw new Error('environment_required');
  const requested = Array.isArray(options.capabilityIds) && options.capabilityIds.length
    ? options.capabilityIds
    : listCapabilityRecipes().map((r) => r.id);

  const capabilities = [];
  const wouldInstall = [];
  const providers = new Set();
  const mutations = new Set();
  let blocked = false;

  for (const id of requested) {
    const recipe = getCapabilityRecipe(id);
    if (!recipe) {
      capabilities.push({ id, ok: false, error: 'unknown_capability' });
      continue;
    }
    const detection = await recipe.detect({ environment });
    const plan = recipe.installPlans[platformKey(environment.platform)] || null;
    const entry = {
      id: recipe.id,
      displayName: recipe.displayName,
      description: recipe.description,
      risk: recipe.risk,
      requiresApproval: recipe.requiresApproval !== false,
      capabilityProvided: recipe.capabilityProvided || [],
      detected: detection,
      installPlan: plan,
      mutations: recipe.mutations || [],
      uninstallHint: recipe.uninstallHint?.() || null,
    };
    capabilities.push(entry);
    if (detection.ok) continue;
    if (!plan) {
      blocked = true;
      entry.error = 'no_install_plan_for_platform';
      continue;
    }
    providers.add(plan.provider);
    for (const m of entry.mutations) mutations.add(m);
    if (plan.packages?.length) {
      wouldInstall.push({
        capability: recipe.id,
        provider: plan.provider,
        packages: plan.packages,
        notes: plan.notes || [],
      });
    } else if (plan.commands?.length) {
      wouldInstall.push({
        capability: recipe.id,
        provider: plan.provider,
        commands: plan.commands,
        notes: plan.notes || [],
      });
    }
  }

  return {
    schema_version: SETUP_PLAN_SCHEMA,
    ok: !blocked,
    hostname: environment.hostname,
    host_label: environment.host_label,
    platform: environment.platform,
    capabilities,
    would_install: wouldInstall,
    providers: [...providers],
    mutations: [...mutations],
    trust_notes: [
      'Agent Sam will not silently trust third-party package taps/repos.',
      'No shell profiles, project files, or provider credentials are modified unless a recipe explicitly lists them and you approve.',
    ],
  };
}

export function renderSetupPlan(plan) {
  const lines = [
    '',
    '  Agent Sam Setup',
    '  ────────────────────────────────────────',
    '',
    `  Host  ${plan.host_label} · ${plan.hostname} · ${plan.platform}`,
    '',
    '  Capabilities',
  ];
  for (const cap of plan.capabilities) {
    const mark = cap.detected?.ok ? '✓' : '○';
    const ver = cap.detected?.version ? ` · ${String(cap.detected.version).slice(0, 36)}` : '';
    lines.push(`    ${mark} ${cap.displayName || cap.id}${ver}`);
    if (!cap.detected?.ok && cap.detected?.detail) {
      lines.push(`      ${cap.detected.detail}`);
    }
  }
  lines.push('');
  if (!plan.would_install.length) {
    lines.push('  Suggested installation');
    lines.push('    Nothing missing from the requested set.');
    lines.push('');
    return lines.join('\n');
  }
  lines.push('  Suggested installation');
  lines.push(`    Would install ${plan.would_install.length} capability package group(s):`);
  for (const row of plan.would_install) {
    const pkgs = (row.packages || row.commands || []).join(' ');
    lines.push(`      ${row.provider.padEnd(12)} ${pkgs}`);
  }
  lines.push('');
  lines.push('  Would use');
  for (const p of plan.providers) lines.push(`    ${p}`);
  lines.push('');
  lines.push('  Would modify');
  if (!plan.mutations.length) {
    lines.push('    no project files / shell profiles / credentials (package install only)');
  } else {
    for (const m of plan.mutations) lines.push(`    • ${m}`);
  }
  lines.push('');
  for (const note of plan.trust_notes || []) lines.push(`  Note  ${note}`);
  lines.push('');
  return lines.join('\n');
}
