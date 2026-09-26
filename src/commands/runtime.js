/**
 * agentsam runtime — install / manage the local agentsamd daemon.
 * Distinct from `agentsam go` (agentsam-go-worker SERVICE).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  ensureRuntimeStateDir,
  writeRuntimeInstallReceipt,
  RUNTIME_PROFILES,
} from '../lib/setup/runtime.js';
import { RUNTIME_PROTOCOL_SCHEMA } from '../../packages/runtime-protocol/src/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SDK_ROOT = path.resolve(HERE, '../..');
const GO_RUNTIME = path.join(SDK_ROOT, 'apps/agentsam-go-worker/runtime');
const AGENTSMD_PKG = 'github.com/inneranimalmedia/agentsam-go-worker/cmd/agentsamd';

function writeLine(write, value = '') {
  write(`${value}\n`);
}

function printHelp(write) {
  writeLine(write, '');
  writeLine(write, '  Agent Sam · runtime (agentsamd)');
  writeLine(write, '');
  writeLine(write, '  agentsam runtime install [--yes]   build + install agentsamd + LaunchAgent');
  writeLine(write, '  agentsam runtime status            binary + LaunchAgent status');
  writeLine(write, '  agentsam runtime uninstall         remove LaunchAgent (keeps binary)');
  writeLine(write, '');
  writeLine(write, '  Distinct from: agentsam go (agentsam-go-worker SERVICE)');
  writeLine(write, `  Protocol: ${RUNTIME_PROTOCOL_SCHEMA} · adapter: agentsamd`);
  writeLine(write, '');
}

function binDir(home = os.homedir()) {
  return path.join(home, '.agentsam', 'bin');
}

function agentsamdPath(home = os.homedir()) {
  return path.join(binDir(home), process.platform === 'win32' ? 'agentsamd.exe' : 'agentsamd');
}

function launchAgentPlistPath(home = os.homedir()) {
  return path.join(home, 'Library', 'LaunchAgents', 'com.inneranimalmedia.agentsamd.plist');
}

function which(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return String(r.stdout || '').trim().split(/\r?\n/)[0] || null;
}

function buildAgentsamd(dest, write) {
  if (!which('go')) {
    return { ok: false, error: 'go_not_found', hint: 'Install Go 1.22+ or download a release binary.' };
  }
  if (!fs.existsSync(path.join(GO_RUNTIME, 'go.mod'))) {
    return { ok: false, error: 'go_runtime_missing', path: GO_RUNTIME };
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  writeLine(write, `  Building agentsamd → ${dest}`);
  const r = spawnSync(
    'go',
    ['build', '-o', dest, './cmd/agentsamd'],
    { cwd: GO_RUNTIME, encoding: 'utf8', env: { ...process.env, CGO_ENABLED: '0' } },
  );
  if (r.status !== 0) {
    return { ok: false, error: 'go_build_failed', stderr: r.stderr || r.stdout };
  }
  try { fs.chmodSync(dest, 0o755); } catch { /* ignore */ }
  return { ok: true, path: dest };
}

function writeLaunchAgent(home, binaryPath, write) {
  if (process.platform !== 'darwin') {
    return { ok: true, skipped: true, reason: 'not_darwin' };
  }
  const plistPath = launchAgentPlistPath(home);
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  const logDir = path.join(home, '.agentsam', 'runtime', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.inneranimalmedia.agentsamd</string>
  <key>ProgramArguments</key>
  <array>
    <string>${binaryPath}</string>
    <string>serve</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>${path.join(home, '.agentsam')}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>8788</string>
    <key>AGENTSAM_TARGET</key>
    <string>local</string>
    <key>AGENTSAM_HOME</key>
    <string>${path.join(home, '.agentsam')}</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${path.join(logDir, 'agentsamd.out.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(logDir, 'agentsamd.err.log')}</string>
</dict>
</plist>
`;
  fs.writeFileSync(plistPath, plist, 'utf8');
  writeLine(write, `  LaunchAgent  ${plistPath}`);
  spawnSync('launchctl', ['unload', plistPath], { encoding: 'utf8' });
  const load = spawnSync('launchctl', ['load', plistPath], { encoding: 'utf8' });
  return {
    ok: load.status === 0,
    path: plistPath,
    stderr: load.stderr || null,
  };
}

export async function runRuntime(argv = [], options = {}) {
  const write = options.write || ((s) => process.stdout.write(s));
  const home = options.home || os.homedir();
  const json = argv.includes('--json');
  const yes = argv.includes('--yes') || argv.includes('-y');
  const args = argv.filter((a) => !['--json', '--yes', '-y', 'help', '--help', '-h'].includes(a));
  const sub = args[0] || 'help';

  if (argv.includes('help') || argv.includes('--help') || argv.includes('-h') || sub === 'help') {
    printHelp(write);
    return 0;
  }

  if (sub === 'status') {
    const bin = agentsamdPath(home);
    const installed = fs.existsSync(bin);
    const plist = launchAgentPlistPath(home);
    const launchAgent = process.platform === 'darwin' && fs.existsSync(plist);
    const payload = {
      protocol: RUNTIME_PROTOCOL_SCHEMA,
      runtime_adapter: 'agentsamd',
      binary: installed ? bin : null,
      installed,
      launch_agent: launchAgent ? plist : null,
      profiles: RUNTIME_PROFILES.map((p) => p.id),
      go_worker_distinct: true,
    };
    if (json) write(`${JSON.stringify(payload, null, 2)}\n`);
    else {
      writeLine(write, '');
      writeLine(write, `  agentsamd  ${installed ? `✓ ${bin}` : '○ not installed'}`);
      writeLine(write, `  LaunchAgent ${launchAgent ? `✓ ${plist}` : process.platform === 'darwin' ? '○ not loaded' : '— (non-Darwin)'}`);
      writeLine(write, '');
    }
    return installed ? 0 : 1;
  }

  if (sub === 'uninstall') {
    if (process.platform === 'darwin') {
      const plist = launchAgentPlistPath(home);
      if (fs.existsSync(plist)) {
        spawnSync('launchctl', ['unload', plist], { encoding: 'utf8' });
        fs.unlinkSync(plist);
        writeLine(write, `  Removed LaunchAgent ${plist}`);
      }
    }
    writeLine(write, '  Binary retained — delete ~/.agentsam/bin/agentsamd manually if desired.');
    return 0;
  }

  if (sub === 'install') {
    if (!yes && process.stdin.isTTY) {
      writeLine(write, '  Installing agentsamd (local machine daemon). Pass --yes to confirm.');
    }
    ensureRuntimeStateDir(home);
    const dest = agentsamdPath(home);
    const built = buildAgentsamd(dest, write);
    if (!built.ok) {
      if (json) write(`${JSON.stringify(built, null, 2)}\n`);
      else {
        writeLine(write, `  ✕ ${built.error}`);
        if (built.stderr) writeLine(write, built.stderr.slice(0, 800));
        if (built.hint) writeLine(write, `  ${built.hint}`);
      }
      return 2;
    }
    const launch = writeLaunchAgent(home, dest, write);
    const receiptPath = writeRuntimeInstallReceipt({
      product: 'agentsamd',
      runtime_adapter: 'agentsamd',
      protocol: RUNTIME_PROTOCOL_SCHEMA,
      binary: dest,
      platform: process.platform,
      arch: process.arch,
      launch_agent: launch.path || null,
      distinct_from: 'agentsam-go-worker',
      package: AGENTSMD_PKG,
    }, home);
    const out = { ok: true, binary: dest, launch_agent: launch, receipt: receiptPath };
    if (json) write(`${JSON.stringify(out, null, 2)}\n`);
    else {
      writeLine(write, `  ✓ agentsamd installed`);
      writeLine(write, `  Receipt  ${receiptPath}`);
      writeLine(write, '');
      writeLine(write, '  Next');
      writeLine(write, '    agentsam setup runtime --profile my_computer');
      writeLine(write, '    agentsam terminal enroll --instance <id> --endpoint <url>');
      writeLine(write, '    agentsamd enroll --token <token>');
      writeLine(write, '');
    }
    return 0;
  }

  printHelp(write);
  return 1;
}
