import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  STORAGE_BUCKET,STOCK_PACKAGE_SCHEMA,createStockPackage,createStockIndex,
  stockObjectKey,stockPackageRef,stockManifestKey,resolveStockObject,
  validateStockSourceFile,sha256,
} from '../scripts/stock-package-v2.mjs';

const dir=new URL('../public/sources/stock/',import.meta.url);
const catalog=JSON.parse(readFileSync(new URL('catalog.json',dir),'utf8'));

test('v2 packages preserve human-stable identities, versioned manifests and all 82 source references',()=>{
  const packages=catalog.items.map(item=>createStockPackage(item));
  const index=createStockIndex(packages);
  assert.equal(packages.length,15);
  assert.equal(index.document.entries.length,15);
  assert.equal(STORAGE_BUCKET,'theme-store');
  assert.equal(index.document.schema,'inneranimalmedia.cms-component-index.v2');
  let fileCount=0;
  const blobs=new Map();
  for(const pkg of packages){
    assert.equal(pkg.manifest.schema,STOCK_PACKAGE_SCHEMA);
    const slug=pkg.manifest.id.slice('platform/'.length);
    assert.equal(pkg.ref,stockPackageRef(slug));
    assert.equal(pkg.key,stockManifestKey(slug));
    assert.match(pkg.key,/^packages\/platform\/[a-z0-9-]+\/1\.0\.0\/manifest\.json$/);
    assert.equal(pkg.sha256,sha256(pkg.bytes));
    for(const file of pkg.manifest.files) {
      fileCount++;
      const bytes=readFileSync(new URL(slug+'/'+file.path,dir));
      const original=catalog.items.find(i=>i.slug===slug);
      validateStockSourceFile(original,original.files.find(f=>f.path===file.path),bytes);
      const resolved=resolveStockObject(pkg.manifest,file.path);
      assert.equal(resolved.object_key,stockObjectKey(file.sha256));
      assert.equal(resolved.bucket,STORAGE_BUCKET);
      assert.equal(sha256(bytes),file.sha256);
      blobs.set(file.object_key,bytes);
      assert.ok(!file.object_key.includes('.html')&&!file.object_key.includes('/vendor/'));
    }
  }
  assert.equal(fileCount,82);
  assert.equal(blobs.size,37);
  assert.equal([...blobs.values()].reduce((n,b)=>n+b.length,0),482595);
  const allFiles=catalog.items.flatMap(i=>i.files);
  assert.equal(allFiles.reduce((n,f)=>n+f.bytes,0),3228513);
  assert.ok(index.key.startsWith('catalogs/cms-components/releases/'));
  assert.equal(index.key.split('/').pop(),index.sha256+'.json');
});

test('identical content gets one key regardless of component or filename',()=>{
 const packages=catalog.items.map(item=>createStockPackage(item));
 const shared=packages.map(p=>resolveStockObject(p.manifest,'vendor/react-dom.js'));
 assert.equal(new Set(shared.map(x=>x.object_key)).size,1);
 assert.equal(shared[0].sha256.length,64);
});

test('versions are explicit; changing contents changes manifest checksum and cannot overwrite an existing version',()=>{
 const original=createStockPackage(catalog.items[0]);
 const changed=structuredClone(catalog.items[0]);
 changed.files[0].bytes++;
 const edited=createStockPackage(changed);
 assert.equal(edited.key,original.key,'same version remains same manifest address');
 assert.notEqual(edited.sha256,original.sha256,'publisher must refuse divergent bytes at immutable address');
 const released=createStockPackage(changed,{version:'1.1.0'});
 assert.notEqual(released.key,original.key);
 assert.match(released.ref,/@1\.1\.0$/);
});

test('manifest resolver rejects path traversal and unlisted files',()=>{
 const pkg=createStockPackage(catalog.items[0]);
 assert.throws(()=>resolveStockObject(pkg.manifest,'../secret'),/stock_package_resolution_invalid/);
 assert.throws(()=>resolveStockObject(pkg.manifest,'vendor/../secret'),/stock_package_resolution_invalid/);
 assert.throws(()=>resolveStockObject(pkg.manifest,'not-in-package.js'),/stock_package_file_not_found/);
 assert.throws(()=>stockObjectKey('deadbeef'),/stock_object_hash_invalid/);
});
