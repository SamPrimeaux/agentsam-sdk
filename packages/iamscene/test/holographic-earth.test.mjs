import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSceneDocument, createSceneMaterial, validateSceneDocument } from '../dist/src/index.js';

test('native iamscene accepts orthographic cameras and declarative holographic Earth layers', () => {
  const document = createSceneDocument({ id: 'about-earth', name: 'About Earth' });
  document.camera = {
    projection: 'orthographic',
    position: [4.94, 36.42, 2291.96],
    target: [4.94, 36.42, 0],
    frustumHeight: 206.06,
    zoom: 1,
    near: -100000,
    far: 100000,
  };
  document.materials.push({
    id: 'earth-ocean',
    baseColor: '#071a34',
    emissive: '#0b3661',
    holographicEarth: {
      layer: 'ocean',
      frequency: [90, 90],
      dotSize: 0.27,
      smoothness: 0.5,
      dotColor: '#0b3661',
      dotOpacity: 0.32,
      fresnelColor: '#005bff',
      fresnelBias: 0.06,
      fresnelScale: 1.35,
      fresnelPower: 3.62,
      fresnelIntensity: 0.93,
    },
  });
  assert.equal(validateSceneDocument(document).valid, true);
});

test('holographic ocean material compiles native IAM dot and fresnel layers', () => {
  const material = createSceneMaterial({
    id: 'earth-ocean',
    baseColor: '#071a34',
    emissive: '#0b3661',
    holographicEarth: { layer: 'ocean', frequency: [90, 90], dotColor: '#0b3661', fresnelColor: '#005bff' },
  });
  assert.equal(material.isMeshStandardMaterial, true);
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\nvoid main() {\n#include <beginnormal_vertex>\n#include <begin_vertex>\n}',
    fragmentShader: '#include <common>\nvoid main() {\n#include <color_fragment>\n#include <emissivemap_fragment>\n#include <opaque_fragment>\n}',
  };
  material.onBeforeCompile.call(material, shader, {});
  assert.match(shader.vertexShader, /vIamEarthUv/);
  assert.match(shader.vertexShader, /vIamEarthWorldPosition/);
  assert.match(shader.fragmentShader, /iamEarthFresnel/);
  assert.ok(shader.uniforms.iamEarthFrequency.value instanceof THREE.Vector2);
  assert.ok(shader.uniforms.iamEarthFresnelColor.value instanceof THREE.Color);
});

test('holographic dot and outline layers compile their respective surface masks', () => {
  const dots = createSceneMaterial({
    id: 'earth-dots', baseColor: '#28e5ff',
    holographicEarth: { layer: 'dots', frequency: [150, 150], dotSize: 0.63, smoothness: 0.66 },
  });
  const dotsShader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>',
  };
  dots.onBeforeCompile.call(dots, dotsShader, {});
  assert.match(dotsShader.fragmentShader, /iamEarthDot/);
  assert.match(dotsShader.fragmentShader, /diffuseColor\.a/);

  const outline = createSceneMaterial({
    id: 'earth-outline', baseColor: '#51deff', transparent: true, additive: true,
    holographicEarth: { layer: 'outline', lineWidth: 1, lineOpacity: 0.18 },
  });
  const outlineShader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>',
  };
  outline.onBeforeCompile.call(outline, outlineShader, {});
  assert.match(outlineShader.vertexShader, /attribute vec2 uv1/);
  assert.match(outlineShader.vertexShader, /vIamEarthBarycentric/);
  assert.match(outlineShader.fragmentShader, /fwidth\(iamEarthBary\)/);
});

test('holographic material schema rejects zero-frequency pattern grids', () => {
  const document = createSceneDocument({ id: 'invalid-earth', name: 'Invalid Earth' });
  document.materials.push({
    id: 'earth-dots', baseColor: '#28e5ff',
    holographicEarth: { layer: 'dots', frequency: [0, 150] },
  });
  const result = validateSceneDocument(document);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.path.includes('holographicEarth')));
});
