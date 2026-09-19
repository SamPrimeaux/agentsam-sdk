import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_CAD_DOCKER_PORT,
  DEFAULT_CAD_DOCKER_URL,
  resolveDockerServiceConfig,
  probeDockerServiceHealth,
  executeOpenScadDocker,
  executeFreeCadDocker,
  executeBlenderDocker,
} from '../src/lib/cad/docker-executor.js';
import { discoverAllCadTools } from '../src/lib/cad/discovery.js';

test('resolveDockerServiceConfig resolves URL and token from env or options', () => {
  const conf1 = resolveDockerServiceConfig({
    serviceUrl: 'http://custom-host:9999/',
    token: 'secret-token-123',
  });
  assert.equal(conf1.url, 'http://custom-host:9999');
  assert.equal(conf1.token, 'secret-token-123');

  const conf2 = resolveDockerServiceConfig({
    env: {
      AGENTSAM_CAD_SERVICE_URL: 'http://env-host:8888',
      AGENTSAM_CAD_TOKEN: 'env-tok',
    },
  });
  assert.equal(conf2.url, 'http://env-host:8888');
  assert.equal(conf2.token, 'env-tok');

  const confDefault = resolveDockerServiceConfig({ env: {} });
  assert.equal(confDefault.url, DEFAULT_CAD_DOCKER_URL);
  assert.equal(confDefault.token, null);
});

test('probeDockerServiceHealth returns offline gracefully when unreachable', async () => {
  const result = await probeDockerServiceHealth({
    serviceUrl: 'http://127.0.0.1:54321', // Unused port
    timeoutMs: 150,
  });
  assert.equal(result.available, false);
  assert.equal(result.url, 'http://127.0.0.1:54321');
});

test('Docker CAD service executor routes compile, build, and inspect requests', async () => {
  const recordedRequests = [];
  const mockServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      recordedRequests.push({
        url: req.url,
        method: req.method,
        auth: req.headers['authorization'],
        body: body ? JSON.parse(body) : null,
      });

      if (req.url === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          service: 'agentsam-cad',
          version: '1',
          tools: {
            openscad: { installed: true, version: 'OpenSCAD 2021.01-docker' },
            freecad: { installed: true, version: 'FreeCAD 0.21.2-docker' },
            blender: { installed: true, version: 'Blender 4.2.0-docker' },
          },
        }));
        return;
      }

      if (req.url === '/v1/openscad/compile') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          tool: 'openscad',
          format: 'stl',
          filename: 'bracket.stl',
          size_bytes: 128,
          sha256: 'abc123sha',
          artifact_base64: Buffer.from('solid bracket\nendsolid').toString('base64'),
          logs: ['[DOCKER] OpenSCAD compiled successfully'],
        }));
        return;
      }

      if (req.url === '/v1/freecad/execute') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          tool: 'freecad',
          format: 'step',
          filename: 'part.step',
          size_bytes: 512,
          sha256: 'step123sha',
          artifact_base64: Buffer.from('ISO-10303-21;').toString('base64'),
          metrics: { volume: 1500, surface_area: 800, faces_count: 6 },
          logs: ['[DOCKER] FreeCAD built STEP model'],
        }));
        return;
      }

      if (req.url === '/v1/blender/execute') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          tool: 'blender',
          operation: 'build',
          format: 'glb',
          filename: 'scene.glb',
          size_bytes: 1024,
          sha256: 'glb123sha',
          artifact_base64: Buffer.from('glTF binary mock').toString('base64'),
          result: { ok: true, blender_version: '4.2.0', objects: ['Cube', 'Camera'] },
          logs: ['[DOCKER] Blender rendered glb scene'],
        }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'not_found' }));
    });
  });

  await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  const port = mockServer.address().port;
  const serviceUrl = `http://127.0.0.1:${port}`;
  const token = 'test-token-xyz';

  try {
    // 1. Health probe
    const health = await probeDockerServiceHealth({ serviceUrl, token });
    assert.equal(health.available, true);
    assert.equal(health.tools.openscad.installed, true);
    assert.equal(health.tools.freecad.installed, true);
    assert.equal(health.tools.blender.installed, true);

    // 2. OpenSCAD execution
    const oscadRes = await executeOpenScadDocker({
      source: 'cube([10, 10, 10]);',
      outputFormat: 'stl',
      filename: 'bracket.stl',
      serviceUrl,
      token,
    });
    assert.equal(oscadRes.success, true);
    assert.equal(oscadRes.filename, 'bracket.stl');
    assert.match(oscadRes.artifactContent, /solid bracket/);
    assert.equal(oscadRes.mimeType, 'model/stl');

    // 3. FreeCAD execution
    const freecadRes = await executeFreeCadDocker({
      operations: [{ op: 'box', length: 10, width: 10, height: 10 }],
      format: 'step',
      filename: 'part.step',
      serviceUrl,
      token,
    });
    assert.equal(freecadRes.success, true);
    assert.equal(freecadRes.format, 'step');
    assert.equal(freecadRes.metrics.volume, 1500);
    assert.match(freecadRes.artifactText, /ISO-10303-21;/);

    // 4. Blender execution
    const blenderRes = await executeBlenderDocker({
      operation: 'build',
      operations: [{ op: 'add', primitive: 'cube' }],
      format: 'glb',
      serviceUrl,
      token,
    });
    assert.equal(blenderRes.success, true);
    assert.equal(blenderRes.format, 'glb');
    assert.equal(blenderRes.result.blender_version, '4.2.0');

    // 5. Verify recorded request signatures
    assert.equal(recordedRequests[0].url, '/healthz');
    assert.equal(recordedRequests[0].auth, 'Bearer test-token-xyz');
    assert.equal(recordedRequests[1].url, '/v1/openscad/compile');
    assert.equal(recordedRequests[2].url, '/v1/freecad/execute');
    assert.equal(recordedRequests[3].url, '/v1/blender/execute');
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});

test('discoverAllCadTools adopts Docker service execution lane when host tools are absent', async () => {
  const mockServer = http.createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        service: 'agentsam-cad',
        version: '1',
        tools: {
          openscad: { installed: true, version: 'OpenSCAD 2021.01-docker' },
          freecad: { installed: true, version: 'FreeCAD 0.21.2-docker' },
          blender: { installed: true, version: 'Blender 4.2.0-docker' },
        },
      }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  const port = mockServer.address().port;
  const serviceUrl = `http://127.0.0.1:${port}`;

  try {
    const report = await discoverAllCadTools({
      openscadBin: '/nonexistent/openscad',
      freecadBin: '/nonexistent/freecad',
      blenderBin: '/nonexistent/blender',
      env: {
        AGENTSAM_CAD_SERVICE_URL: serviceUrl,
        PATH: '/empty',
      },
      cache: false,
    });

    const openscad = report.tools.find(t => t.tool === 'openscad');
    const freecad = report.tools.find(t => t.tool === 'freecad');
    const blender = report.tools.find(t => t.tool === 'blender');

    assert.equal(openscad.available, true);
    assert.equal(openscad.execution_lane, 'docker_service');
    assert.equal(openscad.source, 'docker_service');
    assert.match(openscad.binary, /^docker:\/\//);

    assert.equal(freecad.available, true);
    assert.equal(freecad.execution_lane, 'docker_service');
    assert.equal(freecad.source, 'docker_service');
    assert.match(freecad.binary, /^docker:\/\//);

    assert.equal(blender.available, true);
    assert.equal(blender.execution_lane, 'docker_service');
    assert.equal(blender.source, 'docker_service');
    assert.match(blender.binary, /^docker:\/\//);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});
