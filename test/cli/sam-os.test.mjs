import test from 'node:test';
import assert from 'node:assert/strict';
import { runSam } from '../../src/commands/sam.js';
import { ensureOS, getOSStatus, registerOSPack } from '../../src/sam/os.js';
import { defineSamOperation } from '../../src/sam/define.js';
import { registerSamOperation, getSamOperation } from '../../src/sam/registry.js';

test('SAM OS bootstraps its offline packaged core without D1', () => {
  const status = ensureOS();
  assert.equal(status.core_count, 10);
  assert.ok(status.available.includes('repository.inspect'));
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
