import fs from 'node:fs/promises';
import path from 'node:path';
import { buildMerkleTree, saveSnapshot, readSnapshot, diffTrees, normalizePolicy } from '../lib/merkle/index.js';
import { renderSummary, safeText } from '../ui/merkle/render.js';
import { runMerkleExplorer } from '../ui/merkle/explorer.js';

export function printMerkleHelp() {
  console.log(`
  agentsam merkle — deterministic file identity and a terminal explorer

  root [path]                 Compute the directory's Merkle root
  snapshot [path]             Save a manifest (default: <path>/.agentsam/merkle.json)
  verify <snapshot>           Check current files against a saved manifest
  diff <a> <b>                Compare two directories or snapshot files
  inspect [path]              Show every path and hash (also accepts a snapshot)
  tui [path]                  Open the interactive tree explorer

  --out <file>                Snapshot destination
  --force                     Replace an existing snapshot file
  --root <path>               Verify a snapshot against a different directory
  --include <default-rule>    Include an ignored category, e.g. --include dist
  --exclude <path-or-name>    Ignore an additional name or relative subtree
  --tui                       Explore root/inspect/verify/diff interactively
  --json                      Machine-readable output; never opens a TUI

  Examples:
    agentsam merkle root .
    agentsam merkle snapshot . --out .agentsam/merkle.json
    agentsam merkle verify .agentsam/merkle.json --tui
    agentsam merkle diff ./mac-copy ./vm-copy --tui
    agentsam tui merkle .

  TUI: arrows or j/k to move; Enter/right to expand; left to collapse;
       c to filter changes; r to rescan; q/Esc/Ctrl+C to close.
  Exit codes: 0 success/match, 1 differences, 2 error, 130 interrupted scan.
  Includes/excludes are literal rules, not globs or .gitignore syntax.
`);
}

function parse(argv) {
  const [command, ...args] = argv;
  if (!['root', 'snapshot', 'verify', 'diff', 'inspect', 'tui'].includes(command)) throw new Error(`Unknown Merkle command: ${command}`);
  const opts = { command, paths: [], include: [], exclude: [], tui: command === 'tui', json: false, force: false };
  let positionalOnly = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--' && !positionalOnly) { positionalOnly = true; continue; }
    if (positionalOnly || !arg.startsWith('-')) opts.paths.push(arg);
    else if (['--tui', '--json', '--force'].includes(arg)) opts[arg.slice(2)] = true;
    else if (['--out', '--root', '--include', '--exclude'].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      if (['--include', '--exclude'].includes(arg)) opts[arg.slice(2)].push(value);
      else opts[arg.slice(2)] = value;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  const count = command === 'diff' ? 2 : command === 'verify' ? 1 : 0;
  if (opts.paths.length > (count || 1) || (count && opts.paths.length !== count)) throw new Error(`Invalid arguments for ${command}; see agentsam merkle --help.`);
  if (!count && !opts.paths.length) opts.paths.push('.');
  if ((opts.out || opts.force) && command !== 'snapshot') throw new Error('--out and --force apply only to snapshot.');
  if (opts.root && command !== 'verify') throw new Error('--root applies only to verify.');
  if (command === 'snapshot' && opts.tui) throw new Error('Use inspect --tui after saving a snapshot.');
  if (command === 'verify' && (opts.include.length || opts.exclude.length)) throw new Error('Verification uses the snapshot\'s saved ignore rules.');
  opts.policy = normalizePolicy(opts);
  return opts;
}

async function comparison(opts, progress) {
  const inputs = await Promise.all(opts.paths.map(async (target) => ({
    target, snapshot: (await fs.stat(target)).isDirectory() ? null : await readSnapshot(target),
  })));
  const baseline = inputs.find((input) => input.snapshot)?.snapshot;
  if (baseline && (opts.include.length || opts.exclude.length)) throw new Error('Snapshot comparisons use saved ignore rules; omit --include/--exclude.');
  const policy = baseline?.policy || opts.policy;
  const trees = [];
  for (const input of inputs) trees.push(input.snapshot || await buildMerkleTree(input.target, { ...progress, policy }));
  return { title: 'Merkle diff', before: trees[0], tree: trees[1], diff: diffTrees(...trees) };
}

export async function runMerkle(argv = []) {
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) { printMerkleHelp(); return; }
  let opts;
  try {
    opts = parse(argv);
    const load = async (progress = {}) => {
      const target = opts.paths[0];
      if (opts.command === 'verify') {
        const before = await readSnapshot(target);
        const tree = await buildMerkleTree(opts.root || before.rootPath, { ...progress, policy: before.policy });
        return { title: 'Merkle verification', before, tree, diff: diffTrees(before, tree) };
      }
      if (opts.command === 'diff') return comparison(opts, progress);
      if (opts.command === 'snapshot') {
        const { snapshot: tree, output } = await saveSnapshot(target, { ...progress, policy: opts.policy, out: opts.out, force: opts.force });
        return { title: 'Merkle snapshot', tree, output };
      }
      const isSnapshot = ['inspect', 'tui'].includes(opts.command) && !(await fs.stat(target)).isDirectory();
      if (isSnapshot && (opts.include.length || opts.exclude.length)) throw new Error('Snapshot inspection uses saved ignore rules.');
      const tree = isSnapshot ? await readSnapshot(target) : await buildMerkleTree(target, { ...progress, policy: opts.policy });
      return { title: isSnapshot ? 'Saved Merkle tree' : 'Merkle root', tree };
    };
    let result;
    if (opts.tui && !opts.json) result = await runMerkleExplorer(load, { title: path.resolve(opts.paths[0]) });
    else {
      const controller = new AbortController();
      const stop = () => controller.abort();
      process.once('SIGINT', stop); process.once('SIGTERM', stop);
      try { result = await load({ signal: controller.signal }); }
      finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
      if (opts.json) {
        const { rootPath, rootHash, stats, policy } = result.tree;
        const value = result.diff ? { ...result.diff, rootPath, policy } : opts.command === 'snapshot' ? { ...result.tree, output: result.output }
          : opts.command === 'root' ? { rootPath, rootHash, stats, policy } : result.tree;
        process.stdout.write(JSON.stringify(value, null, 2) + '\n');
      } else process.stdout.write(renderSummary(result, { inspect: opts.command === 'inspect', color: process.stdout.isTTY && !Object.hasOwn(process.env, 'NO_COLOR') }));
    }
    if (result?.diff && !result.diff.equal) process.exitCode = 1;
    return result;
  } catch (error) {
    process.exitCode = error.name === 'AbortError' ? 130 : 2;
    process.stderr.write(argv.includes('--json') ? JSON.stringify({ error: error.message }) + '\n' : `Merkle: ${safeText(error.message)}\n`);
  }
}
