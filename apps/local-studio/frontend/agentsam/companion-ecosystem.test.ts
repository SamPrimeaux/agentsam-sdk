import test from 'node:test';
import assert from 'node:assert/strict';
import { INNERANIMAL_COMPANIONS, extendBuiltInCompanion, companionStateAsset } from './companions.ts';
import { COMPANION_COSTUME_PACKS, COMPANION_DUO_DYNAMICS, COMPANION_HABITATS, COMPANION_QUIZ_QUESTIONS, recommendCompanionFromQuiz } from './companion-ecosystem.ts';

test('habitats reference canonical companion identities without creating duplicates', () => {
  const ids = new Set(INNERANIMAL_COMPANIONS.map((item) => item.id));
  assert.equal(INNERANIMAL_COMPANIONS.length, 19);
  assert.equal(ids.size, INNERANIMAL_COMPANIONS.length);
  for (const habitat of COMPANION_HABITATS) {
    assert.ok(habitat.companionIds.length > 0, `${habitat.id} must contain companions`);
    assert.ok(habitat.collectionKey.startsWith('inneranimal.habitat.'));
    assert.ok(['included', 'collectible'].includes(habitat.accessMode));
    for (const id of habitat.companionIds) assert.ok(ids.has(id), `${habitat.id} references unknown companion ${id}`);
  }
  assert.equal(INNERANIMAL_COMPANIONS.find((item) => item.id === 'architect')?.animal, 'Great horned owl');
  assert.deepEqual(COMPANION_HABITATS.find((item) => item.id === 'night-shift')?.companionIds, ['architect', 'bat', 'badger']);
});

test('planned companions never advertise missing runtime artwork as selectable', () => {
  const planned = INNERANIMAL_COMPANIONS.filter((item) => item.status === 'planned');
  assert.equal(planned.length, 8);
  for (const item of planned) {
    assert.equal(item.selectable, false, `${item.id} must wait for runtime art`);
    assert.equal(item.avatarUrl, null);
    assert.deepEqual(item.states, {});
    assert.ok(item.habitatIds.length);
    assert.ok(item.capabilities.length);
  }
  const approvedAtlasProfiles = planned.filter((item) => item.artworkStatus === 'generated-awaiting-ingest');
  assert.equal(approvedAtlasProfiles.length, 0);
  assert.ok(approvedAtlasProfiles.every((item) => item.visualApproval === 'approved'));
  assert.equal(planned.filter((item) => item.artworkStatus === 'brief-only').length, 8);
});

test('four-question quiz resolves to a selectable founding companion', () => {
  assert.equal(COMPANION_QUIZ_QUESTIONS.length, 4);
  const answers = {
    'work-style': 'automate',
    'problem-style': 'automate-first',
    notice: 'repetition',
    presence: 'quiet',
  };
  const match = recommendCompanionFromQuiz(answers);
  assert.equal(match, 'py');
  assert.equal(INNERANIMAL_COMPANIONS.find((item) => item.id === match)?.selectable, true);
  assert.equal(recommendCompanionFromQuiz({
    'work-style': 'architecture', 'problem-style': 'structure', notice: 'dependencies', presence: 'strategic',
  }), 'architect');
});

test('Geaux and Bella have an explicit strategy-to-execution duo contract', () => {
  const duo = COMPANION_DUO_DYNAMICS.find((item) => item.id === 'geaux-bella-handoff');
  assert.ok(duo);
  assert.equal(duo.fromId, 'geaux');
  assert.equal(duo.toId, 'bella');
  assert.equal(duo.trigger, 'strategy-to-execution');
});


test('PrimeTechPy is a ten-direction costume pack on the existing Py identity', () => {
  assert.equal(COMPANION_COSTUME_PACKS.length, 1);
  const pack = COMPANION_COSTUME_PACKS[0];
  assert.equal(pack.id, 'primetechpy');
  assert.equal(pack.companionId, 'py');
  assert.equal(pack.costumeDirections.length, 10);
  assert.ok(pack.costumeDirections.every((item) => item.visualEnhancement && item.signatureMotion));
  assert.equal(INNERANIMAL_COMPANIONS.filter((item) => item.id === 'py').length, 1);
});

test('built-in character overlay extends animation gallery without modifying packaged source', () => {
  const source = INNERANIMAL_COMPANIONS.find((item) => item.id === 'bella')!;
  const before = source.galleryStates?.length;
  const extended = extendBuiltInCompanion(source, [{
    companionId: 'bella',
    animations: [{ id: 'celebrating', label: 'Celebrating', description: '',
      src: '/brand/custom/bella-celebrating.png', fps: 8, frames: 12, loop: true, kind: 'apng' }],
  }]);
  assert.equal(source.galleryStates?.length, before);
  assert.equal(extended.galleryStates?.length, (before || 0) + 1);
  assert.equal(extended.galleryStates?.at(-1)?.id, 'celebrating');
  assert.equal(companionStateAsset(extended, 'celebrating'), '/brand/custom/bella-celebrating.png');
});
