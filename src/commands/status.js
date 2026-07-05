import { runDoctor } from '../tools/local/doctor.js';

function icon(ok) {
  return ok ? '✓' : '•';
}

export function printDoctor(result) {
  const data = result.data || result.error?.details || {};
  console.log(`\nAgent Sam SDK status\n`);
  console.log(`  ok:       ${result.ok ? 'yes' : 'no'}`);
  console.log(`  runtime:  ${result.trace?.runtime || 'local'}`);
  if (data.cwd) console.log(`  cwd:      ${data.cwd}`);

  if (Array.isArray(data.checks)) {
    console.log('\nChecks:');
    for (const row of data.checks) {
      console.log(`  ${icon(row.ok)} ${row.name.padEnd(20)} ${row.detail || ''}`);
    }
  }

  const warnings = data.warnings || [];
  if (warnings.length) {
    console.log(`\nWarnings: ${warnings.length}`);
    for (const row of warnings) console.log(`  • ${row.name}: ${row.detail}`);
  }

  console.log('');
}

export async function runStatus(opts = {}) {
  const result = await runDoctor({ cwd: opts.cwd, ptyHealthUrl: opts.ptyHealthUrl }, { runtime: 'local' });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printDoctor(result);
  }
  return result;
}
