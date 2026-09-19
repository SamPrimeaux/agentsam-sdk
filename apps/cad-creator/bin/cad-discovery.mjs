import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function isFile(value) {
  try {
    return Boolean(value) && fs.existsSync(value) && fs.statSync(value).isFile();
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

function pathCandidates(names, pathEnv = process.env.PATH, platform = process.platform) {
  const binaryNames = platform === 'win32'
    ? names.flatMap(n => (n.endsWith('.exe') ? [n] : [`${n}.exe`, n]))
    : names;
  return String(pathEnv || '')
    .split(path.delimiter)
    .filter(Boolean)
    .flatMap(dir => binaryNames.map(name => path.join(dir, name)));
}

export function getCadConfigPath() {
  const home = os.homedir();
  return path.join(home, '.agentsam', 'cad.json');
}

export function loadCadConfig() {
  try {
    const configPath = getCadConfigPath();
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch {}
  return null;
}

export function saveCadConfig(config) {
  try {
    const configPath = getCadConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  } catch {}
}

export function getInstallGuidance(tool, platform = process.platform) {
  switch (tool) {
    case 'openscad':
      if (platform === 'darwin') {
        return {
          command: 'brew install openscad',
          description: 'Install OpenSCAD via Homebrew on macOS',
          url: 'https://openscad.org/downloads.html',
        };
      }
      if (platform === 'win32') {
        return {
          command: 'winget install OpenSCAD.OpenSCAD',
          description: 'Install OpenSCAD via Windows Package Manager',
          url: 'https://openscad.org/downloads.html',
        };
      }
      return {
        command: 'sudo apt-get install -y openscad',
        description: 'Install OpenSCAD via apt package manager on Linux',
        url: 'https://openscad.org/downloads.html',
      };

    case 'freecad':
      if (platform === 'darwin') {
        return {
          command: 'brew install --cask freecad',
          description: 'Install FreeCAD via Homebrew Cask on macOS',
          url: 'https://www.freecad.org/downloads.php',
        };
      }
      if (platform === 'win32') {
        return {
          command: 'winget install FreeCAD.FreeCAD',
          description: 'Install FreeCAD via Windows Package Manager',
          url: 'https://www.freecad.org/downloads.php',
        };
      }
      return {
        command: 'sudo apt-get install -y freecad',
        description: 'Install FreeCAD via apt package manager on Linux',
        url: 'https://www.freecad.org/downloads.php',
      };

    case 'blender':
      if (platform === 'darwin') {
        return {
          command: 'brew install --cask blender',
          description: 'Install Blender via Homebrew Cask on macOS',
          url: 'https://www.blender.org/download/',
        };
      }
      if (platform === 'win32') {
        return {
          command: 'winget install BlenderFoundation.Blender',
          description: 'Install Blender via Windows Package Manager',
          url: 'https://www.blender.org/download/',
        };
      }
      return {
        command: 'sudo apt-get install -y blender',
        description: 'Install Blender via apt package manager on Linux',
        url: 'https://www.blender.org/download/',
      };

    default:
      return null;
  }
}

export function discoverOpenScad(env = process.env, platform = process.platform) {
  const configured = String(env.AGENTSAM_OPENSCAD_BIN || '').trim();
  if (configured && isFile(configured)) {
    return { binary: canonicalExecutable(configured), source: 'env' };
  }

  const config = loadCadConfig();
  if (config?.tools?.openscad?.binary && isFile(config.tools.openscad.binary)) {
    return { binary: canonicalExecutable(config.tools.openscad.binary), source: 'user_config' };
  }

  const inPath = pathCandidates(['openscad'], env.PATH, platform).find(c => isFile(c));
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

  const foundOs = osCandidates.find(c => isFile(c));
  if (foundOs) {
    return { binary: canonicalExecutable(foundOs), source: 'standard_install' };
  }

  return { binary: null, source: 'none' };
}

export async function probeOpenScad(env = process.env, platform = process.platform) {
  const { binary, source } = discoverOpenScad(env, platform);
  if (!binary) {
    return {
      tool: 'openscad',
      name: 'OpenSCAD',
      category: 'deterministic_cad',
      available: false,
      binary: null,
      version: null,
      source: 'none',
      execution_lane: 'native',
      install_guidance: getInstallGuidance('openscad', platform),
      supportedFormats: ['stl', 'dxf', 'svg', '3mf', 'csg', 'scad'],
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync(binary, ['-v'], { timeout: 10_000, maxBuffer: 256 * 1024 });
    const raw = String(stderr || stdout || '').trim();
    const match = raw.match(/OpenSCAD\s+version\s+([^\r\n,;]+)/i);
    const version = match ? match[1].trim() : raw.split(/\r?\n/)[0]?.trim() || null;

    return {
      tool: 'openscad',
      name: 'OpenSCAD',
      category: 'deterministic_cad',
      available: true,
      binary,
      version,
      source,
      execution_lane: 'native',
      supportedFormats: ['stl', 'dxf', 'svg', '3mf', 'csg', 'scad'],
    };
  } catch (err) {
    return {
      tool: 'openscad',
      name: 'OpenSCAD',
      category: 'deterministic_cad',
      available: false,
      binary,
      version: null,
      source,
      execution_lane: 'native',
      error: err.message,
      install_guidance: getInstallGuidance('openscad', platform),
      supportedFormats: ['stl', 'dxf', 'svg', '3mf', 'csg', 'scad'],
    };
  }
}

export function discoverFreeCad(env = process.env, platform = process.platform) {
  const configured = String(env.AGENTSAM_FREECAD_BIN || '').trim();
  if (configured && isFile(configured)) {
    return { binary: canonicalExecutable(configured), source: 'env' };
  }

  const config = loadCadConfig();
  if (config?.tools?.freecad?.binary && isFile(config.tools.freecad.binary)) {
    return { binary: canonicalExecutable(config.tools.freecad.binary), source: 'user_config' };
  }

  const cmdCandidates = [
    ...(platform === 'darwin'
      ? [
          '/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd',
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

  const inPathCmd = pathCandidates(['FreeCADCmd', 'freecadcmd'], env.PATH, platform).find(c => isFile(c));
  if (inPathCmd) {
    return { binary: canonicalExecutable(inPathCmd), source: 'path' };
  }

  const foundCmd = cmdCandidates.find(c => isFile(c));
  if (foundCmd) {
    return { binary: canonicalExecutable(foundCmd), source: 'standard_install' };
  }

  const inPathGui = pathCandidates(['FreeCAD', 'freecad'], env.PATH, platform).find(c => isFile(c));
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

  const foundGui = guiCandidates.find(c => isFile(c));
  if (foundGui) {
    return { binary: canonicalExecutable(foundGui), source: 'standard_install' };
  }

  return { binary: null, source: 'none' };
}

export async function probeFreeCad(env = process.env, platform = process.platform) {
  const { binary, source } = discoverFreeCad(env, platform);
  if (!binary) {
    return {
      tool: 'freecad',
      name: 'FreeCAD / OpenCASCADE',
      category: 'solid_kernel',
      available: false,
      binary: null,
      version: null,
      source: 'none',
      execution_lane: 'native',
      install_guidance: getInstallGuidance('freecad', platform),
      supportedFormats: ['step', 'iges', 'brep', 'fcstd'],
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync(binary, ['--version'], { timeout: 10_000, maxBuffer: 256 * 1024 });
    const raw = String(stdout || stderr || '').trim();
    const match = raw.match(/FreeCAD\s+([^\r\n]+)/i);
    const line = match ? match[0].trim() : raw.split(/\r?\n/).find(Boolean)?.trim() || null;

    return {
      tool: 'freecad',
      name: 'FreeCAD / OpenCASCADE',
      category: 'solid_kernel',
      available: true,
      binary,
      version: line,
      source,
      execution_lane: 'native',
      supportedFormats: ['step', 'iges', 'brep', 'fcstd'],
    };
  } catch (err) {
    return {
      tool: 'freecad',
      name: 'FreeCAD / OpenCASCADE',
      category: 'solid_kernel',
      available: false,
      binary,
      version: null,
      source,
      execution_lane: 'native',
      error: err.message,
      install_guidance: getInstallGuidance('freecad', platform),
      supportedFormats: ['step', 'iges', 'brep', 'fcstd'],
    };
  }
}

export function discoverBlender(env = process.env, platform = process.platform) {
  const configured = String(env.AGENTSAM_BLENDER_BIN || '').trim();
  if (configured && isFile(configured)) {
    return { binary: canonicalExecutable(configured), source: 'env' };
  }

  const config = loadCadConfig();
  if (config?.tools?.blender?.binary && isFile(config.tools.blender.binary)) {
    return { binary: canonicalExecutable(config.tools.blender.binary), source: 'user_config' };
  }

  const inPath = pathCandidates(['blender'], env.PATH, platform).find(c => isFile(c));
  if (inPath) {
    return { binary: canonicalExecutable(inPath), source: 'path' };
  }

  const osCandidates = [
    ...(platform === 'darwin'
      ? ['/Applications/Blender.app/Contents/MacOS/Blender', '/Applications/Blender.app/Contents/MacOS/blender']
      : []),
    ...(platform === 'linux'
      ? ['/usr/bin/blender', '/usr/local/bin/blender', '/snap/bin/blender']
      : []),
    ...(platform === 'win32'
      ? [
          path.join(env.ProgramFiles || 'C:\\Program Files', 'Blender Foundation', 'Blender', 'blender.exe'),
          path.join(env.ProgramFiles || 'C:\\Program Files', 'Blender Foundation', 'Blender 4.0', 'blender.exe'),
          path.join(env.ProgramFiles || 'C:\\Program Files', 'Blender Foundation', 'Blender 3.6', 'blender.exe'),
        ]
      : []),
  ];

  const foundOs = osCandidates.find(c => isFile(c));
  if (foundOs) {
    return { binary: canonicalExecutable(foundOs), source: 'standard_install' };
  }

  return { binary: null, source: 'none' };
}

export async function probeBlender(env = process.env, platform = process.platform) {
  const { binary, source } = discoverBlender(env, platform);
  if (!binary) {
    return {
      tool: 'blender',
      name: 'Blender',
      category: 'renderer',
      available: false,
      binary: null,
      version: null,
      source: 'none',
      execution_lane: 'native',
      install_guidance: getInstallGuidance('blender', platform),
      supportedFormats: ['blend', 'glb', 'obj', 'stl', 'png'],
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync(binary, ['--version'], { timeout: 10_000, maxBuffer: 256 * 1024 });
    const raw = String(stdout || stderr || '').trim();
    const version = raw.split(/\r?\n/).find(Boolean)?.trim() || null;

    return {
      tool: 'blender',
      name: 'Blender',
      category: 'renderer',
      available: true,
      binary,
      version,
      source,
      execution_lane: 'native',
      supportedFormats: ['blend', 'glb', 'obj', 'stl', 'png'],
    };
  } catch (err) {
    return {
      tool: 'blender',
      name: 'Blender',
      category: 'renderer',
      available: false,
      binary,
      version: null,
      source,
      execution_lane: 'native',
      error: err.message,
      install_guidance: getInstallGuidance('blender', platform),
      supportedFormats: ['blend', 'glb', 'obj', 'stl', 'png'],
    };
  }
}

export function probeMeshy(env = process.env) {
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

export function probeMujoco() {
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

export async function probeAllCadTools(env = process.env, platform = process.platform, cache = true) {
  const [openscad, freecad, blender] = await Promise.all([
    probeOpenScad(env, platform),
    probeFreeCad(env, platform),
    probeBlender(env, platform),
  ]);

  const meshy = probeMeshy(env);
  const mujoco = probeMujoco();

  const tools = [openscad, freecad, blender, meshy, mujoco];
  const availableCount = tools.filter(t => t.available).length;

  if (cache) {
    const existingConfig = loadCadConfig() || {};
    const toolsConfig = existingConfig.tools || {};

    if (openscad.available && openscad.binary) {
      toolsConfig.openscad = { binary: openscad.binary, version: openscad.version, source: openscad.source };
    }
    if (freecad.available && freecad.binary) {
      toolsConfig.freecad = { binary: freecad.binary, version: freecad.version, source: freecad.source };
    }
    if (blender.available && blender.binary) {
      toolsConfig.blender = { binary: blender.binary, version: blender.version, source: blender.source };
    }

    saveCadConfig({
      version: 1,
      updated_at: new Date().toISOString(),
      tools: toolsConfig,
    });
  }

  return {
    schema_version: 1,
    timestamp: new Date().toISOString(),
    total_tools: tools.length,
    available_tools: availableCount,
    all_systems_ready: availableCount >= 4,
    tools,
  };
}
