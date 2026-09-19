import fs from 'node:fs';
import path from 'node:path';
import { runProcess } from '../../security/process.js';
import { discoverBlender, blenderStatus } from './blender.js';

function isFile(value, existsSync = fs.existsSync) {
  try {
    return Boolean(value) && existsSync(value) && fs.statSync(value).isFile();
  } catch {
    return false;
  }
}

function canonicalExecutable(value) {
  try {
    return fs.realpathSync.native ? fs.realpathSync.native(value) : fs.realpathSync(value);
  } catch {
    return value;
  }
}

function pathCandidates(names, pathEnv, platform) {
  const binaryNames = platform === 'win32'
    ? names.flatMap(n => (n.endsWith('.exe') ? [n] : [`${n}.exe`, n]))
    : names;
  return String(pathEnv || '')
    .split(path.delimiter)
    .filter(Boolean)
    .flatMap(dir => binaryNames.map(name => path.join(dir, name)));
}

/**
 * Discovers OpenSCAD executable across 4 deterministic tiers:
 * 1. explicit command option
 * 2. AGENTSAM_OPENSCAD_BIN
 * 3. PATH
 * 4. allowlisted OS installation paths
 */
export function discoverOpenScad({
  openscadBin,
  env = process.env,
  platform = process.platform,
  existsSync = fs.existsSync,
} = {}) {
  const explicit = String(openscadBin || '').trim();
  if (explicit) {
    const resolved = path.resolve(explicit);
    if (!isFile(resolved, existsSync)) throw new Error(`OpenSCAD binary not found: ${resolved}`);
    return { binary: canonicalExecutable(resolved), source: 'explicit' };
  }

  const configured = String(env.AGENTSAM_OPENSCAD_BIN || '').trim();
  if (configured) {
    const resolved = path.resolve(configured);
    if (!isFile(resolved, existsSync)) throw new Error(`AGENTSAM_OPENSCAD_BIN does not exist: ${resolved}`);
    return { binary: canonicalExecutable(resolved), source: 'env' };
  }

  const inPath = pathCandidates(['openscad'], env.PATH, platform).find(c => isFile(c, existsSync));
  if (inPath) {
    return { binary: canonicalExecutable(inPath), source: 'path' };
  }

  const osCandidates = [
    ...(platform === 'darwin'
      ? [
          '/opt/homebrew/bin/openscad',
          '/usr/local/bin/openscad',
          '/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD',
        ]
      : []),
    ...(platform === 'linux'
      ? ['/usr/bin/openscad', '/usr/local/bin/openscad', '/snap/bin/openscad']
      : []),
    ...(platform === 'win32'
      ? [
          path.join(env.ProgramFiles || 'C:\\Program Files', 'OpenSCAD', 'openscad.exe'),
          path.join(env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'OpenSCAD', 'openscad.exe'),
          path.join(env.LOCALAPPDATA || '', 'Programs', 'OpenSCAD', 'openscad.exe'),
        ]
      : []),
  ];

  const foundOs = osCandidates.find(c => isFile(c, existsSync));
  if (foundOs) {
    return { binary: canonicalExecutable(foundOs), source: 'standard_install' };
  }

  return { binary: null, source: 'none' };
}

/**
 * Probes OpenSCAD version and returns a typed capability receipt.
 */
export async function openScadStatus({
  openscadBin,
  env = process.env,
  runProcessImpl = runProcess,
} = {}) {
  let discovery;
  try {
    discovery = discoverOpenScad({ openscadBin, env });
  } catch (err) {
    return {
      tool: 'openscad',
      name: 'OpenSCAD',
      category: 'deterministic_cad',
      available: false,
      binary: null,
      version: null,
      source: 'error',
      execution_lane: 'native',
      error: err.message,
      supportedFormats: ['stl', 'dxf', 'svg', '3mf', 'csg', 'scad'],
    };
  }

  if (!discovery.binary) {
    return {
      tool: 'openscad',
      name: 'OpenSCAD',
      category: 'deterministic_cad',
      available: false,
      binary: null,
      version: null,
      source: 'none',
      execution_lane: 'native',
      supportedFormats: ['stl', 'dxf', 'svg', '3mf', 'csg', 'scad'],
    };
  }

  try {
    const proc = await runProcessImpl(discovery.binary, ['-v'], {
      timeoutMs: 10_000,
      maxBytes: 256 * 1024,
    });
    const raw = String(proc.stderr || proc.stdout || '').trim();
    const match = raw.match(/OpenSCAD\s+version\s+([^\r\n,;]+)/i);
    const version = match ? match[1].trim() : raw.split(/\r?\n/)[0]?.trim() || null;

    return {
      tool: 'openscad',
      name: 'OpenSCAD',
      category: 'deterministic_cad',
      available: proc.code === 0 || Boolean(version),
      binary: discovery.binary,
      version,
      source: discovery.source,
      execution_lane: 'native',
      supportedFormats: ['stl', 'dxf', 'svg', '3mf', 'csg', 'scad'],
    };
  } catch (err) {
    return {
      tool: 'openscad',
      name: 'OpenSCAD',
      category: 'deterministic_cad',
      available: false,
      binary: discovery.binary,
      version: null,
      source: discovery.source,
      execution_lane: 'native',
      error: err.message,
      supportedFormats: ['stl', 'dxf', 'svg', '3mf', 'csg', 'scad'],
    };
  }
}

/**
 * Discovers FreeCAD / FreeCADCmd executable across 4 deterministic tiers:
 * 1. explicit command option
 * 2. AGENTSAM_FREECAD_BIN
 * 3. PATH
 * 4. allowlisted OS installation paths
 */
export function discoverFreeCad({
  freecadBin,
  env = process.env,
  platform = process.platform,
  existsSync = fs.existsSync,
} = {}) {
  const explicit = String(freecadBin || '').trim();
  if (explicit) {
    const resolved = path.resolve(explicit);
    if (!isFile(resolved, existsSync)) throw new Error(`FreeCAD binary not found: ${resolved}`);
    return { binary: canonicalExecutable(resolved), source: 'explicit' };
  }

  const configured = String(env.AGENTSAM_FREECAD_BIN || '').trim();
  if (configured) {
    const resolved = path.resolve(configured);
    if (!isFile(resolved, existsSync)) throw new Error(`AGENTSAM_FREECAD_BIN does not exist: ${resolved}`);
    return { binary: canonicalExecutable(resolved), source: 'env' };
  }

  const cmdCandidates = [
    ...(platform === 'darwin'
      ? [
          '/Applications/FreeCAD.app/Contents/Resources/bin/FreeCADCmd',
          '/Applications/FreeCAD.app/Contents/MacOS/FreeCADCmd',
          '/opt/homebrew/bin/FreeCADCmd',
          '/usr/local/bin/FreeCADCmd',
        ]
      : []),
    ...(platform === 'linux'
      ? ['/usr/bin/freecadcmd', '/usr/bin/FreeCADCmd', '/usr/local/bin/freecadcmd', '/usr/local/bin/FreeCADCmd']
      : []),
    ...(platform === 'win32'
      ? [
          path.join(env.ProgramFiles || 'C:\\Program Files', 'FreeCAD', 'bin', 'FreeCADCmd.exe'),
          path.join(env.ProgramFiles || 'C:\\Program Files', 'FreeCAD 1.0', 'bin', 'FreeCADCmd.exe'),
          path.join(env.ProgramFiles || 'C:\\Program Files', 'FreeCAD 0.21', 'bin', 'FreeCADCmd.exe'),
          path.join(env.LOCALAPPDATA || '', 'Programs', 'FreeCAD', 'bin', 'FreeCADCmd.exe'),
        ]
      : []),
  ];

  const inPathCmd = pathCandidates(['FreeCADCmd', 'freecadcmd'], env.PATH, platform)
    .find(c => isFile(c, existsSync));
  if (inPathCmd) {
    return { binary: canonicalExecutable(inPathCmd), source: 'path' };
  }

  const foundCmd = cmdCandidates.find(c => isFile(c, existsSync));
  if (foundCmd) {
    return { binary: canonicalExecutable(foundCmd), source: 'standard_install' };
  }

  const inPathGui = pathCandidates(['FreeCAD', 'freecad'], env.PATH, platform)
    .find(c => isFile(c, existsSync));
  if (inPathGui) {
    return { binary: canonicalExecutable(inPathGui), source: 'path' };
  }

  const guiCandidates = [
    ...(platform === 'darwin'
      ? [
          '/Applications/FreeCAD.app/Contents/MacOS/FreeCAD',
          '/opt/homebrew/bin/FreeCAD',
          '/usr/local/bin/FreeCAD',
        ]
      : []),
    ...(platform === 'linux'
      ? ['/usr/bin/freecad', '/snap/bin/freecad']
      : []),
  ];

  const foundGui = guiCandidates.find(c => isFile(c, existsSync));
  if (foundGui) {
    return { binary: canonicalExecutable(foundGui), source: 'standard_install' };
  }

  return { binary: null, source: 'none' };
}

/**
 * Probes FreeCAD version and returns a typed capability receipt.
 */
export async function freeCadStatus({
  freecadBin,
  env = process.env,
  runProcessImpl = runProcess,
} = {}) {
  let discovery;
  try {
    discovery = discoverFreeCad({ freecadBin, env });
  } catch (err) {
    return {
      tool: 'freecad',
      name: 'FreeCAD / OpenCASCADE',
      category: 'solid_kernel',
      available: false,
      binary: null,
      version: null,
      source: 'error',
      execution_lane: 'native',
      error: err.message,
      supportedFormats: ['step', 'iges', 'brep', 'fcstd'],
    };
  }

  if (!discovery.binary) {
    return {
      tool: 'freecad',
      name: 'FreeCAD / OpenCASCADE',
      category: 'solid_kernel',
      available: false,
      binary: null,
      version: null,
      source: 'none',
      execution_lane: 'native',
      supportedFormats: ['step', 'iges', 'brep', 'fcstd'],
    };
  }

  try {
    const proc = await runProcessImpl(discovery.binary, ['--version'], {
      timeoutMs: 10_000,
      maxBytes: 256 * 1024,
    });
    const raw = String(proc.stdout || proc.stderr || '').trim();
    const match = raw.match(/FreeCAD\s+([^\r\n]+)/i);
    const line = match ? match[0].trim() : raw.split(/\r?\n/).find(Boolean)?.trim() || null;

    return {
      tool: 'freecad',
      name: 'FreeCAD / OpenCASCADE',
      category: 'solid_kernel',
      available: proc.code === 0,
      binary: discovery.binary,
      version: line,
      source: discovery.source,
      execution_lane: 'native',
      supportedFormats: ['step', 'iges', 'brep', 'fcstd'],
    };
  } catch (err) {
    return {
      tool: 'freecad',
      name: 'FreeCAD / OpenCASCADE',
      category: 'solid_kernel',
      available: false,
      binary: discovery.binary,
      version: null,
      source: discovery.source,
      execution_lane: 'native',
      error: err.message,
      supportedFormats: ['step', 'iges', 'brep', 'fcstd'],
    };
  }
}

/**
 * Discovers Meshy API capability based on machine-local or process credentials.
 */
export function meshyStatus({ env = process.env } = {}) {
  const apiKey = String(env.MESHY_API_KEY || env.AGENTSAM_MESHY_API_KEY || '').trim();
  return {
    tool: 'meshy',
    name: 'Meshy Generative 3D',
    category: 'generative_ai',
    available: Boolean(apiKey),
    binary: null,
    version: apiKey ? 'v2-api' : null,
    source: apiKey ? 'env' : 'none',
    execution_lane: 'cloud_byok',
    supportedFormats: ['glb', 'usdz', 'fbx', 'obj'],
  };
}

/**
 * Bundled browser MuJoCo physics simulation capability.
 */
export function mujocoStatus() {
  return {
    tool: 'mujoco',
    name: 'MuJoCo Physics',
    category: 'simulation',
    available: true,
    binary: null,
    version: '3.x-wasm',
    source: 'bundled',
    execution_lane: 'browser_wasm',
    supportedFormats: ['xml', 'mjcf', 'urdf'],
  };
}

/**
 * Discovers all CAD engines and generative tools, returning deterministic receipts.
 */
export async function discoverAllCadTools({
  openscadBin,
  freecadBin,
  blenderBin,
  env = process.env,
  runProcessImpl = runProcess,
} = {}) {
  const [openscad, freecad, blenderRaw] = await Promise.all([
    openScadStatus({ openscadBin, env, runProcessImpl }),
    freeCadStatus({ freecadBin, env, runProcessImpl }),
    blenderStatus({ blenderBin, runProcessImpl }),
  ]);

  const blender = {
    tool: 'blender',
    name: 'Blender',
    category: 'renderer',
    available: blenderRaw.available,
    binary: blenderRaw.binary,
    version: blenderRaw.version,
    source: blenderRaw.binary ? (blenderRaw.binary.includes('/Applications/') ? 'standard_install' : 'path') : 'none',
    execution_lane: 'native',
    supportedFormats: ['blend', 'glb', 'obj', 'stl', 'png'],
    error: blenderRaw.error || null,
  };

  const meshy = meshyStatus({ env });
  const mujoco = mujocoStatus();

  const tools = [openscad, freecad, blender, meshy, mujoco];
  const availableCount = tools.filter(t => t.available).length;

  return {
    schema_version: 1,
    timestamp: new Date().toISOString(),
    total_tools: tools.length,
    available_tools: availableCount,
    all_systems_ready: availableCount >= 4,
    tools,
  };
}
