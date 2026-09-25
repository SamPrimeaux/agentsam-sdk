import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AGENTSAM_ICON_KEYS,
  normalizeIconKey,
  isAgentsamIconKey,
  resolveCliIconGlyph,
  createIconRenderer,
  ICON_ALIASES,
} from '../protocol/ui/icon-registry.mjs';
import iconSchema from '../protocol/ui/icon.v1.schema.json' with { type: 'json' };

describe('agentsam.icon.v1', () => {
  it('schema enum matches registry keys', () => {
    assert.deepEqual([...(iconSchema.enum || [])].sort(), [...AGENTSAM_ICON_KEYS].sort());
  });

  it('includes generic fallback and first-class AgentSam concepts', () => {
    for (const key of [
      'generic',
      'database',
      'vector',
      'identity',
      'key',
      'brand',
      'theme',
      'app',
      'repository',
      'connection',
      'metrics',
    ]) {
      assert.equal(isAgentsamIconKey(key), true, key);
    }
  });

  it('normalizes aliases and rejects lucide/emoji-like values to generic', () => {
    assert.equal(normalizeIconKey('db'), 'database');
    assert.equal(normalizeIconKey('repo'), 'repository');
    assert.equal(normalizeIconKey('lucide-database'), 'database');
    assert.equal(normalizeIconKey('🗄️'), 'generic');
    assert.equal(normalizeIconKey(''), 'generic');
    assert.equal(normalizeIconKey('unknown-future-key'), 'generic');
  });

  it('createIconRenderer falls back to generic without throwing', () => {
    const render = createIconRenderer(
      { database: 'DB', generic: 'G', identity: 'ID' },
      'FALLBACK',
    );
    assert.equal(render('database'), 'DB');
    assert.equal(render('db'), 'DB');
    assert.equal(render('not-a-real-icon'), 'G');
    assert.equal(render('identity'), 'ID');
  });

  it('CLI glyphs always resolve', () => {
    assert.ok(resolveCliIconGlyph('database'));
    assert.equal(resolveCliIconGlyph('totally-unknown'), resolveCliIconGlyph('generic'));
  });

  it('aliases only map to canonical vocabulary', () => {
    for (const [from, to] of Object.entries(ICON_ALIASES)) {
      assert.equal(isAgentsamIconKey(to), true, `${from} → ${to}`);
      assert.equal(normalizeIconKey(from), to);
    }
  });
});
