import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defaultConfig, initRepository, readConfig, scopeKey, embeddingProfileId, openSqliteStore, runIndex, planIndex, retrieve, createGeminiEmbedder, KnowledgeClient } from '../src/knowledge/index.js';
import { parseSource } from '../src/knowledge/source.js';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const write = (root, name, content) => { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), content); };
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-knowledge-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  write(root, 'src/a.ts', 'export function alpha() { return 1; }\nexport function beta() { return 2; }\n');
  write(root, 'other/b.js', 'export const gamma = 3;\n');
  const config = defaultConfig({ include: ['src'] });
  config.embedding = { provider: 'fixture', model: 'deterministic', revision: '1', dimensions: 3, parameters: {} };
  const store = await openSqliteStore(path.join(root, '.agentsam/knowledge/index.sqlite'));
  let calls = 0;
  const embedder = { async embed(text) { calls++; return [1, text.includes('alpha') ? 1 : 0, text.length / 100]; } };
  t.after(async () => { await store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, config, store, embedder, count: () => calls };
}

test('AST parser observes real syntax, spans and unresolved edges; text is labeled separately', () => {
  const code = `import { read } from './io';\nexport class Reader { value() { return read(); } }\n`;
  const parsed = parseSource('reader.ts', code);
  assert.ok(parsed.symbols.some(s => s.name === 'Reader.value'));
  assert.ok(parsed.edges.some(e => e.kind === 'calls' && e.target === 'read' && e.resolved === false));
  assert.equal(parsed.chunks.map(c => c.content).join(''), code.trimEnd());
  assert.equal(parseSource('schema.sql', 'select 1;').parser, 'text:1');
  assert.throws(() => parseSource('bad.ts', 'export function {'), /bad.ts/);
});

test('incremental indexing reuses unchanged functions, moves and deletions; old knowledge remains retrievable', async t => {
  const f = await fixture(t), args = { ...f, embed: true };
  const plan = await planIndex(args);
  assert.equal(f.count(), 0); assert.equal(await f.store.active(scopeKey(f.config)), null);
  assert.equal(plan.receipt.embedding_inputs, 2);
  const first = await runIndex(args);
  assert.equal(f.count(), 2);
  const again = await runIndex(args);
  assert.equal(again.published, false); assert.equal(again.parsed_files, 0); assert.equal(f.count(), 2);
  fs.renameSync(path.join(f.root, 'src/a.ts'), path.join(f.root, 'src/moved.ts'));
  const moved = await runIndex(args);
  assert.equal(moved.embedding_inputs, 0); assert.equal(moved.parsed_files, 0); assert.equal(f.count(), 2);
  write(f.root, 'src/moved.ts', 'export function alpha() { return 100; }\nexport function beta() { return 2; }\n');
  assert.equal((await runIndex(args)).embedding_inputs, 1); assert.equal(f.count(), 3);
  const old = await retrieve({ ...f, text: 'alpha', generationId: first.generation_id });
  assert.ok(old.hits.some(h => h.content.includes('return 1;') && h.path === 'src/a.ts' && h.stale));
  fs.unlinkSync(path.join(f.root, 'src/moved.ts'));
  assert.deepEqual((await runIndex(args)).changes.removed, ['src/moved.ts']);
  assert.equal((await retrieve({ ...f, text: 'alpha' })).hits.length, 0);
  assert.equal((await f.store.history(scopeKey(f.config))).length, 4);
});

test('scope and repository isolation; profile changes cannot silently reuse vectors', async t => {
  const f = await fixture(t);
  await runIndex({ ...f, embed: true });
  const other = structuredClone(f.config); other.scope = { name: 'other', include: ['other'], exclude: [] };
  await runIndex({ ...f, config: other, embed: true });
  assert.equal((await f.store.active(scopeKey(f.config))).files[0].path, 'src/a.ts');
  const changed = structuredClone(f.config); changed.embedding.revision = '2';
  assert.notEqual(embeddingProfileId(changed.embedding), embeddingProfileId(f.config.embedding));
  assert.equal((await planIndex({ ...f, config: changed, embed: true })).receipt.embedding_inputs, 2);
  await assert.rejects(retrieve({ ...f, config: changed, text: 'alpha', semantic: true }), /different embedding profile/);
  const foreign = structuredClone(f.config); foreign.repository_id = 'another-repo';
  assert.equal((await planIndex({ ...f, config: foreign, embed: true })).receipt.embedding_inputs, 2);
  const wider = structuredClone(f.config); wider.scope.include.push('other');
  assert.equal((await planIndex({ ...f, config: wider, embed: true })).receipt.files, 2);
  assert.equal((await planIndex({ ...f, config: wider, embed: true })).receipt.embedding_inputs, 0);
});

test('budgets, invalid vectors and concurrent changes preserve the active generation and useful cached work', async t => {
  const f = await fixture(t);
  const initial = await runIndex(f);
  await assert.rejects(runIndex({ ...f, embed: true, maxInputs: 0 }), /budget/);
  assert.equal(f.count(), 0);
  let requests = 0;
  await assert.rejects(runIndex({ ...f, embed: true, embedder: { async embed() { if (++requests === 2) throw new Error('503'); return [1, 0, 0]; } } }), /503/);
  assert.equal((await f.store.active(scopeKey(f.config))).id, initial.generation_id);
  assert.equal((await planIndex({ ...f, embed: true })).receipt.embedding_inputs, 1);
  await assert.rejects(runIndex({ ...f, embed: true, embedder: { async embed() { return [NaN]; } } }), /finite values/);
  assert.equal((await f.store.active(scopeKey(f.config))).id, initial.generation_id);
  const resumed = await runIndex({ ...f, embed: true }); assert.equal(resumed.embedding_inputs, 1);
  write(f.root, 'src/a.ts', 'export function alpha() { return 33; }');
  await assert.rejects(runIndex({ ...f, embed: true, embedder: { async embed() { write(f.root, 'src/a.ts', 'export function alpha() { return 44; }'); return [1, 0, 0]; } } }), /Repository changed/);
  assert.equal((await f.store.active(scopeKey(f.config))).id, resumed.generation_id);
  const current = await f.store.active(scopeKey(f.config));
  await assert.rejects(f.store.publish({ ...current, id: 'race' }, initial.generation_id), /concurrently/);
  assert.equal((await f.store.active(scopeKey(f.config))).id, resumed.generation_id);
});

test('source safety and setup preserve repository files; read-only plan creates no database', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-adopt-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  write(root, 'package.json', '{"name":"keep-this"}\n');
  write(root, '.env.js', 'SECRET'); write(root, 'src/real.ts', 'export const real = 1;');
  write(root, '.gitignore', 'ignored/\n'); write(root, 'ignored/hidden.ts', 'export const hidden = 1;');
  fs.symlinkSync(path.join(root, '.env.js'), path.join(root, 'src/link.ts'));
  const initial = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  const output = execFileSync(process.execPath, [cli, 'init', '--yes', '--include', 'src'], { cwd: root, encoding: 'utf8' });
  assert.equal(JSON.parse(output).storage, 'sqlite');
  assert.equal(fs.readFileSync(path.join(root, 'package.json'), 'utf8'), initial);
  assert.throws(() => initRepository(root), /EEXIST/);
  const plan = JSON.parse(execFileSync(process.execPath, [cli, 'index', 'plan'], { cwd: root, encoding: 'utf8' }));
  assert.equal(plan.files, 1); assert.deepEqual(plan.skipped, ['src/link.ts']);
  assert.equal(fs.existsSync(path.join(root, '.agentsam/knowledge/index.sqlite')), false);
  const all = readConfig(root); all.scope.include = ['.'];
  const paths = (await planIndex({ root, config: all })).files.map(f => f.path);
  assert.ok(!paths.includes('.env.js')); assert.ok(!paths.includes('ignored/hidden.ts'));
});

test('two independent repositories work through the same CLI and exported package', async t => {
  for (const name of ['customer-a', 'customer-b']) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), name));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    write(root, 'lib/tool.js', `export function ${name.replace('-', '_')}() { return 1; }`);
    const run = args => JSON.parse(execFileSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' }));
    run(['init', '.', '--yes', '--include', 'lib']);
    assert.equal(run(['index', 'run']).published, true);
    assert.equal(run(['index', 'run']).no_change, true);
    assert.equal(run(['search', name.replace('-', '_')]).hits[0].path, 'lib/tool.js');
  }
});

test('Gemini sends task prefixes and configured dimensions, retries transient responses, and rejects unsupported profiles', async () => {
  const requests = [], sleeps = [];
  const adapter = createGeminiEmbedder({ apiKey: 'fixture-key', sleep: async ms => sleeps.push(ms), fetchImpl: async (_url, request) => {
    requests.push(JSON.parse(request.body));
    if (requests.length === 1) return new Response('', { status: 503 });
    return Response.json({ embedding: { values: Array(128).fill(0.1) } });
  } });
  const profile = defaultConfig({ dimensions: 128 }).embedding;
  await adapter.embed('function useful() {}', profile);
  await adapter.embed('find useful', profile, { kind: 'query' });
  assert.equal(requests[1].outputDimensionality, 128);
  assert.equal(requests[1].content.parts[0].text, 'title: none | text: function useful() {}');
  assert.equal(requests[2].content.parts[0].text, 'task: code retrieval | query: find useful');
  assert.equal(requests[1].taskType, undefined); assert.equal(sleeps.length, 1);
  await assert.rejects(adapter.embed('x', { ...profile, parameters: { taskType: 'CODE_RETRIEVAL' } }), /Unsupported/);
  let tries = 0;
  const denied = createGeminiEmbedder({ apiKey: 'fixture-key', fetchImpl: async () => { tries++; return new Response('', { status: 403 }); } });
  await assert.rejects(denied.embed('x', profile), /403/); assert.equal(tries, 1);
});

test('recovered KnowledgeClient contracts remain usable with injected transports', async () => {
  const operations = [];
  const client = new KnowledgeClient({ transport: { async request(op, payload) { operations.push([op, payload]); return { query_id: 'test', hits: [] }; } } });
  await client.retrieve({ text: 'find parser', workspace_id: 'customer' });
  await client.index('repository');
  assert.equal(operations[0][1].top_k, 12); assert.equal(operations[1][0], 'knowledge.index');
});
