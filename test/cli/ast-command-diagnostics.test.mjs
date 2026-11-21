import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAst } from '../../src/commands/ast.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const binary = path.join(root, 'bin/agentsam');

const cases = [
  { args: ['symbols'], message: /symbol name is required/i },
  { args: ['match', 'one', 'two'], message: /one AST pattern/i },
  { args: ['match'], message: /AST pattern is required/i },
  { args: ['match', '--pattern', '$NAME'], message: /AST language is required/i },
  { args: ['cad'], message: /CAD project file is required/i },
  { args: ['scene'], message: /glTF scene file is required/i },
  { args: ['not-an-ast-command'], message: /Unknown AST command/i },
];

for (const { args, message } of cases) {
  test(`AST ${args.join(' ')} uses canonical CLI usage diagnostics`, async () => {
    await assert.rejects(runAst(args), (error) => {
      assert.match(error.message, message);
      assert.equal(error.exitCode, 2);
      assert.equal(error.envelope?.reason, 'input_invalid');
      assert.equal(error.envelope?.domain, 'tool');
      assert.equal(error.cliContext?.command, 'agentsam ast');
      assert.match(error.cliHints?.example ?? '', /^agentsam ast /);
      return true;
    });
  });
}

test('root npm CLI routes AST validation to the same structured error contract', () => {
  for (const args of [['ast', 'symbols'], ['ast', 'not-an-ast-command']]) {
    const processResult = spawnSync(process.execPath, [binary, ...args, '--json'], {
      cwd: root, encoding: 'utf8', timeout: 15_000,
    });
    assert.equal(processResult.status, 2, processResult.stderr);
    const output = JSON.parse(processResult.stderr.trim());
    assert.equal(output.reason, 'input_invalid');
    assert.equal(output.domain, 'tool');
    assert.equal(output.cli?.command, 'agentsam ast');
    assert.match(output.hints?.example ?? '', /^agentsam ast /);
    assert.equal(processResult.stdout, '');
  }
});
