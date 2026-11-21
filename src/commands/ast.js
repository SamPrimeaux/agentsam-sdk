/** Instant AST inspection. No index build, SQLite, D1, or embedding provider. */
import path from 'node:path';
import { parseArgs } from 'node:util';
import { searchLiveAst, matchLiveAst } from '../indexing/live-ast.js';
import { inspectLiveGltf } from '../indexing/live-resource-graph.js';
import { inspectLiveCadProject } from '../indexing/live-cad-graph.js';
import { usageError } from '@inneranimalmedia/agentsam-errors';

function usage(message, example) {
  throw usageError(message, { command: 'agentsam ast', hints: { example } });
}

const HELP = [
  'AgentSam live AST (no indexing required)',
  '  agentsam ast symbols NAME [--cwd PATH] [--path DIR] [--limit N] [--edges]',
  '  agentsam ast match --pattern PATTERN --lang ts|python|rust|go|... [--cwd PATH] [--path DIR]',
  '  agentsam ast scene FILE.gltf [--cwd PATH] [--limit N]',
  '  agentsam ast cad FILE.json [--cwd PATH] [--limit N]',
  '  --max-files N    Bound live JS/TS file traversal (default 500)',
  '  --json           Structured JSON output (also the default for tools)',
  '',
  'symbols: bundled TypeScript parser for JavaScript/TypeScript source.',
  'match: real ast-grep grammar for additional languages when sg is installed.',
  'scene: inspect independent glTF objects, materials, meshes and references.',
  'cad: inspect canonical CAD v1/v2 entities, relationships, and assemblies.',
  'Neither mode requires agentsam index run or agentsam codebaseindex.',
].join('\n');

export async function runAst(argv = []) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      cwd: { type: 'string' },
      path: { type: 'string' },
      lang: { type: 'string' },
      language: { type: 'string' },
      pattern: { type: 'string' },
      limit: { type: 'string' },
      'max-files': { type: 'string' },
      edges: { type: 'boolean' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help || !positionals.length) {
    console.log(HELP);
    return;
  }
  const mode = positionals.shift();
  const root = path.resolve(values.cwd || process.cwd());
  const options = {
    path: values.path || '.',
    limit: values.limit ? Number(values.limit) : undefined,
    maxFiles: values['max-files'] ? Number(values['max-files']) : undefined,
    edges: values.edges === true,
  };
  let result;
  if (mode === 'symbols') {
    if (positionals.length !== 1) usage('A symbol name is required.', 'agentsam ast symbols NAME [--cwd PATH]');
    result = searchLiveAst(root, positionals[0], options);
  } else if (mode === 'match') {
    if (positionals.length > 1) usage('Provide one AST pattern (or use --pattern).', 'agentsam ast match --pattern PATTERN --lang ts');
    const pattern = values.pattern || positionals[0];
    if (!pattern?.trim()) usage('An AST pattern is required.', 'agentsam ast match --pattern PATTERN --lang ts');
    if (!(values.lang || values.language)?.trim()) usage('An AST language is required.', 'agentsam ast match --pattern PATTERN --lang ts');
    result = matchLiveAst(root, pattern, {
      ...options, language: values.lang || values.language,
    });
  } else if (mode === 'cad') {
    if (positionals.length !== 1) usage('A CAD project file is required.', 'agentsam ast cad FILE.json [--cwd PATH]');
    result = inspectLiveCadProject(root, positionals[0], { maxNodes: options.limit });
  } else if (mode === 'scene') {
    if (positionals.length !== 1) usage('A glTF scene file is required.', 'agentsam ast scene FILE.gltf [--cwd PATH]');
    result = inspectLiveGltf(root, positionals[0], { maxNodes: options.limit });
  } else {
    usage('Unknown AST command: ' + mode + '. Run agentsam ast --help', 'agentsam ast --help');
  }
  console.log(JSON.stringify(result, null, 2));
}
