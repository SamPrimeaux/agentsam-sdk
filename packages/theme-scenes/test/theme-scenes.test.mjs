import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BLOCK_KINDS,
  SCENE_KINDS,
  SCENE_ORIGIN,
  SCROLL_PRESETS,
  composeCardCollection,
  createCopyBlock,
  createActionBlock,
  createDemoBlock,
  createWorkPreset,
  createAgencyHomePreset,
  createPreset,
  listPresets,
  listSceneKinds,
  listThemes,
  resolveTheme,
  themeToCssVars,
  compilePage,
  validatePageContent,
  resolveRoute,
  createDemoHost,
  getSceneKind,
  normalizeSection,
} from '../src/index.js';

describe('theme-scenes contracts', () => {
  it('exports block kinds and scroll presets', () => {
    assert.ok(BLOCK_KINDS.includes('copy'));
    assert.ok(BLOCK_KINDS.includes('demo'));
    assert.equal(SCROLL_PRESETS['sticky-story'].mode, 'sticky-story');
    assert.ok(SCROLL_PRESETS.bridge.length <= 80);
  });

  it('composeCardCollection never invents fillers and adapts layout', () => {
    assert.equal(composeCardCollection([]), null);
    assert.equal(composeCardCollection([{ title: 'A' }]).layout.strategy, 'feature');
    assert.equal(composeCardCollection([{ title: 'A' }, { title: 'B' }]).layout.strategy, 'split');
    assert.equal(
      composeCardCollection([{ title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }]).layout.strategy,
      'grid',
    );
    assert.equal(
      composeCardCollection(Array.from({ length: 6 }, (_, i) => ({ title: String(i) }))).layout.strategy,
      'rail',
    );
  });

  it('resolveRoute uses host route map', () => {
    const href = resolveRoute(
      { type: 'route', ref: 'product.agentsam' },
      { 'product.agentsam': '/agentsam' },
    );
    assert.equal(href, '/agentsam');
    assert.equal(resolveRoute({ type: 'url', href: 'https://example.com' }, {}), 'https://example.com');
  });
});

describe('scenes inventory', () => {
  it('registers harvested scene kinds', () => {
    const ids = listSceneKinds().map((s) => s.id);
    assert.ok(ids.includes('hero.scroll-product'));
    assert.ok(ids.includes('product.demo'));
    assert.ok(ids.includes('bridge.theme'));
    assert.ok(ids.includes('gallery.storyboard'));
    assert.ok(Object.keys(SCENE_KINDS).length >= 8);
  });

  it('maps MeauxIDE / MeauxSQL origins to demo adapters', () => {
    assert.equal(SCENE_ORIGIN['meauxide-block'].becomes, 'product.demo');
    assert.equal(SCENE_ORIGIN['meauxide-block'].adapter, 'agentsam-mini-composer');
    assert.equal(SCENE_ORIGIN['meauxsql-card'].adapter, 'database-editor');
    assert.equal(SCENE_ORIGIN['vibe-shift-transition'].becomes, 'bridge.theme');
  });

  it('normalizeSection fills scroll defaults and drops empty cards', () => {
    const section = normalizeSection({
      id: 'x',
      scene: 'product.stack',
      groups: [
        { blocks: [{ kind: 'cards', items: [] }, createCopyBlock({ title: 'Hi' })] },
      ],
    }, { scrollPresets: SCROLL_PRESETS });
    assert.equal(section.scroll.mode, 'natural');
    assert.equal(section.groups.length, 1);
    assert.equal(section.groups[0].blocks.length, 1);
    assert.equal(section.groups[0].blocks[0].kind, 'copy');
  });
});

describe('themes', () => {
  it('resolves inheritance inneranimal ← foundation', () => {
    const t = resolveTheme('agentsam');
    assert.equal(t.id, 'agentsam');
    assert.ok(t.tokens.color['color.brand.primary'].value);
    assert.ok(t.tokens.type['type.display.xl']);
    const vars = themeToCssVars(t);
    assert.ok(vars['--scene-accent']);
  });

  it('lists foundation family', () => {
    const ids = listThemes().map((t) => t.id);
    assert.deepEqual(ids.sort(), ['agentsam', 'autodidact', 'foundation', 'inneranimal'].sort());
  });
});

describe('presets + compile', () => {
  it('lists presets', () => {
    assert.ok(listPresets().includes('work'));
    assert.ok(listPresets().includes('agency-home'));
  });

  it('createWorkPreset compiles without hardcoded CDN or product hrefs in scenes', () => {
    const page = createWorkPreset({
      heroGroups: [{
        blocks: [
          createCopyBlock({ title: 'Interface clarity.', body: 'System discipline.' }),
          createActionBlock({
            label: 'Open',
            target: { type: 'route', ref: 'product.agentsam' },
          }),
        ],
      }],
      agentsamGroups: [{
        blocks: [
          createCopyBlock({ title: 'AgentSam' }),
          createDemoBlock('agentsam-mini-composer'),
        ],
      }],
      productGroups: [{
        blocks: [
          composeCardCollection([
            { title: 'Database', target: { type: 'route', ref: 'product.database' } },
          ]),
        ],
      }],
    });

    const plan = compilePage(page);
    assert.equal(plan.validation.ok, true);
    assert.ok(plan.cssVars['--scene-accent']);
    assert.equal(plan.sections[0].scene, 'hero.scroll-product');
    assert.equal(plan.sections[1].demoHost.adapter, 'agentsam-mini-composer');
    assert.equal(plan.sections[0].groups[0].blocks[1].href, '/agentsam');

    const dumped = JSON.stringify(plan);
    assert.equal(dumped.includes('imagedelivery.net'), false);
    assert.equal(dumped.includes('bg-[#020617]'), false);
  });

  it('agency-home has bridge + capability scenes', () => {
    const page = createAgencyHomePreset({});
    const scenes = page.sections.map((s) => s.scene);
    assert.ok(scenes.includes('bridge.theme'));
    assert.ok(scenes.includes('capability.grid'));
    assert.ok(scenes.includes('product.demo'));
  });

  it('createPreset rejects unknown names', () => {
    assert.throws(() => createPreset('nope'), /Unknown preset/);
  });

  it('validatePageContent flags missing scene', () => {
    const r = validatePageContent({
      id: 'x',
      theme: 'foundation',
      sections: [{ id: 'a' }],
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.code === 'scene_required'));
  });

  it('createDemoHost rejects unknown adapter', () => {
    assert.throws(() => createDemoHost('fake'), /Unknown demo adapter/);
    assert.equal(getSceneKind('hero.editorial').defaultScroll, 'viewport');
  });
});
