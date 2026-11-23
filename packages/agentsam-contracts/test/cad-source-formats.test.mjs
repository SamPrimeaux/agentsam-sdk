import test from 'node:test';
import assert from 'node:assert/strict';
import sourceCatalog from '../schemas/source-types.v2.json' with { type: 'json' };
import {
  CAD_SOURCE_FORMATS, identifyCadFileFormat, cadFormatCandidates,
  cadOutputFormatReference, isCadAutoDiscoveryCandidate,
  runCadFormatOperation, CAD_FORMAT_OPERATIONS,
} from '../dist/cad-source-formats.js';

test('CAD source profile references the one canonical 429-format source-type catalog', () => {
  assert.ok(sourceCatalog.formats.length >= 400);
  const canonical = new Map(sourceCatalog.formats.map(x => [x.id, x]));
  const used = new Set();
  for (const row of CAD_SOURCE_FORMATS) {
    assert.ok(canonical.has(row.id), row.id);
    assert.ok(row.extensions.length > 0, row.id);
    for (const ext of row.extensions) {
      assert.ok(canonical.get(row.id).extensions.includes(ext), row.id + ' ' + ext);
      assert.ok(!used.has(ext), ext + ' default owner duplicated');
      used.add(ext);
    }
  }
});

test('one CAD profile covers engineering, 3D, vector, raster and office deliverables', () => {
  const examples = {
    'master.step':'cad.step',
    'architecture.ifc':'bim.ifc',
    'floorplan.dxf':'cad.dxf',
    'scene.iamgeometry':'model.iamgeometry',
    'scene.iamscene.json':'model.iamscene',
    'prototype.stl':'model.stl',
    'review.glb':'model.glb',
    'linework.svg':'image.svg',
    'photo.png':'image.png',
    'photo.webp':'image.webp',
    'scan.tiff':'image.tiff',
    'specification.pdf':'document.pdf',
    'specification.docx':'document.docx',
    'slides.pptx':'document.pptx',
    'schedule.xlsx':'document.xlsx',
    'notes.odt':'document.odt',
    'readme.md':'document.markdown',
    'clip.mov':'video.quicktime',
  };
  for (const [filename,id] of Object.entries(examples)) {
    assert.equal(identifyCadFileFormat('/project/' + filename)?.id,id,filename);
    assert.equal(identifyCadFileFormat('C:\\Project\\' + filename.toUpperCase())?.id,id,filename);
  }
  assert.equal(identifyCadFileFormat('program.h'),null);
  assert.equal(identifyCadFileFormat('unknown.foobar'),null);
  assert.equal(cadOutputFormatReference('svg')?.id,'image.svg');
  assert.equal(cadOutputFormatReference('docx')?.id,'document.docx');
});

test('automatic inventory excludes incidental prose while explicit selection can identify it', () => {
  assert.equal(identifyCadFileFormat('README.md')?.id,'document.markdown');
  assert.equal(isCadAutoDiscoveryCandidate('document.markdown','README.md'),false);
  assert.equal(isCadAutoDiscoveryCandidate('document.plain-text','LICENSE.txt'),false);
  assert.equal(isCadAutoDiscoveryCandidate('document.html','index.html'),false);
  assert.equal(isCadAutoDiscoveryCandidate('document.docx','spec.docx'),true);
  assert.equal(isCadAutoDiscoveryCandidate('document.pdf','spec.pdf'),true);
  assert.equal(isCadAutoDiscoveryCandidate('data.json','unrelated.json'),false);
  assert.equal(isCadAutoDiscoveryCandidate('data.json','bim-assembly-receipt.json'),true);
});

test('ambiguous extensions disclose other catalog candidates instead of claiming proof', () => {
  assert.deepEqual(cadFormatCandidates('project/model.obj').map(row => row.id),
    ['model.wavefront-obj','binary.coff-object']);
  assert.deepEqual(cadFormatCandidates('scan.ptx').map(row => row.id),
    ['pointcloud.recap-ptx','texture.ptex']);
  assert.equal(identifyCadFileFormat('scan.ptx')?.id,'pointcloud.recap-ptx');
  assert.deepEqual(cadFormatCandidates('not-valid.unlisted'),[]);
});

test('recognition never makes an editor, importer or converter available', async () => {
  assert.deepEqual([...CAD_FORMAT_OPERATIONS],['inspect','import','preview','edit','convert','export','round-trip']);
  const source={path:'document.pdf'};
  await assert.rejects(runCadFormatOperation({filename:'document.pdf',operation:'edit',source}),/adapter_unavailable/);
  await assert.rejects(runCadFormatOperation({filename:'model.obj',operation:'import',source}),/cad_format_ambiguous/);
  await assert.rejects(runCadFormatOperation({filename:'model.obj',operation:'import',source,resolvedFormatId:'image.png'}),/resolution_invalid/);
  await assert.rejects(runCadFormatOperation({filename:'unknown.file',operation:'inspect',source}),/cad_format_unknown/);
});

test('execution requires a matching real adapter; records the adapter result', async () => {
  const calls=[];
  const adapter={
    id:'mock-verified-pdf-inspector',
    formatIds:['document.pdf'],
    operations:['inspect'],
    ready:()=>true,
    execute:async request=>{calls.push(request);return {verified:true,receipt:'fixture-receipt'};},
  };
  const source={uri:'r2://fixtures/spec.pdf'};
  const result=await runCadFormatOperation({filename:'spec.pdf',operation:'inspect',source},[adapter]);
  assert.equal(result.adapterId,adapter.id);
  assert.equal(result.format.id,'document.pdf');
  assert.equal(result.output.receipt,'fixture-receipt');
  assert.equal(calls.length,1);
  assert.equal(calls[0].source,source);
  await assert.rejects(runCadFormatOperation({filename:'spec.pdf',operation:'edit',source},[adapter]),/adapter_unavailable/);
  await assert.rejects(runCadFormatOperation({filename:'spec.pdf',operation:'inspect',source},[{...adapter,ready:()=>false}]),/adapter_unavailable/);
});
