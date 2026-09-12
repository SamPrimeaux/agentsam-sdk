import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { findProjectRules } from './project-rules.js';

export const AGENT_RUNTIME_FILENAME = 'AGENTSAM.md';
export const AGENT_INSTRUCTION_PRECEDENCE = Object.freeze(['AGENTSAM.md', '.agentsamrules']);

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function findUp(startDir, filename) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 16; i += 1) {
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) return candidate;
    const boundary = fs.existsSync(path.join(dir, '.git')) || fs.existsSync(path.join(dir, '.agentsam', 'config.json'));
    if (boundary) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function findAgentRuntimeContract(startDir = process.cwd()) {
  return findUp(startDir, AGENT_RUNTIME_FILENAME);
}

export function compileAgentInstructions(startDir = process.cwd(), options = {}) {
  const maxChars = Number(options.maxChars ?? 24_000);
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new RangeError('agent instructions maxChars must be a positive integer');

  const runtimePath = options.runtimeFilename ? path.resolve(options.runtimeFilename) : findAgentRuntimeContract(startDir);
  const projectPath = options.projectFilename ? path.resolve(options.projectFilename) : findProjectRules(startDir);
  const descriptors = [
    { id: 'runtime', filename: AGENT_RUNTIME_FILENAME, path: runtimePath },
    { id: 'project', filename: '.agentsamrules', path: projectPath },
  ];
  const sections = [];
  const sources = [];
  let sourceChars = 0;

  for (const descriptor of descriptors) {
    if (!descriptor.path || !fs.existsSync(descriptor.path)) continue;
    const source = fs.readFileSync(descriptor.path, 'utf8');
    sourceChars += source.length;
    sources.push(Object.freeze({
      id: descriptor.id,
      filename: descriptor.filename,
      path: descriptor.path,
      chars: source.length,
      hash: sha256(source),
    }));
    sections.push(`<!-- agentsam:${descriptor.id}:${descriptor.filename} -->\n${source.trim()}\n`);
  }

  const combined = sections.join('\n');
  const truncated = combined.length > maxChars;
  const content = truncated ? `${combined.slice(0, Math.max(0, maxChars - 1))}…` : combined;
  return Object.freeze({
    found: sources.length > 0,
    path: projectPath || runtimePath || null,
    content,
    chars: content.length,
    source_chars: sourceChars,
    truncated,
    hash: combined ? sha256(combined) : null,
    precedence: AGENT_INSTRUCTION_PRECEDENCE,
    sources: Object.freeze(sources),
  });
}
