import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ANSI_DEMO = path.join(ROOT, 'examples', 'agentsam-tui-ansi.mjs');
const PYTHON_ROOT = path.join(ROOT, 'python');

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.stdio || 'inherit',
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`${command} stopped by ${signal}`));
      else if (code === 0) resolve(0);
      else reject(new Error(`${command} exited ${code ?? 1}`));
    });
  });
}

function hasScene(args) {
  return args.includes('--scene') || args.some((arg) => arg.startsWith('--scene='));
}

function venvPython(venvRoot) {
  return process.platform === 'win32'
    ? path.join(venvRoot, 'Scripts', 'python.exe')
    : path.join(venvRoot, 'bin', 'python');
}

async function findSystemPython() {
  for (const candidate of process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python']) {
    try {
      await run(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function pythonHasRich(python) {
  try {
    await run(python, ['-c', 'import rich'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function runRich(args) {
  const install = args.includes('--install');
  const forwarded = args.filter((arg) => arg !== '--install');
  const projectVenv = path.resolve(process.cwd(), '.agentsam', 'tui-venv');
  let python = fs.existsSync(venvPython(projectVenv)) ? venvPython(projectVenv) : null;

  if (!python && install) {
    const systemPython = await findSystemPython();
    if (!systemPython) throw new Error('Python 3 is required for the optional Rich TUI.');
    fs.mkdirSync(path.dirname(projectVenv), { recursive: true });
    console.log(`\n  Agent Sam Rich TUI setup\n  · creating ${projectVenv}`);
    await run(systemPython, ['-m', 'venv', projectVenv]);
    python = venvPython(projectVenv);
    console.log('  · installing rich into isolated Agent Sam venv');
    await run(python, ['-m', 'pip', 'install', 'rich>=13.7.0']);
  }

  if (!python) {
    const systemPython = await findSystemPython();
    if (systemPython && (await pythonHasRich(systemPython))) python = systemPython;
  }

  if (!python) {
    throw new Error(
      'Rich TUI is optional and not installed. Run `agentsam tui rich --install` to create an isolated .agentsam/tui-venv.',
    );
  }

  const tuiArgs = hasScene(forwarded) ? forwarded : ['--scene', 'dashboard', ...forwarded];
  const env = {
    ...process.env,
    PYTHONPATH: [PYTHON_ROOT, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
  };
  await run(python, ['-m', 'agentsam_sdk.tui', ...tuiArgs], { env });
}

export async function runTui(argv = []) {
  const args = [...argv];
  const mode = args[0] === 'rich' || args[0] === 'ansi' ? args.shift() : 'ansi';

  if (mode === 'rich') {
    await runRich(args);
    return;
  }

  const ansiArgs = hasScene(args) ? args : ['--scene', 'dashboard', ...args];
  await run(process.execPath, [ANSI_DEMO, ...ansiArgs]);
}
