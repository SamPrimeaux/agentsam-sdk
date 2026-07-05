import { scanCloudflareInventory } from '../tools/cloudflare/inventory.js';

function printInventory(result) {
  console.log('\nAgent Sam Cloudflare inventory\n');

  if (!result.ok) {
    console.log(`  ✗ ${result.error?.message || 'Cloudflare inventory failed'}`);
    if (result.error?.details?.missing) {
      console.log(`  missing: ${result.error.details.missing.join(', ')}`);
    }
    console.log('');
    return;
  }

  const data = result.data || {};
  const summary = data.summary || {};
  console.log(`  account:        ${data.accountId}`);
  console.log(`  zones:          ${summary.zones ?? 0}`);
  console.log(`  workers:        ${summary.workers ?? 0}`);
  console.log(`  d1 databases:   ${summary.d1Databases ?? 0}`);
  console.log(`  r2 buckets:     ${summary.r2Buckets ?? 0}`);
  console.log(`  kv namespaces:  ${summary.kvNamespaces ?? 0}`);
  console.log(`  queues:         ${summary.queues ?? 0}`);
  console.log(`  pages projects: ${summary.pagesProjects ?? 0}`);
  console.log(`  warnings:       ${summary.warnings ?? 0}`);

  if (Array.isArray(data.warnings) && data.warnings.length) {
    console.log('\nWarnings:');
    for (const warning of data.warnings) {
      console.log(`  • ${warning.label}: ${warning.message}`);
    }
  }

  console.log('');
}

function printUsage() {
  console.log(`\nUsage:\n  agentsam cloudflare inventory [--json]\n`);
}

export async function runCloudflareCommand(argv = []) {
  const command = argv.find((arg) => !arg.startsWith('-')) || '';
  const json = argv.includes('--json');

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return { ok: true, tool: 'cloudflare.help' };
  }

  if (command !== 'inventory') {
    printUsage();
    return { ok: false, tool: 'cloudflare.command', error: { code: 'unknown_command', message: `Unknown Cloudflare command: ${command}` } };
  }

  const result = await scanCloudflareInventory({}, { runtime: 'local' });
  if (json) console.log(JSON.stringify(result, null, 2));
  else printInventory(result);
  return result;
}
