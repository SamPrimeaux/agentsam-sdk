import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  AGENT_SOURCE_TYPE_CATALOG,
  AGENT_SOURCE_FORMAT_KINDS,
  AGENT_SOURCE_IDENTIFICATION_STATUSES,
  AGENT_SOURCE_IDENTIFICATION_CONFIDENCE,
  AGENT_SOURCE_IDENTIFICATION_EVIDENCE,
} from '../dist/source-types.js';

const readJson = name => JSON.parse(fs.readFileSync(new URL('../schemas/' + name, import.meta.url), 'utf8'));

test('packaged source type catalog and schema mirror the root contract vocabulary', () => {
  const schema = readJson('source-types.v2.schema.json');
  const catalog = readJson('source-types.v2.json');
  assert.equal(AGENT_SOURCE_TYPE_CATALOG, catalog.schema);
  assert.equal(catalog.schema, 'agentsam.source-types.v2');
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
