/**
 * Live, index-free structural inspection of an authorized local source tree.
 *
 * This is deliberately separate from knowledge/index generations: a caller
 * may use it immediately after "agentsam init ." or on a read-only checkout.
 * JS/TS symbols use the bundled TypeScript parser. Other grammars can be
 * queried through an explicitly installed ast-grep ("sg") binary.
 * Never silently substitute grep/embeddings for a structural parse.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseSource, readSource } from '../knowledge/source.js';

const JS_TS = /\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/i;
const OMIT = new Set(['.git', '.agentsam', 'node_modules', 'dist', 'build', 'target', 'coverage', '.next', '.venv', '__pycache__', '.wrangler']);
const MAX_FILES = 2000;
const MAX_RESULTS = 200;

function limitNumber(value, fallback, ceiling) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, ceiling) : fallback;
}

function sourceRoot(root) {
  const absolute = fs.realpathSync(path.resolve(root || process.cwd()));
  if (!fs.statSync(absolute).isDirectory()) throw new Error('AST root must be a directory');
  return absolute;
}

function scopedPath(root, input = '.') {
  const rel = String(input || '.').replaceAll('\\', '/').trim() || '.';
  if (path.isAbsolute(rel) || rel.startsWith('~') || rel.split('/').includes('..')) {
    throw new Error('AST path must be relative to the authorized root');
  }
  const resolved = path.resolve(root, rel);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error('AST path outside workspace');
  if (fs.existsSync(resolved)) {
    const real = fs.realpathSync(resolved);
    if (real !== root && !real.startsWith(root + path.sep)) throw new Error('AST path outside workspace');
  }
  return resolved;
}

/** List JS/TS sources deterministically, bounded, without following symlinks. */
export function listLiveAstFiles(root, options = {}) {
  const base = sourceRoot(root);
  const start = scopedPath(base, options.path || '.');
  const maxFiles = limitNumber(options.maxFiles, 500, MAX_FILES);
  const maxDepth = limitNumber(options.maxDepth, 20, 64);
  const files = [];
  let limited = false;
  let visitedEntries = 0;
  const maxEntries = limitNumber(options.maxEntries, 12000, 50000);
  function descend(absolute, depth) {
    if (files.length >= maxFiles || visitedEntries >= maxEntries) { limited = true; return; }
    visitedEntries++;
    let st;
    try { st = fs.lstatSync(absolute); } catch { return; }
    if (st.isSymbolicLink()) return;
    if (st.isFile()) {
      if (JS_TS.test(absolute)) files.push(path.relative(base, absolute).split(path.sep).join('/'));
      return;
    }
    if (!st.isDirectory() || depth > maxDepth) return;
    const entries = fs.readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= maxFiles || visitedEntries >= maxEntries) { limited = true; return; }
      if (OMIT.has(entry.name) || entry.name.startsWith('.env')) continue;
      if (entry.isSymbolicLink()) continue;
      descend(path.join(absolute, entry.name), depth + 1);
    }
  }
  descend(start, 0);
  return { root: base, files, limited, visited_entries: visitedEntries };
}

/** Immediate JS/TS symbol and call/import-edge lookup, no index or network. */
export function searchLiveAst(root, query, options = {}) {
  const q = String(query || '').trim();
  if (!q) throw new Error('AST symbol query is required');
  const fileSet = listLiveAstFiles(root, options);
  const limit = limitNumber(options.limit, 30, MAX_RESULTS);
  const matches = [];
  const parseErrors = [];
  const edges = [];
  let parsedFiles = 0;
  for (const file of fileSet.files) {
    const source = readSource(fileSet.root, file);
    if (!source) continue;
    let parsed;
    try { parsed = parseSource(file, source.content); }
    catch (error) {
      if (parseErrors.length < 12) parseErrors.push({ path: file, error: String(error.message || error) });
      continue;
    }
    parsedFiles++;
    const lines = source.content.split('\n');
    for (const symbol of parsed.symbols) {
      if (!symbol.name.toLowerCase().includes(q.toLowerCase())) continue;
      matches.push({
        path: file, name: symbol.name, kind: symbol.kind,
        start_line: symbol.start_line, end_line: symbol.end_line,
        source: 'local_working_tree', parser: parsed.parser,
        snippet: lines.slice(Math.max(0, symbol.start_line - 1), Math.min(lines.length, symbol.start_line + 7)).join('\n').slice(0, 1200),
      });
      for (const edge of parsed.edges) {
        if (edge.source === symbol.name && edges.length < MAX_RESULTS) {
          edges.push({ from: symbol.name, from_path: file, to: edge.target, type: edge.kind, resolved: false });
        }
      }
      if (matches.length >= limit) break;
    }
    if (matches.length >= limit) break;
  }
  return {
    ok: true, route: 'live_ast', index_required: false, query: q,
    root: fileSet.root, matches, edges: options.edges === true ? edges : [],
    scanned_files: parsedFiles, candidate_files: fileSet.files.length, visited_entries: fileSet.visited_entries,
    truncated: fileSet.limited || matches.length >= limit,
    errors: parseErrors,
  };
}

/** Use a real ast-grep grammar for other code languages when the binary exists. */
export function matchLiveAst(root, pattern, options = {}) {
  const base = sourceRoot(root);
  const p = String(pattern || '').trim();
  const language = String(options.language || '').trim();
  if (!p) throw new Error('AST pattern is required');
  if (!language || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(language)) {
    throw new Error('AST language is required (e.g. ts, python, rust, go)');
  }
  const scope = scopedPath(base, options.path || '.');
  if (!fs.existsSync(scope)) throw new Error('AST path does not exist');
  const requestedBinary = String(options.binary || 'sg');
  if (!/^(?:sg|ast-grep)$/.test(requestedBinary)) throw new Error('AST binary must be sg or ast-grep');
  // On Linux, /usr/bin/sg is often the shadow-utils group command, not ast-grep.
  // Never interpret that unrelated program's empty stdout as no AST matches.
  const isAstGrep = (candidate) => {
    const result = spawnSync(candidate, ['--version'], {
      cwd: base, encoding: 'utf8', timeout: 3000, shell: false,
    });
    return !result.error && result.status === 0 &&
      /\bast-grep\s+\d/i.test(String(result.stdout || '') + String(result.stderr || ''));
  };
  const binary = isAstGrep(requestedBinary)
    ? requestedBinary
    : requestedBinary === 'sg' && isAstGrep('ast-grep') ? 'ast-grep' : null;
  if (!binary) throw new Error('ast-grep unavailable: install sg/ast-grep for this language; no lexical fallback performed');
  const args = ['run', '--pattern', p, '--lang', language, '--json=compact', scope];
  const run = spawnSync(binary, args, {
    cwd: base, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024, shell: false,
  });
  if (run.error) {
    if (run.error.code === 'ENOENT') throw new Error('ast-grep unavailable: install sg/ast-grep for this language; no lexical fallback performed');
    throw run.error;
  }
  if (![0, 1].includes(run.status)) throw new Error('ast-grep failed: ' + String(run.stderr || '').slice(0, 1000));
  let raw;
  try { raw = JSON.parse(run.stdout || '[]'); }
  catch { throw new Error('ast-grep did not produce valid JSON'); }
  if (!Array.isArray(raw)) throw new Error('ast-grep response must be an array');
  const limit = limitNumber(options.limit, 30, MAX_RESULTS);
  return {
    ok: true, route: 'live_ast_grep', index_required: false,
    pattern: p, language, root: base, truncated: raw.length > limit,
    matches: raw.slice(0, limit).map((hit) => ({
      path: path.relative(base, String(hit.file || '')).split(path.sep).join('/'),
      start_line: Number(hit.range?.start?.line ?? 0) + 1,
      end_line: Number(hit.range?.end?.line ?? 0) + 1,
      kind: hit.language || language,
      text: String(hit.text || hit.lines || '').slice(0, 1200),
      captures: Object.fromEntries(Object.entries(hit.metaVariables?.single || {}).map(([key, val]) => [key, String(val?.text || '').slice(0, 200)])),
      source: 'local_working_tree',
    })),
  };
}

/** Existing SDK RepositoryKnowledgeProvider adapter, without a persistence dependency. */
export function createLiveAstRepositoryProvider(root, defaults = {}) {
  const absolute = sourceRoot(root);
  const find = (input = {}) => searchLiveAst(absolute, input.query || input.name || input.symbol, { ...defaults, ...input });
  return Object.freeze({
    status: async () => ({
      ok: true, provider: 'agentsam-live-ast', root: absolute,
      index_required: false, semantic: false, structure: 'typescript-compiler',
      additional_grammars: 'optional-ast-grep', persistence: 'none',
    }),
    refresh: async () => ({ ok: true, action: 'not_required', index_required: false }),
    findSymbol: async (input) => find(input),
    graph: async (input) => find({ ...input, edges: true }),
    retrieve: async (input) => find(input),
    snapshot: async () => ({
      ok: true, source: 'live_working_tree', root: absolute,
      durable: false, index_required: false,
      note: 'Live results are not an immutable snapshot or a persisted graph generation.',
    }),
  });
}
