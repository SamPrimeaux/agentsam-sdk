/**
 * agentsam runtime — local machine runtime (agentsamd) install / doctor / status.
 * Distinct from agentsam go (cloud service agentsam-go-worker).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  discoverRuntimeFacts,
  ensureRuntimeStateDir,
  runtimeStateDir,
  writeRuntimeInstallReceipt,
  RUNTIME_SETUP_SCHEMA,
} from '../lib/setup/runtime.js';
import { RUNTIME_PROTOCOL_SCHEMA } from '../../packages/runtime-protocol/src/index.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const GO_RUNTIME_ROOT = path.join(REPO_ROOT, 'apps/agentsam-go-worker/runtime');
const AGENTSAMD_MAIN = path.join(GO_RUNTIME_ROOT, 'cmd/agentsamd');

function writeLine(write, value = '') {
  write(`${value}\n`);
}

function printHelp(write) {
  writeLine(write, '');
  writeLine(write, '  Agent Sam · runtime (agentsamd)');
  writeLine(write, '');
  writeLine(write, '  agentsam runtime status [--json]');
  writeLine(write, '  agentsam runtime doctor [--json]');
  writeLine(write, '  agentsam runtime install [--yes]   build agentsamd + install LaunchAgent/bin');
  writeLine(write, '  agentsam runtime start');
  writeLine(write, '  agentsam runtime stop');
  writeLine(write, '  agentsam runtime probe');
  writeLine(write, '');
  writeLine(write, '  Machine daemon ≠ agentsam-go-worker (Cloudflare service).');
  writeLine(write, '  Setup planner: agentsam setup runtime');
  writeLine(write, '');
}

function binDir(home = os.homedir()) {
  return path.join(home, '.agentsam', 'bin');
}

function agentsamdPath(home = os.homedir()) {
  return path.join(binDir(home), process.platform === 'win32' ? 'agentsamd.exe' : 'agentsamd');
}

function pidPath(home = os.homedir()) {
  return path.join(runtimeStateDir(home), 'agentsamd.pid');
}

function listenAddr() {
  return process.env.AGENTSAMD_LISTEN || '127.0.0.1:18765';
}

async function buildAgentsamd(write) {
  if (!fs.existsSync(path.join(AGENTSAMD_MAIN, 'main.go'))) {
    throw new Error(`agentsamd source missing at ${AGENTSAMD_MAIN}`);
  }
  const out = agentsamdPath();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  writeLine(write, `  Building agentsamd → ${out}`);
  await execFileAsync('go', ['build', '-o', out, './cmd/agentsamd'], {
    cwd: GO_RUNTIME_ROOT,
    env: { ...process.env, CGO_ENABLED: '0' },
    timeout: 120000,
  });
  try { fs.chmodSync(out, 0o755); } catch { /* ignore */ }
  return out;
}

function writeLaunchAgent(home, binary) {
  if (process.platform !== 'darwin') return null;
  const label = 'com.inneranimalmedia.agentsamd';
  const plistDir = path.join(home, 'Library', 'LaunchAgents');
  fs.mkdirSync(plistDir, { recursive: true });
  const plist = path.join(plistDir, `${label}.plist`);
  const logDir = path.join(runtimeStateDir(home), 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const contents = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${binary}</string>
    <string>--listen</string>
    <string>${listenAddr()}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${path.join(logDir, 'agentsamd.stdout.log')}</string>
  <key>StandardErrorPath</key><string>${path.join(logDir, 'agentsamd.stderr.log')}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>AGENTSAMD_ROLE</key><string>machine</string>
  </dict>
</dict>
</plist>
`;
  fs.writeFileSync(plist, contents);
  return { label, plist };
}

async function probeAgentsamd() {
  const addr = listenAddr();
  const url = addr.startsWith('http') ? `${addr}/health` : `http://${addr}/health`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body, url };
  } catch (err) {
    return { ok: false, error: String(err?.message || err), url };
  }
}

async function startAgentsamd(home, write) {
  const bin = agentsamdPath(home);
  if (!fs.existsSync(bin)) throw new Error('agentsamd_not_installed');
  const child = spawn(bin, ['--listen', listenAddr()], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, AGENTSAMD_ROLE: 'machine' },
  });
  child.unref();
  ensureRuntimeStateDir(home);
  fs.writeFileSync(pidPath(home), String(child.pid));
  writeLine(write, `  Started agentsamd pid ${child.pid} · ${listenAddr()}`);
  await new Promise((r) => setTimeout(r, 400));
  return probeAgentsamd();
}

function stopAgentsamd(home, write) {
  const file = pidPath(home);
  if (!fs.existsSync(file)) {
    writeLine(write, '  No pid file — nothing to stop');
    return { ok: true, stopped: false };
  }
  const pid = Number(fs.readFileSync(file, 'utf8').trim());
  try {
    if (Number.isFinite(pid) && pid > 0) process.kill(pid, 'SIGTERM');
  } catch {
    /* already dead */
  }
  try { fs.unlinkSync(file); } catch { /* ignore */ }
  writeLine(write, `  Stopped agentsamd${pid ? ` pid ${pid}` : ''}`);
  return { ok: true, stopped: true, pid };
}

export async function runRuntime(argv = [], options = {}) {
  const write = options.write || ((s) => process.stdout.write(s));
  const env = options.env || process.env;
  const home = options.home || os.homedir();
  const json = argv.includes('--json');
  const yes = argv.includes('--yes') || argv.includes('-y');
  const args = argv.filter((a) => !['--json', '--yes', '-y', 'help', '--help', '-h'].includes(a));
  const sub = args[0] || 'status';

  if (argv.includes('help') || argv.includes('--help') || argv.includes('-h')) {
    printHelp(write);
    return 0;
  }

  if (sub === 'status' || sub === 'doctor') {
    const facts = await discoverRuntimeFacts({ env, home });
    const probe = await probeAgentsamd();
    const out = {
      schema: RUNTIME_SETUP_SCHEMA,
      protocol: RUNTIME_PROTOCOL_SCHEMA,
      role: 'machine_daemon',
      product: 'agentsamd',
      distinct_from: 'agentsam-go-worker',
      facts,
      listen: listenAddr(),
      probe,
    };
    if (json) {
      write(`${JSON.stringify(out, null, 2)}\n`);
    } else {
      writeLine(write, '');
      writeLine(write, '  Agent Sam · runtime');
      writeLine(write, `  Protocol   ${RUNTIME_PROTOCOL_SCHEMA}`);
      writeLine(write, `  Binary     ${facts.agentsamd.installed ? facts.agentsamd.binary : '(not installed)'}`);
      writeLine(write, `  Listen     ${listenAddr()}`);
      writeLine(write, `  Health     ${probe.ok ? '✓' : '○'} ${probe.ok ? probe.url : (probe.error || 'unreachable')}`);
      if (probe.ok && probe.body?.implementation) {
        writeLine(write, `  Impl       ${probe.body.implementation}`);
      }
      writeLine(write, '');
      writeLine(write, '  Next');
      writeLine(write, '    agentsam setup runtime');
      writeLine(write, '    agentsam runtime install');
      writeLine(write, '');
    }
    return probe.ok || facts.agentsamd.installed ? 0 : (sub === 'doctor' ? 2 : 0);
  }

  if (sub === 'probe') {
    const probe = await probeAgentsamd();
    if (json) write(`${JSON.stringify(probe, null, 2)}\n`);
    else writeLine(write, probe.ok ? `  ✓ ${probe.url}` : `  ✕ ${probe.error || probe.url}`);
    return probe.ok ? 0 : 2;
  }

  if (sub === 'stop') {
    const result = stopAgentsamd(home, write);
    if (json) write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  if (sub === 'start') {
    const probe = await startAgentsamd(home, write);
    if (json) write(`${JSON.stringify(probe, null, 2)}\n`);
    else writeLine(write, probe.ok ? '  ✓ agentsamd healthy' : `  ✕ probe failed: ${probe.error || probe.status}`);
    return probe.ok ? 0 : 2;
  }

  if (sub === 'install') {
    if (!yes && process.stdin.isTTY) {
      writeLine(write, '  Pass --yes to build and install agentsamd into ~/.agentsam/bin');
    }
    if (!yes && !process.stdin.isTTY) {
      writeLine(write, '  Non-interactive: pass --yes');
      return 1;
    }
    if (!yes) {
      // still allow interactive confirm via --yes only for simplicity in v1
      writeLine(write, '  Re-run: agentsam runtime install --yes');
      return 1;
    }
    let binary;
    try {
      binary = await buildAgentsamd(write);
    } catch (err) {
      writeLine(write, `  ✕ build failed: ${err.message || err}`);
      return 2;
    }
    const launch = writeLaunchAgent(home, binary);
    if (launch) writeLine(write, `  LaunchAgent  ${launch.plist}`);
    const probe = await startAgentsamd(home, write);
    const receiptPath = writeRuntimeInstallReceipt({
      profile_id: 'my_computer',
      product: 'agentsamd',
      protocol: RUNTIME_PROTOCOL_SCHEMA,
      runtime_adapter: 'agentsamd',
      binary,
      listen: listenAddr(),
      launch_agent: launch,
      probe,
      host: {
        platform: process.platform,
        arch: process.arch,
        hostname: os.hostname(),
      },
    }, home);
    writeLine(write, `  Receipt     ${receiptPath}`);
    writeLine(write, probe.ok ? '  ✓ agentsamd installed and healthy' : '  ○ installed; start/probe manually');
    if (json) {
      write(`${JSON.stringify({ binary, launch, probe, receiptPath }, null, 2)}\n`);
    }
    return probe.ok ? 0 : 2;
  }

  printHelp(write);
  writeLine(write, `  Unknown subcommand: ${sub}`);
  return 1;
}
