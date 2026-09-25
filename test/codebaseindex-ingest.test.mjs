import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  getCliCommand,
  listCliCommands,
  printAssistTip,
  suggestCliCommands,
} from '../src/cli/command-catalog.js';
import { parsePastedPaths, classifyMaterial, stageMaterials } from '../src/lib/ingest/materials.js';
import { ensureSeedOperations, getSamOperation, AgentSamClient } from '../src/sam/index.js';
import { getSkill, loadSkill } from '../src/skills/index.js';
import { resolveHelpTopic, renderHelpOverview } from '../src/ui/cli/help.js';

describe('CLI command catalog assist', () => {
  it('maps ingest alias to codebaseindex with skill tip', () => {
    const entry = getCliCommand('ingest');
    assert.equal(entry?.id, 'codebaseindex');
    assert.equal(entry?.skill, 'agentsam-codebaseindex');
    assert.equal(entry?.operation, 'codebaseindex.ingest');
  });

  it('prints tip: use skill for every catalogued command', () => {
    const chunks = [];
    for (const entry of listCliCommands()) {
      if (!entry.skill) continue;
      printAssistTip(entry, { write: (s) => chunks.push(s) });
    }
    const text = chunks.join('');
    assert.match(text, /tip: use skill agentsam-codebaseindex/);
    assert.match(text, /tip: use skill agentsam-app-fundamentals/);
  });

  it('suggests commands for typos', () => {
    const hits = suggestCliCommands('codebase');
    assert.ok(hits.some((h) => h.id === 'codebaseindex'));
  });
});

describe('material paste/drop intake', () => {
  it('parses pasted multi-path text', () => {
    const paths = parsePastedPaths('/tmp/a.tar.gz\n"./site build"/index.html  screenshot.png');
    assert.ok(paths.includes('/tmp/a.tar.gz'));
    assert.ok(paths.some((p) => p.includes('index.html') || p.endsWith('screenshot.png')));
  });

  it('stages html and classifies archives', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-ingest-'));
    const html = path.join(root, 'page.html');
    fs.writeFileSync(html, '<html><body>hi</body></html>');
    const classified = classifyMaterial(html);
    assert.equal(classified.kind, 'document');

    const tarPath = path.join(root, 'site.tar');
    const bundle = path.join(root, 'bundle');
    fs.mkdirSync(bundle);
    fs.writeFileSync(path.join(bundle, 'index.html'), '<html>build</html>');
    execFileSync('tar', ['-cf', tarPath, '-C', bundle, '.']);

    const staged = stageMaterials({ root, materials: [html, tarPath] });
    assert.equal(staged.schema, 'agentsam.ingest.materials.v1');
    assert.ok(staged.include.length >= 1);
    assert.ok(staged.assets.some((a) => a.kind === 'document') || staged.items.some((i) => i.kind === 'archive'));
    assert.ok(fs.existsSync(path.join(root, staged.stage_root, 'manifest.json')));
  });
});

describe('codebaseindex SAM primitive', () => {
  before(() => ensureSeedOperations());

  it('registers codebaseindex.ingest', () => {
    const op = getSamOperation('codebaseindex.ingest');
    assert.ok(op);
    assert.equal(op.execution.model, 'optional');
    assert.deepEqual(op.cli.command[0], ['codebaseindex']);
  });

  it('skill agentsam-codebaseindex loads', () => {
    assert.ok(getSkill('ingest'));
    const loaded = loadSkill('agentsam-codebaseindex');
    assert.match(loaded.instructions, /codebaseindex\.ingest/);
    assert.match(loaded.instructions, /sam\.codebaseindex\.index\.run/);
  });

  it('describe + discover surface ingest', async () => {
    const sam = new AgentSamClient();
    const info = await sam.describe('codebaseindex.ingest');
    assert.equal(info.ok, true);
    const found = await sam.discover({ query: 'ingest archive embedding' });
    assert.ok(found.operations.some((c) => c.id === 'codebaseindex.ingest'));
  });

  it('plan-only ingest via invoke (repo allowlist)', async () => {
    const sam = new AgentSamClient();
    const result = await sam.invoke('codebaseindex.ingest', {
      root: process.cwd(),
      include: ['src/sam'],
      exclude: ['node_modules', '.git'],
      embeddingChoice: 'none',
      planOnly: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.data?.pipeline, 'sam.codebaseindex.index.run');
    assert.equal(result.data?.mode, 'plan');
  });
});

describe('catalog-driven help', () => {
  it('resolves ingest topic from catalog', () => {
    const topic = resolveHelpTopic('ingest');
    assert.ok(topic);
    assert.ok(topic.rows.some(([cmd]) => cmd.includes('codebaseindex')));
  });

  it('overview mentions skill baseline', () => {
    const text = renderHelpOverview('2.6.3');
    assert.match(text, /tip: use skill/);
    assert.match(text, /command catalog/i);
  });
});
