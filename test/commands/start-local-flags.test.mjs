import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStartLocalArgs } from '../../src/commands/start-local.js';

test('explicit local worktree path and dedicated lane port are accepted',()=>{
 const root = process.cwd();
 assert.deepEqual(parseStartLocalArgs(['--cwd', root, '--port', '3101']), {cwd:root,port:3101});
 assert.deepEqual(parseStartLocalArgs([]), {});
});
test('invalid ports, unrecognized arguments and missing roots are rejected',()=>{
 assert.throws(()=>parseStartLocalArgs(['--port','999']),/between 1024/);
 assert.throws(()=>parseStartLocalArgs(['--port','3099.4']),/integer/);
 assert.throws(()=>parseStartLocalArgs(['--command','rm']),/unknown argument/);
 assert.throws(()=>parseStartLocalArgs(['--cwd','/__missing_agentsam_lane__']),/existing directory/);
});
