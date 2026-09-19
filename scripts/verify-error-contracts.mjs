import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatedErrorContracts } from './generate-error-contracts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const [relative, expected] of Object.entries(generatedErrorContracts())) {
  const actual = fs.readFileSync(path.join(root, relative), 'utf8');
  assert.equal(actual, expected, `${relative} is stale; run npm run errors:generate`);
}
console.log('AgentSam error contracts are deterministic and current.');
