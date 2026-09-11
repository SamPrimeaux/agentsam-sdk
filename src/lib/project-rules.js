import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const PROJECT_RULES_FILENAME = '.agentsamrules';
export const DEFAULT_PROJECT_RULES_MAX_CHARS = 24_000;

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function defaultProjectRules(projectName = 'this project') {
  return `# Agent Sam project rules

These instructions are committed with ${projectName} and apply when Agent Sam works in this repository.

- Prefer repository evidence over assumptions.
- Prefer structural lookup before semantic retrieval when an exact symbol or relationship can answer the question.
- Keep retrieval bounded: metadata -> cards -> excerpt -> range -> full object only when required.
- Keep secrets, account/runtime state, active runs, and machine-local preferences out of committed project configuration.
- Treat Git as source-control authority and Merkle snapshots as filesystem evidence.
- Run the smallest relevant validation before reporting a code change as complete.

## Project-specific rules

Add repository-specific conventions, commands, constraints, or architecture notes below this line.
`;
}

export function ensureProjectRules(root, projectName = path.basename(path.resolve(root))) {
  const filename = path.join(path.resolve(root), PROJECT_RULES_FILENAME);
  if (fs.existsSync(filename)) return filename;
  fs.writeFileSync(filename, defaultProjectRules(projectName), { encoding: 'utf8', flag: 'wx' });
  return filename;
}

export function findProjectRules(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 16; i += 1) {
    const filename = path.join(dir, PROJECT_RULES_FILENAME);
    if (fs.existsSync(filename)) return filename;
    const projectBoundary = fs.existsSync(path.join(dir, '.git')) || fs.existsSync(path.join(dir, '.agentsam', 'config.json'));
    if (projectBoundary) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function loadProjectRules(startDir = process.cwd(), options = {}) {
  const maxChars = Number(options.maxChars ?? DEFAULT_PROJECT_RULES_MAX_CHARS);
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new RangeError('project rules maxChars must be a positive integer');
  const filename = options.filename ? path.resolve(options.filename) : findProjectRules(startDir);
  if (!filename) return Object.freeze({ found: false, path: null, content: '', chars: 0, truncated: false, hash: null });
  const source = fs.readFileSync(filename, 'utf8');
  const truncated = source.length > maxChars;
  const content = truncated ? `${source.slice(0, Math.max(0, maxChars - 1))}…` : source;
  return Object.freeze({
    found: true,
    path: filename,
    content,
    chars: content.length,
    source_chars: source.length,
    truncated,
    hash: sha256(source),
  });
}
