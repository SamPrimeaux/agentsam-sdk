import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  parseSlashInvocation,
  canonicalizeSlashTrigger,
  SkillRegistry,
  SkillRuntime,
  SkillContentResolver,
  createFilesystemObjectStore,
  createMemoryDatabaseContent,
  createUserSkill,
  installSkillFromPath,
  aliasSkill,
  computeSkillContentMetrics,
} from '../../src/skills/index.js';

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-skill-'));
}

test('prose never parses as slash invocation', () => {
  assert.equal(parseSlashInvocation('Hello /deploy please'), null);
  assert.equal(parseSlashInvocation('deploy this'), null);
  assert.equal(parseSlashInvocation(''), null);
});

test('canonical slash parser lowercases and rejects underscores in match path via canonicalize', () => {
  assert.deepEqual(parseSlashInvocation('/CodeBaseIndex .'), {
    trigger: '/codebaseindex',
    args: '.',
  });
  assert.deepEqual(parseSlashInvocation('/cad-export assembly.step'), {
    trigger: '/cad-export',
    args: 'assembly.step',
  });
  assert.equal(canonicalizeSlashTrigger('/Foo_Bar'), '/foo-bar');
});

test('local user skill resolves with zero cloud resources', async () => {
  const home = tmpHome();
  const created = createUserSkill('release-check', { home });
  fs.writeFileSync(
    path.join(created.root, 'SKILL.md'),
    '# Release check\n\nVerify preview then production.\n',
  );

  const runtime = new SkillRuntime({
    registry: new SkillRegistry({ home, builtins: false }),
    contentResolver: new SkillContentResolver(),
  });

  const prose = await runtime.invoke({ input: 'please release check main' });
  assert.equal(prose.matched, false);

  const hit = await runtime.invoke({ input: '/release-check main' });
  assert.equal(hit.matched, true);
  assert.equal(hit.invocation.trigger, '/release-check');
  assert.equal(hit.invocation.args, 'main');
  assert.equal(hit.skill.id, 'release-check');
  assert.equal(hit.interaction.status, 'ready');
  assert.match(hit.modelInstructions.content, /Release check/);
  assert.match(hit.receipt.checksum, /^sha256:/);
  assert.equal(hit.receipt.contentSource, 'local_file');
  assert.equal(hit.receipt.source, 'user');
});

test('slash collision requires alias resolution', () => {
  const home = tmpHome();
  const dirA = path.join(home, 'pkg-a');
  const dirB = path.join(home, 'pkg-b');
  fs.mkdirSync(dirA, { recursive: true });
  fs.mkdirSync(dirB, { recursive: true });
  for (const [dir, id] of [
    [dirA, 'deploy-a'],
    [dirB, 'deploy-b'],
  ]) {
    fs.writeFileSync(
      path.join(dir, 'agentsam.skill.json'),
      JSON.stringify({
        schema: 'agentsam.skill.v1',
        id,
        name: id,
        slash: { suggested: '/deploy' },
        instructions: { source: 'inline', inline: `# ${id}` },
        execution: { mode: 'turn', tools: [], operations: [] },
      }),
    );
  }

  installSkillFromPath(dirA, { home });
  assert.throws(() => installSkillFromPath(dirB, { home }), (err) => err.code === 'SLASH_COLLISION');
  const second = installSkillFromPath(dirB, { home, aliasOnCollision: '/deploy-b' });
  assert.equal(second.trigger, '/deploy-b');

  const registry = new SkillRegistry({ home, builtins: false });
  assert.equal(registry.getByTrigger('/deploy')?.id, 'deploy-a');
  assert.equal(registry.getByTrigger('/deploy-b')?.id, 'deploy-b');
});

test('unknown slash returns suggestions without model', async () => {
  const home = tmpHome();
  createUserSkill('deploy', { home });
  createUserSkill('deploy-check', { home });
  const runtime = new SkillRuntime({
    registry: new SkillRegistry({ home, builtins: false }),
  });
  const miss = await runtime.invoke({ input: '/deply' });
  assert.equal(miss.matched, true);
  assert.equal(miss.interaction.status, 'blocked');
  assert.equal(miss.interaction.prompt.code, 'SKILL_NOT_FOUND');
  assert.match(miss.interaction.prompt.message, /Did you mean/);
  assert.match(miss.interaction.prompt.message, /\/deploy/);
});

test('package_file and object_store adapters resolve without R2 coupling', async () => {
  const home = tmpHome();
  const pkg = path.join(home, 'pkg');
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(pkg, 'SKILL.md'), '# From package\n');
  fs.writeFileSync(
    path.join(pkg, 'agentsam.skill.json'),
    JSON.stringify({
      schema: 'agentsam.skill.v1',
      id: 'pkg-skill',
      name: 'Pkg',
      slash: { suggested: '/pkg-skill' },
      instructions: { source: 'package_file', ref: './SKILL.md' },
      execution: { mode: 'turn' },
    }),
  );
  installSkillFromPath(pkg, { home });

  const storeRoot = path.join(home, 'objects');
  fs.mkdirSync(storeRoot, { recursive: true });
  fs.writeFileSync(path.join(storeRoot, 'remote.md'), '# From object store\n');

  const resolver = new SkillContentResolver({
    objectStore: createFilesystemObjectStore(storeRoot),
    database: createMemoryDatabaseContent(new Map([['db:1', '# From database\n']])),
  });

  const runtime = new SkillRuntime({
    registry: new SkillRegistry({ home, builtins: false }),
    contentResolver: resolver,
  });
  const pkgHit = await runtime.invoke({ input: '/pkg-skill' });
  assert.match(pkgHit.modelInstructions.content, /From package/);

  const objectManifest = {
    schema: 'agentsam.skill.v1',
    id: 'obj-skill',
    name: 'Obj',
    instructions: { source: 'object_store', ref: 'remote.md' },
    execution: { mode: 'turn' },
  };
  const obj = await resolver.resolve(objectManifest);
  assert.match(obj.content, /object store/);

  const db = await resolver.resolve({
    schema: 'agentsam.skill.v1',
    id: 'db-skill',
    name: 'Db',
    instructions: { source: 'database', ref: 'db:1' },
    execution: { mode: 'turn' },
  });
  assert.match(db.content, /database/);
});

test('tool requirements block without subagent lookup', async () => {
  const home = tmpHome();
  const dir = path.join(home, 'toolish');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'agentsam.skill.json'),
    JSON.stringify({
      schema: 'agentsam.skill.v1',
      id: 'needs-tools',
      name: 'Needs tools',
      slash: { suggested: '/needs-tools' },
      instructions: { source: 'inline', inline: '# Need tools' },
      execution: {
        mode: 'turn',
        tools: ['repository.inspect', 'missing.tool'],
        operations: ['codebaseindex.ingest'],
      },
    }),
  );
  installSkillFromPath(dir, { home });

  const runtime = new SkillRuntime({
    registry: new SkillRegistry({ home, builtins: false }),
    toolRegistry: { has: (id) => id === 'repository.inspect' },
  });
  const result = await runtime.invoke({ input: '/needs-tools' });
  assert.equal(result.interaction.status, 'blocked');
  assert.equal(result.interaction.prompt.code, 'TOOL_REQUIRED');
  assert.match(result.interaction.prompt.message, /missing\.tool/);
});

test('alias remaps trigger; metrics from resolved content', () => {
  const home = tmpHome();
  createUserSkill('brand-scan', { home });
  aliasSkill('brand-scan', '/brand', { home });
  const registry = new SkillRegistry({ home, builtins: false });
  assert.equal(registry.getByTrigger('/brand')?.id, 'brand-scan');
  const metrics = computeSkillContentMetrics('# hi\n\nworld');
  assert.ok(metrics.byte_size > 0);
  assert.ok(metrics.estimated_tokens > 0);
  assert.match(metrics.checksum, /^sha256:/);
});

test('/skills lists vocabulary', async () => {
  const home = tmpHome();
  createUserSkill('one', { home });
  const runtime = new SkillRuntime({
    registry: new SkillRegistry({ home, builtins: false }),
  });
  const result = await runtime.invoke({ input: '/skills' });
  assert.equal(result.matched, true);
  assert.equal(result.interaction.status, 'complete');
  assert.match(result.interaction.prompt.message, /\/one/);
});

test('/skills empty registry offers create path not a circular list tip', async () => {
  const home = tmpHome();
  const runtime = new SkillRuntime({
    registry: new SkillRegistry({ home, builtins: false }),
  });
  const empty = await runtime.invoke({ input: '/skills' });
  assert.equal(empty.interaction.status, 'needs_input');
  assert.equal(empty.interaction.prompt.code, 'NO_SKILLS');
  assert.match(empty.interaction.prompt.message, /agentsam skill create/);
  assert.doesNotMatch(empty.interaction.prompt.message, /agentsam skill list/);

  const hinted = await runtime.invoke({ input: '/skills release-check' });
  assert.match(hinted.interaction.prompt.message, /skill create release-check/);
});
