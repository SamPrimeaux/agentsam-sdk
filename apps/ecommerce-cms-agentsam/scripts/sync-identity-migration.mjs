import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(appRoot, '../..');
const sourceRoot = (() => {
  try {
    return path.dirname(fileURLToPath(import.meta.resolve('@inneranimalmedia/agentsam-sdk/identity/migrations/sqlite/001_identity_core.sql')));
  } catch {
    return path.join(repositoryRoot, 'packages/identity/migrations/sqlite');
  }
})();
const outputPath = path.join(appRoot, 'db/migrations/011_storefront_identity.sql');
const sourceFiles = [
  '001_identity_core.sql',
  '002_identity_oauth_client.sql',
  '005_identity_company_native.sql',
  '006_identity_account_security.sql',
  '007_identity_session_revoke_reason.sql',
  '009_identity_scope.sql',
];

const sections = [];
for (const file of sourceFiles) {
  const sql = await readFile(path.join(sourceRoot, file), 'utf8');
  sections.push(`-- Source: packages/identity/migrations/sqlite/${file}\n${sql.trim()}`);
}

const output = [
  '-- GENERATED FILE. Source of truth: @inneranimalmedia/agentsam-sdk/identity portable D1 migrations.',
  '-- The host Ecommerce accounts table is merchant-owned; migration 008_identity_accounts.sql is intentionally excluded.',
  '-- Customer identities are isolated by cms_sites.id through identity scope_id.',
  ...sections,
  '',
].join('\n\n');

await writeFile(outputPath, output);
process.stdout.write(`Generated ${path.relative(appRoot, outputPath)} from ${sourceFiles.length} canonical Identity migrations\n`);
