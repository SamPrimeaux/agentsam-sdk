import {
  formatResourcesSummary,
  getIdentityProviderTemplate,
  listSchemaProfiles,
  loadIdentityProviders,
  loadIdentityResources,
  loadSchemaProfile,
  resolveAuthFeature,
  writeFeaturesResolved,
} from '../features/resolve.js';

function parseArgs(argv = []) {
  const opts = {
    cwd: process.cwd(),
    json: false,
    provider: '',
    schemaProfile: '',
    positionals: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') opts.json = true;
    else if (arg === '--cwd') opts.cwd = argv[++i] || opts.cwd;
    else if (arg === '--provider') opts.provider = argv[++i] || '';
    else if (arg === '--schema' || arg === '--schema-profile') opts.schemaProfile = argv[++i] || '';
    else if (!arg.startsWith('-')) opts.positionals.push(arg);
  }
  return opts;
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function runIdentityProviders(argv = []) {
  const opts = parseArgs(argv);
  const providers = loadIdentityProviders();
  if (opts.json) {
    writeJson({ ok: true, providers });
    return providers;
  }
  console.log('\nIdentity provider templates\n');
  for (const row of providers) {
    const status = row.status ? ` · ${row.status}` : '';
    console.log(`  ${row.id.padEnd(18)} ${String(row.kind || '').padEnd(10)} ${row.title || ''}${status}`);
  }
  console.log('');
  return providers;
}

export async function runIdentityPlan(argv = []) {
  const opts = parseArgs(argv);
  const providerId = opts.provider || opts.positionals[0] || 'inneranimalmedia';
  const provider = getIdentityProviderTemplate(providerId);
  if (!provider) throw new Error(`unknown_provider_template:${providerId}`);

  const selection = {
    selected: true,
    capabilities: ['identity.init'],
    provider_template: provider.id,
  };
  const resolved = resolveAuthFeature(selection);
  const resources = resolved.resources;
  const tableNames = (resources.tables || []).map((t) => t.name).join(', ');
  const migrations = (resources.migration_sources || []).join('\n             ');
  const plan = {
    ok: true,
    command: 'identity.plan',
    provider: resolved.provider,
    resources,
    next: [
      'agentsam add auth',
      `agentsam identity init --provider ${provider.id}`,
      'agentsam identity schema',
    ],
  };

  if (opts.json) {
    writeJson(plan);
    return plan;
  }

  console.log(`
Identity plan
─────────────
Provider:    ${resolved.provider.id} (${resolved.provider.kind}) · ${resolved.provider.status || ''}
Engine:      ${resources.engine}
Migrations:  ${migrations}
Tables:      ${tableNames}

Next:
  agentsam add auth
  agentsam identity init --provider ${provider.id}
  agentsam identity schema
`);
  return plan;
}

export async function runIdentitySchema(argv = []) {
  const opts = parseArgs(argv);
  const id = opts.schemaProfile || opts.positionals[0] || '';

  if (!id) {
    const resources = loadIdentityResources();
    if (opts.json) {
      writeJson({ ok: true, resources, also: listSchemaProfiles().filter((r) => r.id === 'better-auth-postgres') });
      return resources;
    }
    if (!resources) {
      console.error('\n  ✗ identity resources.json missing\n');
      process.exit(1);
    }
    console.log(`
Identity resources (packages/identity · oauth-login-portal)
──────────────────────────────────────────────────────────
Engine:      ${resources.engine}
Migrations:`);
    for (const src of resources.migration_sources || []) {
      console.log(`  ${src}`);
    }
    console.log('Tables:');
    for (const table of resources.tables || []) {
      const owner = table.owner_column ? ` · owner ${table.owner_column}` : '';
      const sensitive = table.sensitive ? ' · sensitive' : '';
      console.log(`  ${table.name.padEnd(24)} ${table.purpose || ''}${owner}${sensitive}`);
    }
    console.log('');
    return resources;
  }

  const profile = loadSchemaProfile(id);
  if (!profile) throw new Error(`unknown_resources:${id}`);
  if (opts.json) {
    writeJson(profile);
    return profile;
  }

  if (profile.tables) {
    console.log(`
Resources: ${profile.feature || profile.id || id}
Engine:    ${profile.engine}
`);
    for (const src of profile.migration_sources || (profile.source ? [profile.source] : [])) {
      console.log(`  migration  ${src}`);
    }
    console.log('');
    for (const table of profile.tables || []) {
      const owner = table.owner_column ? ` · owner ${table.owner_column}` : '';
      const sensitive = table.sensitive ? ' · sensitive' : '';
      console.log(`  ${String(table.name || '').padEnd(24)} ${table.purpose || ''}${owner}${sensitive}`);
    }
    console.log('');
  } else {
    console.log(`
${profile.id || id}
Engine:  ${profile.engine}
Source:  ${profile.source || '(n/a)'}
${profile.note ? `Note:    ${profile.note}\n` : ''}`);
  }
  return profile;
}

export async function runIdentityResolve(argv = []) {
  const opts = parseArgs(argv);
  const { path: outPath, snapshot } = writeFeaturesResolved(opts.cwd);
  if (opts.json) {
    writeJson({ ok: true, path: outPath, snapshot });
    return snapshot;
  }
  console.log(`\nResolved features → ${outPath}\n`);
  for (const [id, feature] of Object.entries(snapshot.features || {})) {
    const provider = feature.provider_template || feature.provider?.id || '—';
    if (feature.resources) {
      console.log(`  ${id.padEnd(16)} provider=${provider} ${formatResourcesSummary(feature.resources)}`);
    } else {
      console.log(`  ${id.padEnd(16)} provider=${provider}`);
    }
  }
  console.log('');
  return snapshot;
}

export function printIdentityHelp() {
  console.error(`
  Usage:
    agentsam identity preview [--open] [--port 8791]
    agentsam identity init --name <project> [--brand "Name"] [--provider inneranimalmedia]
    agentsam identity providers [--json]
    agentsam identity plan --provider <id> [--json]
    agentsam identity schema [--json]
    agentsam identity resolve [--cwd PATH] [--json]
`);
}

export { resolveAuthFeature };
