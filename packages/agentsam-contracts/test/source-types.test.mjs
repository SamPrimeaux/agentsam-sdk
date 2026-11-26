import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  createAgentSourceKindReference,
  isAgentSourceFormatReference,
  isAgentSourceKindReference,
  isAgentSourceIdentificationResult,
} from '../dist/source-types-registry.js';
import {
  AGENT_SOURCE_TYPE_CATALOG,
  AGENT_SOURCE_FORMAT_KINDS,
  AGENT_SOURCE_IDENTIFICATION_STATUSES,
  AGENT_SOURCE_IDENTIFICATION_CONFIDENCE,
  AGENT_SOURCE_IDENTIFICATION_EVIDENCE,
} from '../dist/source-types.js';

const readJson = name => JSON.parse(fs.readFileSync(new URL('../schemas/' + name, import.meta.url), 'utf8'));
const readRepoJson = path => JSON.parse(fs.readFileSync(new URL('../../../' + path, import.meta.url), 'utf8'));

test('packaged source type catalog and schema mirror the root contract vocabulary', () => {
  const schema = readJson('source-types.v2.schema.json');
  const catalog = readJson('source-types.v2.json');
  assert.equal(AGENT_SOURCE_TYPE_CATALOG, catalog.schema);
  assert.equal(catalog.schema, 'agentsam.source-types.v2');
  const rootCatalog = readRepoJson('contracts/source-types.v2.json');
  const protocolCatalog = readRepoJson('protocol/contracts/source-types.v2.json');
  assert.deepEqual(catalog, rootCatalog, 'package catalog must be generated from the root authority');
  assert.deepEqual(protocolCatalog, rootCatalog, 'protocol compatibility mirror must match the canonical catalog');
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validateCatalog = ajv.compile(schema);
  assert.equal(validateCatalog(rootCatalog), true, ajv.errorsText(validateCatalog.errors));
  assert.deepEqual(schema.$defs.formatKind.enum, [...AGENT_SOURCE_FORMAT_KINDS]);
  assert.deepEqual(schema.$defs.identificationResult.properties.status.enum, [...AGENT_SOURCE_IDENTIFICATION_STATUSES]);
  assert.deepEqual(schema.$defs.identificationResult.properties.confidence.enum, [...AGENT_SOURCE_IDENTIFICATION_CONFIDENCE]);
  assert.deepEqual(schema.$defs.identificationResult.properties.evidence.items.$ref, '#/$defs/identificationSignal');
  assert.deepEqual(schema.$defs.identificationSignal.enum, [...AGENT_SOURCE_IDENTIFICATION_EVIDENCE]);
  assert.ok(catalog.formats.length >= 180);
  assert.ok(catalog.sourceKinds.length >= 12);
  const byId = new Map(catalog.formats.map(format => [format.id, format]));
  assert.equal(byId.get('video.mp4').kind, 'container');
  assert.ok(byId.get('video.mp4').codecs.includes('codec.video.h264'));
  assert.equal(byId.get('codec.video.h264').kind, 'codec');
  assert.ok(byId.get('codec.video.h264').containerFormats.includes('video.mp4'));
});


test('source references resolve against canonical source catalog IDs', () => {
  const format = { catalog:'agentsam.source-types.v2', id:'model.stl', extension:'.stl' };
  const kind = createAgentSourceKindReference('filesystem.file');
  assert.equal(isAgentSourceFormatReference(format), true);
  assert.equal(isAgentSourceFormatReference({ ...format, id:'model.not-in-catalog' }), false);
  assert.equal(isAgentSourceFormatReference({ ...format, extension:'.unknown' }), false);
  assert.equal(isAgentSourceKindReference(kind), true);
  assert.equal(isAgentSourceKindReference({ catalog:kind.catalog, id:'filesystem.not-real' }), false);
  assert.throws(() => createAgentSourceKindReference('filesystem.not-real'), /agent_source_kind_unknown/);
  assert.equal(isAgentSourceIdentificationResult({ status:'identified', confidence:'high', evidence:['extension'], candidates:[format] }), true);
  assert.equal(isAgentSourceIdentificationResult({ status:'identified', confidence:'high', evidence:['extension'], candidates:[{ ...format, id:'not-real' }] }), false);
});
