import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const source = new URL('../../packages/catalog/doctor/toolchains.json', import.meta.url);

export function doctorReport(spawn = spawnSync) {
  const spec = JSON.parse(readFileSync(source, 'utf8'));
  const probes = spec.tools.map(tool => {
    const cp = spawn(tool.id, tool.version_args, { encoding: 'utf8', timeout: 8000 });
    const output = String(cp.stdout || cp.stderr || '').trim().split('\n')[0];
    return {
      id: tool.id, label: tool.label, required: !!tool.required,
      ok: !cp.error && cp.status === 0,
      version: !cp.error && cp.status === 0 ? output : null,
      why: tool.why, repair: tool.repair, verify: tool.verify,
    };
  });
  const wasm = spawn('rustup', ['target','list','--installed'], { encoding: 'utf8', timeout: 8000 });
  const wasmTarget = !wasm.error && wasm.status === 0 &&
    String(wasm.stdout || '').split('\n').includes('wasm32-unknown-unknown');
  return {
    schema: 'agentsam.doctor-report.v1',
    ok: probes.filter(x => x.required).every(x => x.ok),
    rust_wasm_ready: wasmTarget && ['rustc','cargo','worker-build'].every(x => probes.find(p => p.id === x)?.ok),
    wasm_target_installed: wasmTarget,
    probes,
  };
}

export function runCatalogDoctor(args = []) {
  if (args.includes('--help')) {
    console.log('Usage: agentsam doctor [--json] [--teach]\nCheck core CLI and optional Rust/Wasm toolchains; no installations or deployments.');
    return 0;
  }
  const report = doctorReport();
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log('AgentSam Toolchain Doctor');
    for (const probe of report.probes) {
      console.log((probe.ok ? '✓' : '–') + ' ' + probe.label + ': ' + (probe.version || 'not available'));
      if (args.includes('--teach') || !probe.ok) {
        console.log('  Why: ' + probe.why);
        if (!probe.ok) console.log('  Repair: ' + probe.repair + '\n  Verify: ' + probe.verify);
      }
    }
    console.log('Wasm compilation target: ' + (report.wasm_target_installed ? 'installed' : 'not installed'));
    if (!report.wasm_target_installed) console.log('  Optional repair: rustup target add wasm32-unknown-unknown');
    console.log('AgentSam CLI: ' + (report.ok ? 'ready' : 'missing required tooling'));
    console.log('Rust/Wasm Worker build lane: ' + (report.rust_wasm_ready ? 'ready' : 'needs setup'));
  }
  return report.ok ? 0 : 2;
}
