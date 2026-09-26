/**
 * Host identity the CLI sends when enrolling a device.
 * Same vocabulary as ExecOS heartbeat: macos|linux|windows and arm64|x86_64|x86.
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { arch as osArch, hostname as osHostname, platform as osPlatform } from 'node:os';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

export function normalizeTerminalPlatform(value) {
  const raw = clean(value).toLowerCase();
  if (raw === 'darwin' || raw === 'macos' || raw === 'mac' || raw === 'osx') return 'macos';
  if (raw === 'win32' || raw === 'windows' || raw === 'win') return 'windows';
  if (raw === 'linux') return 'linux';
  return null;
}

export function normalizeTerminalArch(value) {
  const raw = clean(value).toLowerCase().replace(/-/g, '_');
  if (raw === 'arm64' || raw === 'aarch64') return 'arm64';
  if (raw === 'x64' || raw === 'x86_64' || raw === 'amd64') return 'x86_64';
  if (raw === 'ia32' || raw === 'i386' || raw === 'i686' || raw === 'x86') return 'x86';
  return null;
}

export function normalizeHostname(value) {
  const raw = clean(value).replace(/\.local$/i, '').replace(/[\u0000\r\n]/g, '');
  if (!raw) return null;
  return raw.slice(0, 255);
}

export function normalizeHardwareModel(value) {
  const raw = clean(value).replace(/[\u0000\r\n]/g, ' ').replace(/\s+/g, ' ');
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === 'unknown' || lower === 'to be filled by o.e.m.' || lower === 'system product name') return null;
  return raw.slice(0, 128);
}

function runText(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 3000, encoding: 'utf8', windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }
      resolve(String(stdout || '').trim() || null);
    });
  });
}

async function readHardwareModel(platform) {
  try {
    if (platform === 'darwin') return runText('sysctl', ['-n', 'hw.model']);
    if (platform === 'win32') {
      return runText('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '(Get-CimInstance Win32_ComputerSystem).Model',
      ]);
    }
    if (platform === 'linux') {
      if (existsSync('/.dockerenv') || process.env.KUBERNETES_SERVICE_HOST) return 'container';
      try {
        return readFileSync('/sys/class/dmi/id/product_name', 'utf8').trim() || null;
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function collectMachineIdentity() {
  let platform = '';
  let arch = '';
  let hostname = '';
  try { platform = osPlatform(); } catch { platform = ''; }
  try { arch = osArch(); } catch { arch = ''; }
  try { hostname = osHostname(); } catch { hostname = ''; }
  let model = null;
  try { model = await readHardwareModel(platform); } catch { model = null; }
  return {
    hostname: normalizeHostname(hostname),
    platform: normalizeTerminalPlatform(platform),
    arch: normalizeTerminalArch(arch),
    model: normalizeHardwareModel(model),
  };
}
