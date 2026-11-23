// Native FreeCAD host selection for Node callers.
//
// This is a port of python/agentsam_sdk/cad/native.py (discover_freecad, FreeCADHost). The two
// MUST agree: python/tests/fixtures/freecad_host_cases.json is replayed by both test suites, so a
// change to one that is not mirrored in the other fails CI instead of drifting.
//
// A "host" is how to reach FreeCAD's kernel on this machine:
//   mode "python"  - an interpreter that can import FreeCAD (bundled python, or system python + libraryDir)
//   mode "command" - FreeCADCmd, which rejects foreign argv, so the adapter gets its argv from a trampoline
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function isFile(value) {
  try {
    return Boolean(value) && fs.statSync(value).isFile();
  } catch {
    return false;
  }
}

function familyOf(platform) {
  return platform.startsWith('win') ? 'win32' : platform === 'darwin' ? 'darwin' : 'linux';
}

/** PATH lookup with PATHEXT on Windows; a name containing a separator is returned only if it is a file. */
export function whichSync(name, { env = process.env, platform = process.platform, exists = isFile } = {}) {
  const family = familyOf(platform);
  const P = family === 'win32' ? path.win32 : path.posix;
  if (/[\\/]/.test(name)) return exists(name) ? name : null;
  const extensions = family === 'win32'
    ? ['', ...String(env.PATHEXT || '.EXE;.CMD;.BAT').split(';').filter(Boolean)]
    : [''];
  const separator = family === 'win32' ? ';' : ':';
  for (const dir of String(env.PATH || env.Path || '').split(separator).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = P.join(dir, name + extension);
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Resolve an installed FreeCAD host, or null. Never infers capability from a binary alone:
 * callers that need proof run a real solid operation (see `agentsam cad doctor`).
 *
 * Overrides: AGENTSAM_FREECAD_PYTHON, AGENTSAM_FREECAD_CMD, AGENTSAM_FREECAD_HOME, AGENTSAM_FREECAD_LIB.
 */
export function discoverFreeCadHost({
  platform = process.platform,
  env = process.env,
  exists = isFile,
  which,
  homedir = os.homedir,
  listDirectory = directory => fs.readdirSync(directory),
} = {}) {
  const family = familyOf(platform);
  const P = family === 'win32' ? path.win32 : path.posix;
  const lookup = which || (name => whichSync(name, { env, platform, exists }));

  const host = (candidate, mode, source, libraryDir = null) => {
    const resolved = lookup(candidate) || candidate;
    return exists(resolved) ? { executable: String(resolved), mode, platform: family, source, libraryDir } : null;
  };

  const libOverride = env.AGENTSAM_FREECAD_LIB || null;
  if (env.AGENTSAM_FREECAD_PYTHON) {
    const found = host(env.AGENTSAM_FREECAD_PYTHON, 'python', 'environment', libOverride);
    if (found) return found;
  }
  if (env.AGENTSAM_FREECAD_CMD) {
    const found = host(env.AGENTSAM_FREECAD_CMD, 'command', 'environment', libOverride);
    if (found) return found;
  }

  const homes = env.AGENTSAM_FREECAD_HOME ? [env.AGENTSAM_FREECAD_HOME] : [];
  if (family === 'darwin') {
    const userHome = env.HOME || homedir();
    homes.push(
      '/Applications/FreeCAD.app/Contents/Resources',
      P.join(userHome, 'Applications', 'FreeCAD.app', 'Contents', 'Resources'),
    );
    for (const home of homes) {
      const lib = libOverride || P.join(home, 'lib');
      for (const name of ['python', 'python3']) {
        const found = host(P.join(home, 'bin', name), 'python', 'native_bundle', lib);
        if (found) return found;
      }
      for (const name of ['FreeCADCmd', 'freecadcmd']) { // the bundle name is lowercase on FreeCAD 1.x
        const found = host(P.join(home, 'bin', name), 'command', 'native_bundle', lib);
        if (found) return found;
      }
    }
  } else if (family === 'win32') {
    for (const rootName of ['ProgramFiles', 'ProgramW6432', 'ProgramFiles(x86)', 'LOCALAPPDATA']) {
      if (!env[rootName]) continue;
      let entries = [];
      try { entries = listDirectory(env[rootName]); } catch { /* root absent */ }
      for (const entry of entries) if (entry.startsWith('FreeCAD')) homes.push(P.join(env[rootName], entry));
      homes.push(P.join(env[rootName], 'Programs', 'FreeCAD'));
    }
    for (const home of new Set(homes)) {
      for (const folder of [P.join(home, 'bin'), home]) {
        const lib = libOverride || folder;
        for (const [exe, mode] of [['python.exe', 'python'], ['FreeCADCmd.exe', 'command']]) {
          const found = host(P.join(folder, exe), mode, 'native_bundle', lib);
          if (found) return found;
        }
      }
    }
  } else {
    for (const home of homes) {
      const lib = libOverride || P.join(home, 'lib');
      for (const [name, mode] of [['python', 'python'], ['FreeCADCmd', 'command']]) {
        const found = host(P.join(home, 'bin', name), mode, 'configured_install', lib);
        if (found) return found;
      }
    }
    for (const lib of [libOverride, '/usr/lib/freecad/lib', '/usr/lib64/freecad/lib', '/usr/local/lib/freecad/lib']) {
      if (lib && exists(P.join(lib, 'FreeCAD.so'))) {
        const python = lookup('python3');
        const found = python ? host(python, 'python', 'system_python', lib) : null;
        if (found) return found;
      }
    }
  }

  for (const name of ['FreeCADCmd.exe', 'FreeCADCmd', 'freecadcmd']) {
    const found = host(name, 'command', 'path', libOverride);
    if (found) return found;
  }
  return null;
}

/** Environment for running a host: identity (FreeCAD reads HOME/USER), offscreen Qt, library path. */
export function freeCadHostEnvironment(host, base = process.env) {
  const env = { ...base };
  const home = env.HOME || env.USERPROFILE || os.homedir();
  env.HOME ||= home;
  if (host.platform === 'win32') {
    env.USERPROFILE ||= home;
  } else {
    const user = env.USER || env.LOGNAME || path.basename(home);
    env.USER ||= user;
    env.LOGNAME ||= user;
  }
  env.FREECAD_USER_HOME ||= home;
  env.QT_QPA_PLATFORM ||= 'offscreen';
  if (host.libraryDir) {
    const separator = host.platform === 'win32' ? ';' : ':';
    env.PYTHONPATH = [host.libraryDir, env.PYTHONPATH].filter(Boolean).join(separator);
    if (host.platform === 'win32') env.PATH = [host.libraryDir, env.PATH].filter(Boolean).join(separator);
  }
  return env;
}

/**
 * argv (executable first) that runs the fixed adapter on a request file.
 * FreeCADCmd parses script arguments itself (it rejects --operation/--request), so in command mode
 * the unmodified adapter gets its argv from a one-line trampoline. Values are JSON string
 * literals, which are also valid Python string literals, and are never shell-expanded.
 */
export function freeCadAdapterCommand(host, adapter, request, operation = 'build') {
  const argv = [String(adapter), '--operation', operation, '--request', String(request)];
  if (host.mode !== 'command') return [host.executable, ...argv];
  const literal = value => JSON.stringify(value);
  const code = `import runpy, sys; sys.argv = [${argv.map(literal).join(', ')}]; `
    + `runpy.run_path(${literal(argv[0])}, run_name='__main__')`;
  return [host.executable, '-c', code];
}
