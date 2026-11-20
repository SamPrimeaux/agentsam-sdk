import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CMS_SCENE_CONTENT_SCHEMA,
  CMS_SCENE_ARTIFACT_SCHEMA,
  ThemeScenesSections,
  createCmsSceneSection,
  readCmsSceneSection,
  createCmsScenePage,
  readCmsScenePage,
  compileCmsScenePage,
  createCmsSceneArtifactManifest,
  validateCmsSceneArtifactManifest,
} from '../src/cms/index.js';

const page = (section = {}) => ({
  id: 'creative-home',
  theme: 'inneranimal',
  shell: 'site-default',
  routes: { shop: '/shop' },
  sections: [{
    id: 'hero',
    scene: 'hero.editorial',
    groups: [{ layout: 'split', blocks: [{ kind: 'copy', eyebrow: 'Studio', title: 'A scene for this site', body: 'Merchant-owned content.' }] }],
    ...section,
  }],
});

test('CMS runtime exposes every cross-product scene as a portable section renderer', () => {
  const catalog = ThemeScenesSections.catalog();
  assert.equal(catalog.length, 10);
  for (const item of catalog) {
    assert.equal(item.rendererKey, item.id);
    assert.equal(item.source, 'theme-scenes');
    assert.equal(item.templateKey, 'portable');
    const defaults = ThemeScenesSections.defaults(item.id);
    assert.equal(defaults.schema, CMS_SCENE_CONTENT_SCHEMA);
    assert.equal(ThemeScenesSections.validate(item.id, defaults).ok, true);
    const markup = ThemeScenesSections.render({ key: 'scene-preview', content: defaults });
    assert.match(markup, /data-cms-section="scene-preview"/);
    assert.match(markup, new RegExp(`data-scene-kind="${item.sceneKind.replaceAll('.', '\\.')}"`));
  }
});

test('CMS section adapter uses existing section identity and keeps the reusable scene definition site independent', () => {
  const section = createCmsSceneSection(page().sections[0], { id: 'hero', key: 'hero', order: 10 });
  assert.equal(section.type, 'section');
  assert.equal(section.templateSku, 'SEC-THEME-SCENES-HERO-EDITORIAL');
  assert.equal(section.rendererKey, 'theme-scenes/hero-editorial');
  assert.equal(section.settings.schema, CMS_SCENE_CONTENT_SCHEMA);
  assert.equal(section.settings.sceneDefinition.scene, 'hero.editorial');
  assert.equal(section.settings.__editor.catalogSku, section.templateSku);
  assert.equal(section.settings.__editor.definitionKey, 'theme-scene-hero-editorial');
  assert.equal('siteId' in section.settings, false);
  const read = readCmsSceneSection(section);
  assert.equal(read.ok, true);
  assert.equal(read.scene.scene, 'hero.editorial');
});

test('CMS scene pages round-trip through the existing page composition envelope', () => {
  const source = page({ scene: 'interactive.stage', sceneDocument: {
    provider: 'url', ref: 'https://cdn.example.test/scenes/studio.iam.json', alt: 'Interactive studio scene',
  } });
  source.sections[0].sceneAnimation = {
    id: 'camera-tour', playback: 'scroll', startProgress: 0.15, endProgress: 0.85,
  };
  source.sections[0].scroll = { mode: 'viewport', duration: 1.2 };
  const composition = createCmsScenePage(source, { siteId: 'site-creative' });
  assert.equal(composition.page.pageType, 'scene');
  assert.equal(composition.page.siteId, 'site-creative');
  assert.equal(composition.sections[0].rendererKey, 'theme-scenes/interactive-stage');
  const read = readCmsScenePage(composition);
  assert.equal(read.ok, true);
  assert.equal(read.page.sections[0].scene, 'interactive.stage');
  assert.equal(read.page.sections[0].sceneAnimation.startProgress, 0.15);
  const plan = compileCmsScenePage(composition);
  assert.equal(plan.validation.ok, true);
  assert.equal(plan.sections[0].sceneHost.animation.id, 'camera-tour');
});

test('CMS renderer hydrates interactive .iamscene documents with scroll animation metadata', () => {
  const source = page({ scene: 'interactive.stage', sceneDocument: {
    provider: 'url', ref: 'https://cdn.example.test/scenes/studio.iam.json', alt: 'Interactive studio scene',
  } });
  source.sections[0].sceneAnimation = {
    id: 'camera-tour', playback: 'scroll', startProgress: 0.2, endProgress: 0.8,
  };
  source.sections[0].scroll = { mode: 'viewport', duration: 1.2 };
  const cms = createCmsSceneSection(source.sections[0]);
  const markup = ThemeScenesSections.render({ key: 'interactive-stage', content: cms.settings });
  assert.match(markup, /data-iam-scene-document="https:\/\/cdn\.example\.test\/scenes\/studio\.iam\.json"/);
  assert.match(markup, /data-iam-scene-animation="camera-tour"/);
  assert.match(markup, /data-iam-scene-playback="scroll"/);
  assert.match(markup, /data-iam-scene-start-progress="0.2"/);
  assert.match(markup, /data-iam-scene-end-progress="0.8"/);
});

test('CMS scene artifacts use the existing scene artifact/content-mode contract and exclude tenant identity', () => {
  const manifest = createCmsSceneArtifactManifest({ artifactKey: 'studio/hero', page: page() });
  assert.equal(manifest.schema, CMS_SCENE_ARTIFACT_SCHEMA);
  assert.equal(manifest.artifact_type, 'scene');
  assert.equal(manifest.content_mode, 'scene');
  assert.equal(manifest.metadata.siteIndependent, true);
  assert.equal(validateCmsSceneArtifactManifest(manifest).ok, true);
  assert.throws(() => createCmsSceneArtifactManifest({
    artifactKey: 'studio/private', page: { ...page(), siteId: 'site-creative' },
  }), /site_independent/);
});

test('scene renderer escapes merchant copy and rejects unsafe media destinations', () => {
  const content = ThemeScenesSections.defaults('theme-scenes/hero-editorial');
  content.headline = '<script>alert(1)</script>';
  const markup = ThemeScenesSections.render({ key: 'safe-scene', content });
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /&lt;script&gt;/);
  content.mediaUrl = 'javascript:alert(1)';
  assert.equal(ThemeScenesSections.validate('theme-scenes/hero-editorial', content).ok, false);
});
