import test from 'node:test';
import assert from 'node:assert/strict';
import { createProcedureCatalog } from '../src/index.js';
import { loadPrimeTechSkillCatalog, validatePrimeTechSkillPackage } from '../src/skills.js';

const knownTools = [
  'imgx_generate_image','illustration_create',
  'agentsam_excalidraw','excalidraw_export','excalidraw_load_library','excalidraw_plan_map_create',
  'agentsam_codebase_retrieve','agentsam_terminal_local',
  'browser_navigate','browser_screenshot','browser_run_snapshot','browser_evaluate_script','browser_content',
  'meshy_text_to_3d','meshy_image_to_3d','meshy_multi_image_to_3d','meshy_rig','meshy_animate','meshy_get_task_status',
  'moviemode_render','moviemode_export',
];
const knownOperations = [
  'primetech.icon-family.build','primetech.typeface.package','primetech.sprite-atlas.build',
  'primetech.visuals.compare','primetech.design-system.package','primetech.assets.package',
  'primetech.ebook.package','primetech.production-board.manage',
];
const knownCapabilities = [
  'primetech.procedure.run','media.generate','media.transform','media.status','media.render','media.export',
  'design.read','design.write','design.export','workflow.execute',
  'repository.read','terminal.execute','browser.navigate','browser.capture','browser.execute','browser.read',
];

test('all PrimeTech skills load from the package root and satisfy the AgentSam skill contract', async () => {
  const skills = await loadPrimeTechSkillCatalog();
  assert.equal(skills.length, 9);
  const validation = await validatePrimeTechSkillPackage({ knownTools, knownOperations, knownCapabilities, expectedCount: 9 });
  assert.equal(validation.valid, true, JSON.stringify(validation.skills.filter(skill => !skill.valid)));
  assert.equal(validation.validCount, 9);
  assert.equal(validation.invalidCount, 0);
  assert.ok(skills.every(skill => skill.manifest.execution.mode === 'turn'));
  assert.ok(skills.every(skill => skill.manifest.instructions.ref === 'SKILL.md'));
});

test('every skill operation reference resolves to an available versioned procedure', async () => {
  const skills = await loadPrimeTechSkillCatalog();
  const catalog = createProcedureCatalog();
  const available = new Set(catalog.list().filter(row => row.available).map(row => row.id));
  for (const skill of skills) {
    for (const operation of skill.manifest.execution.operations) {
      assert.ok(available.has(operation), skill.manifest.id + ' references unavailable procedure ' + operation);
    }
  }
});
