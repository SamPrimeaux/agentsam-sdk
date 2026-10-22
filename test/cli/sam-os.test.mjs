import test from 'node:test';
import assert from 'node:assert/strict';
import { runSam } from '../../src/commands/sam.js';
import { CORE_OPERATIONS } from '../../src/sam/packs/core.js';
import { ensureOS, getOSStatus, registerOSPack, createSamOS } from '../../src/sam/os.js';
import { defineSamOperation } from '../../src/sam/define.js';
import { registerSamOperation, getSamOperation } from '../../src/sam/registry.js';

test('SAM OS bootstraps its offline packaged core without D1', () => {
  const status = ensureOS();
  assert.equal(status.core_count, CORE_OPERATIONS.length);
  for (const operation of CORE_OPERATIONS) assert.ok(status.available.includes(operation.id), operation.id);
  assert.ok(status.available.includes('repository.inspect'));
  assert.ok(status.available.includes('artifact.render'));
  assert.ok(status.available.includes('robotics.scene.inspect'));
  assert.ok(!status.available.includes('media.image.background.remove'));
});

test('SAM OS CLI reports unbound v2 operations truthfully', async () => {
  let text = '';
  const status = await runSam(['status'], { identityLoader:async()=>null,write: v => { text += v; } });
  assert.equal(status.ok, true);
  assert.ok(status.generated_unbound > 0);
  assert.match(text, /other proposals unbound/);
  const result = await runSam(['describe','media.image.background.remove'], {identityLoader:async()=>null,write:()=>{}});
  assert.equal(result.executable, false);
  assert.equal(result.reason, 'handler_not_installed');
});

test('independent installed operation packs can extend SAM without editing the seed', () => {
  let installs = 0;
  registerOSPack({ id: 'fixture-runtime', install() {
    installs++;
    const op = defineSamOperation({
      id:'testfixture.ping', module:'testfixture', action:'ping',
      summary:'Fixture ping', risk:'read_only',
      execution:{lanes:['local'], model:'never', network:'none', sideEffects:'none'},
      handler:async()=>({pong:true}),
    });
    if (!getSamOperation(op.id)) registerSamOperation(op);
    return { registered: [{name:op.id}], unavailable:[] };
  }});
  const first = ensureOS();
  const second = ensureOS();
  assert.ok(first.available.includes('testfixture.ping'));
  assert.ok(second.available.includes('testfixture.ping'));
  assert.equal(installs,1);
  assert.equal(getOSStatus().pack_status.find(x=>x.id==='fixture-runtime').installed,true);
});


test('SAM OS list includes authenticated host tools and matches status count', async () => {
  const trusted = {accountId:'account_a',actorId:'au_a',installationId:'install_a'};
  const state = {cwd:process.cwd(),projectRoot:process.cwd(),home:'/tmp/fixture-nonexistent-sam-home'};
  const run = (args) => runSam(args, {state,identityLoader:async()=>trusted,write:()=>{}});
  const status = await run(['status']);
  const listed = await run(['list']);
  assert.equal(listed.count,status.bound_count);
  assert.equal(new Set(listed.operations.map(item=>item.id)).size,listed.operations.length);
  assert.ok(listed.operations.some(item=>item.id==='media.image.background.remove' && item.handler_bound===true));
  assert.ok(listed.operations.some(item=>item.id==='repository.inspect'));
  const described = await run(['describe','media.image.background.remove']);
  assert.equal(described.handler_bound,true);
});

test('SAM CLI exposes only explicitly installed host authoring operations', async () => {
  const noopCompiler = {
    compileHtmlAuthoring: () => ({ schema: 'fixture', bindings: [], diagnostics: [] }),
    compileScopedStyles: () => ({ css: '' }),
    compileSourcePatch: ({ source, patches }) => ({ source, patches }),
  };
  const installed = createSamOS({
    core: false,
    authoring: {
      compiler: noopCompiler,
      repository: {
        getSource: async () => ({ source: '<h1>fixture</h1>', revision: 1, contentHash: 'fixture' }),
        saveDraftStyles: async () => ({ ok: true, revisionId: 'draft' }),
        saveSourceDraft: async () => ({ ok: true, revisionId: 'draft', artifactId: 'artifact' }),
      },
      resolveTrustedContext: async () => ({ accountId: 'explicit-host', actorId: 'editor' }),
      authorize: async () => false,
    },
  });
  const options = { os: installed, identityLoader: async () => null, write: () => {} };
  const listed = await runSam(['list'], options);
  assert.deepEqual(listed.operations.map(op => op.id), [
    'sam.authoring.inspect',
    'sam.authoring.previewStyles',
    'sam.authoring.proposeSourcePatch',
    'sam.authoring.saveDraftStyles',
    'sam.authoring.saveSourceDraft',
  ]);
  const status = await runSam(['status'], options);
  assert.equal(status.bound_count, listed.count);
  assert.equal(status.pack_status.length, 0);
  const described = await runSam(['describe', 'sam.authoring.inspect'], options);
  assert.equal(described.ok, true);
  const discovered = await runSam(['discover', 'authoring'], options);
  assert.ok(discovered.operations.some(op => op.id === 'sam.authoring.inspect'));

  // A normal CLI invocation must not inherit another host's installed pack.
  const defaultList = await runSam(['list'], { identityLoader: async () => null, write: () => {} });
  assert.equal(defaultList.operations.some(op => op.id === 'sam.authoring.inspect'), false);
});
