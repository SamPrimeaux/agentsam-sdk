import assert from 'node:assert/strict';
import test from 'node:test';
import { getSkill, loadSkill, validateCanvasDirections, loadCanvasCreationKnowledge } from '../../src/skills/index.js';

const directions = () => [
  { id: 'editorial', title: 'Editorial restraint', description: 'Quiet typography, sophisticated pacing and uncluttered art direction.', creativeIntent: 'Let hierarchy and typographic composition lead the work.' },
  { id: 'expressive', title: 'Expressive energy', description: 'High-contrast compositions and meaningful narrative motion.', creativeIntent: 'Create an animated but accessible storytelling experience.' },
  { id: 'tactile', title: 'Tactile systems', description: 'Layered materiality and precise geometry-driven visual rhythm.', creativeIntent: 'Convey craft through deliberate dimensional relationships.' },
  { id: 'utility', title: 'Purposeful clarity', description: 'Functional navigation and excellent information architecture.', creativeIntent: 'Optimize for confident action without sacrificing distinctiveness.' },
];

test('new creation and CMS-ready skills are cataloged, packaged and load references', () => {
  assert.equal(getSkill('canvas-creation')?.id, 'agentsam-canvas-creation');
  assert.equal(getSkill('canvas-to-theme')?.id, 'agentsam-cms-ready-creation');
  const creative = loadSkill('creative-canvas', { references: true });
  const cms = loadSkill('cms-ready-canvas', { references: true });
  assert.equal(creative.references.length, 3);
  assert.equal(cms.references.length, 2);
  assert.match(creative.instructions, /four.*creative directions|four.*distinct/i);
  assert.match(creative.instructions, /Canvas is a.*creation document/i);
  assert.match(cms.instructions, /Canvas ≠ CMS theme ≠ installed website ≠ published site/);
  assert.match(cms.references[0].content, /theme-project-store\.mjs/);
});

test('exactly four distinct creative directions are required', () => {
  assert.equal(validateCanvasDirections(directions()).length, 4);
  assert.throws(() => validateCanvasDirections(directions().slice(0, 3)), /canvas_four_directions_required/);
  assert.throws(() => validateCanvasDirections([...directions(), directions()[0]]), /canvas_four_directions_required/);
  const duplicate = directions(); duplicate[1].title = duplicate[0].title;
  assert.throws(() => validateCanvasDirections(duplicate), /canvas_directions_not_distinct/);
});

test('creative directions cannot be a disguised theme/site/template selection', () => {
  for (const field of ['themeId', 'siteId', 'templateId']) {
    const options = directions(); options[0][field] = 'example';
    assert.throws(() => validateCanvasDirections(options), /canvas_direction_must_not_bind_artifact_type/);
  }
});

test('loading knowledge is gated by an actual offered direction selection', () => {
  assert.throws(() => loadCanvasCreationKnowledge({ directions: directions(), kind: 'design' }), /canvas_direction_selection_required/);
  assert.throws(() => loadCanvasCreationKnowledge({ directions: directions(), selectedDirectionId: 'unoffered', kind: 'design' }), /canvas_direction_not_offered/);
  assert.throws(() => loadCanvasCreationKnowledge({ directions: directions(), selectedDirectionId: 'editorial' }), /canvas_document_kind_required/);
});

test('web and commerce load CMS-compatible guidance without constructing any theme', () => {
  const result = loadCanvasCreationKnowledge({ directions: directions(), selectedDirectionId: 'editorial', kind: 'website' });
  assert.equal(result.selectedDirection.id, 'editorial');
  assert.deepEqual(result.skills.map(item => item.skill.id), ['agentsam-canvas-creation', 'agentsam-cms-ready-creation']);
  assert.equal(result.skills[1].references.length, 2);
  assert.equal('themeId' in result, false);
  assert.equal('siteId' in result, false);
});

test('CAD, sketch and movie do not inherit CMS assumptions unless explicitly requested', () => {
  for (const kind of ['cad', 'sketch', 'sculpt', 'movie', 'design']) {
    const result = loadCanvasCreationKnowledge({ directions: directions(), selectedDirectionId: 'tactile', kind });
    assert.deepEqual(result.skills.map(item => item.skill.id), ['agentsam-canvas-creation']);
  }
  const explicit = loadCanvasCreationKnowledge({ directions: directions(), selectedDirectionId: 'tactile', kind: 'design', cmsRequested: true });
  assert.deepEqual(explicit.skills.map(item => item.skill.id), ['agentsam-canvas-creation', 'agentsam-cms-ready-creation']);
});
