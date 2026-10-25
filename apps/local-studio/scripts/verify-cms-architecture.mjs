import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

const db = await read('../backend/worker/cms-db.js');
const service = await read('../backend/worker/cms-service.js');
const source = await read('../backend/worker/cms-source.js');
const route = await read('../frontend/src/routes/(apps)/cms.tsx');
const product = await read('../../ecommerce-cms-agentsam/frontend/cms/capabilities.mjs');

// CMS persistence stays D1 + R2. A Durable Object is not required for ordinary authoring.
for (const [name, source] of [['cms-db', db], ['cms-service', service]]) {
  assert.doesNotMatch(source, /DurableObject|Durable Object|durable_object|env\.[A-Z0-9_]*DO\b/);
}

assert.match(db, /cms_pages/);
assert.match(db, /cms_page_sections/);
assert.match(db, /FROM cms_section_blocks b/); // Current CMS canvas blocks, not the retired standalone editor.
assert.match(service, /resolveWebsiteAssets/);
assert.match(service, /sites\/\$\{siteSlug\}\/public\//);
assert.match(service, /cms\/revisions/);

assert.match(service, /method === 'DELETE'/);
assert.match(service, /deleteSection/);
assert.match(service, /deleteBlock/);
assert.match(service, /website\.binding\.put/);
assert.match(service, /website\.binding\.delete/);

assert.match(route, /\/apps\/ecommerce-cms-agentsam/);
assert.doesNotMatch(route, /client-cms-editor/);
assert.match(service, /handleCmsSourceRequest/);
assert.match(source, /resolveWebsiteAssets/);
assert.match(source, /cms\/drafts\//);
assert.match(source, /cms_source_version/);
assert.match(product, /groups:/);
assert.match(product, /sections:/);
assert.match(product, /blocks:/);
assert.match(product, /compositionSnapshots: true/);

console.log('Local Studio canonical Ecommerce CMS PASS · D1 page/block metadata + R2 source drafts · no retired editor mount');
