import test from 'node:test';
import assert from 'node:assert/strict';

import { getCliCommand } from '../../src/cli/command-catalog.js';
import { runStatus } from '../../src/commands/status.js';
import { setupNextCommands } from '../../src/commands/setup.js';
import { renderRepositoryObservation } from '../../src/commands/knowledge.js';

test('status --help is catalog-backed and does not collect runtime state', async () => {
  let output = '';
  let collected = false;
  const result = await runStatus(['--help'], {
    write(value) { output += value; },
    async collectRuntime() {
      collected = true;
      throw new Error('status help must not collect runtime');
    },
  });

  assert.equal(result, null);
  assert.equal(collected, false);
  assert.match(output, /Agent Sam.*status/);
  assert.match(output, /--offline/);
  assert.match(output, /--json/);
});

test('setup next-actions only reference catalogued top-level commands', () => {
  const commands = setupNextCommands(['google.cloud', 'image.vectorize']);
  assert.ok(commands.includes('agentsam status'));
  assert.ok(commands.includes('agentsam capabilities'));
  assert.ok(commands.includes('agentsam google-cloud doctor'));
  assert.ok(!commands.some((command) => command === 'agentsam doctor'));
  assert.ok(!commands.some((command) => command.startsWith('agentsam image ')));

  for (const command of commands) {
    const [, id] = command.split(/\s+/);
    assert.ok(getCliCommand(id), `next action must be catalogued: ${command}`);
  }
});

test('repository summary is human-sized while preserving important machine evidence', () => {
  const output = renderRepositoryObservation({
    data: {
      repo_root: '/tmp/example',
      repo_name: 'example',
      git: { branch: 'main', head_sha: 'abcdef1234567890', dirty: true, changed_paths: 2 },
      summary: { file_count: 2995, source_file_count: 2840, total_lines: 491023 },
      top_level: [
        { path: 'apps', files: 1351, lines: 289444 },
        { path: 'packages', files: 757, lines: 77579 },
      ],
      pressure_points: [
        { path: 'apps/local-studio', pressure_score: 89.5, stability_score: 10.2 },
      ],
    },
  });

  assert.match(output, /Agent Sam · repository/);
  assert.match(output, /example/);
  assert.match(output, /apps\/local-studio/);
  assert.match(output, /not quality grades/);
  assert.match(output, /agentsam repo --json/);
  assert.doesNotMatch(output, /"pressure_points"/);
});
