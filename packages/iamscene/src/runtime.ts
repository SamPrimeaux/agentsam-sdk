import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createThreeViewport, createConfiguredGLTFLoader, type ThreeViewportHandle } from '@inneranimalmedia/agentsam-3d-viewer';
import { sampleAnimation } from './animation.js';
import { IAMGEOMETRY_MEDIA_TYPE, getIAMGeometryRender, parseIAMGeometry } from './geometry.js';
import { assertValidSceneDocument } from './validate.js';
import type { SceneAsset, SceneDocument, SceneMaterial, SceneNode } from './types.js';

type AssetSource = string | URL | ArrayBuffer | ArrayBufferView | Blob;
export interface SceneRuntimeOptions {
  container: HTMLElement;
  document: SceneDocument;
  assetBaseUrl?: string | URL;
  resolveAsset?: (asset: SceneAsset) => AssetSource | Promise<AssetSource>;
  autoPlay?: string | false;
  playbackRate?: number;
  controls?: boolean;
  onAnimationChange?: (animationId: string | null, time: number) => void;
  onNodeEvent?: (nodeId: string, event: 'pointerenter' | 'pointerleave' | 'click') => void;
}

export interface SceneRuntimeHandle {
  readonly viewport: ThreeViewportHandle;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly currentAnimation: string | null;
  readonly currentTime: number;
  play(animationId: string, options?: { restart?: boolean; time?: number }): void;
  pause(): void;
  seek(time: number): void;
  /** Select and sample an animation at an exact time without starting playback. */
  seekAnimation(animationId: string, time: number, options?: { wrap?: boolean }): void;
  /** Drive a mesh's authored radial reveal from UI, scroll, or pointer interaction. */
  setRevealRadius(nodeId: string, radius: number): void;
  setPlaybackRate(rate: number): void;
  /** Hot-swap one node's mesh asset without losing its transforms or animation target. */
  swapGeometry(nodeId: string, asset: SceneAsset | string): Promise<void>;
  render(): void;
  dispose(): void;
}

type MaterialCompilePatch = (this: THREE.Material, shader: Parameters<NonNullable<THREE.Material['onBeforeCompile']>>[0]) => void;

export function createSceneMaterial(definition: SceneMaterial): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: definition.baseColor,
    emissive: definition.emissive ?? '#000000',
    emissiveIntensity: definition.emissiveIntensity ?? 0,
    metalness: definition.metalness ?? 0,
    roughness: definition.roughness ?? 0.8,
    opacity: definition.opacity ?? 1,
    transparent: definition.transparent ?? (definition.opacity ?? 1) < 1,
    blending: definition.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: definition.depthWrite ?? !definition.additive,
  });
  const compilePatches: MaterialCompilePatch[] = [];

  if (definition.radialReveal) {
    const reveal = definition.radialReveal;
    material.transparent = true;
    material.depthWrite = false;
    material.side = THREE.DoubleSide;
    material.userData.iamRadialReveal = {
      radius: { value: reveal.initialRadius },
      feather: { value: reveal.feather ?? 10 },
      pulseWidth: { value: Math.max(0.001, reveal.pulseWidth ?? 14) },
      pulseIntensity: { value: reveal.pulseIntensity ?? 0.35 },
    };
    compilePatches.push(function (shader) {
      const uniforms = this.userData.iamRadialReveal;
      shader.uniforms.iamRevealRadius = uniforms.radius;
      shader.uniforms.iamRevealFeather = uniforms.feather;
      shader.uniforms.iamPulseWidth = uniforms.pulseWidth;
      shader.uniforms.iamPulseIntensity = uniforms.pulseIntensity;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nvarying float vIamRevealDistance;',
      ).replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvIamRevealDistance = length(position.xz);',
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\nvarying float vIamRevealDistance;\nuniform float iamRevealRadius;\nuniform float iamRevealFeather;\nuniform float iamPulseWidth;\nuniform float iamPulseIntensity;',
      ).replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        float iamMask = 1.0 - smoothstep(
          iamRevealRadius - iamRevealFeather, iamRevealRadius + 1.0,
          vIamRevealDistance
        );
        gl_FragColor.a *= iamMask;
        float iamPulse = exp(-pow(
          (vIamRevealDistance - iamRevealRadius + 1.0) / iamPulseWidth, 2.0
        ));
        gl_FragColor.rgb += vec3(0.04, 0.55, 0.58) * iamPulse * iamPulseIntensity;`,
      );
    });
  }

  const earth = definition.holographicEarth;
  if (earth) {
    material.side = THREE.DoubleSide;
    if (earth.layer !== 'ocean') {
      material.transparent = true;
      material.depthWrite = false;
    }
    material.userData.iamHolographicEarth = { layer: earth.layer };
    compilePatches.push(function (shader) {
      const frequency = earth.frequency ?? (earth.layer === 'ocean' ? [90, 90] : [150, 150]);
      const dotColor = new THREE.Color(earth.dotColor ?? definition.baseColor);
      const fresnelColor = new THREE.Color(earth.fresnelColor ?? '#005bff');
      const lineColor = new THREE.Color(earth.lineColor ?? definition.baseColor);
      shader.uniforms.iamEarthFrequency = { value: new THREE.Vector2(frequency[0], frequency[1]) };
      shader.uniforms.iamEarthDotColor = { value: dotColor };
      shader.uniforms.iamEarthDotSize = { value: earth.dotSize ?? 0.27 };
      shader.uniforms.iamEarthSmoothness = { value: earth.smoothness ?? 0.5 };
      shader.uniforms.iamEarthDotOpacity = { value: earth.dotOpacity ?? 0.32 };
      shader.uniforms.iamEarthFresnelColor = { value: fresnelColor };
      shader.uniforms.iamEarthFresnelBias = { value: earth.fresnelBias ?? 0.06 };
      shader.uniforms.iamEarthFresnelScale = { value: earth.fresnelScale ?? 1.35 };
      shader.uniforms.iamEarthFresnelPower = { value: earth.fresnelPower ?? 3.62 };
      shader.uniforms.iamEarthFresnelIntensity = { value: earth.fresnelIntensity ?? 0.93 };
      shader.uniforms.iamEarthLineColor = { value: lineColor };
      shader.uniforms.iamEarthLineWidth = { value: earth.lineWidth ?? 1 };
      shader.uniforms.iamEarthLineOpacity = { value: earth.lineOpacity ?? 0.18 };
      shader.uniforms.iamEarthLineIntensity = { value: earth.lineIntensity ?? 0.75 };

      const outlineVertex = earth.layer === 'outline'
        ? 'attribute vec2 uv1; varying vec3 vIamEarthBarycentric;'
        : '';
      const outlineVarying = earth.layer === 'outline'
        ? 'vIamEarthBarycentric = vec3(uv1, 1.0 - uv1.x - uv1.y);'
        : '';
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
        varying vec2 vIamEarthUv;
        varying vec3 vIamEarthWorldNormal;
        varying vec3 vIamEarthWorldPosition;
        ${outlineVertex}`,
      ).replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        vIamEarthWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      ).replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 iamEarthNormal = normalize(objectNormal);
        vIamEarthUv = vec2(
          atan(iamEarthNormal.z, iamEarthNormal.x) / 6.28318530718 + 0.5,
          asin(clamp(iamEarthNormal.y, -1.0, 1.0)) / 3.14159265359 + 0.5
        );
        vIamEarthWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
        ${outlineVarying}`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        varying vec2 vIamEarthUv;
        varying vec3 vIamEarthWorldNormal;
        varying vec3 vIamEarthWorldPosition;
        uniform vec2 iamEarthFrequency;
        uniform vec3 iamEarthDotColor;
        uniform float iamEarthDotSize;
        uniform float iamEarthSmoothness;
        uniform float iamEarthDotOpacity;
        uniform vec3 iamEarthFresnelColor;
        uniform float iamEarthFresnelBias;
        uniform float iamEarthFresnelScale;
        uniform float iamEarthFresnelPower;
        uniform float iamEarthFresnelIntensity;
        uniform vec3 iamEarthLineColor;
        uniform float iamEarthLineWidth;
        uniform float iamEarthLineOpacity;
        uniform float iamEarthLineIntensity;
        ${earth.layer === 'outline' ? 'varying vec3 vIamEarthBarycentric;' : ''}`,
      );

      if (earth.layer === 'ocean') {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          vec2 iamEarthCell = fract(vIamEarthUv * iamEarthFrequency) - 0.5;
          iamEarthCell.x *= max(0.18, cos((vIamEarthUv.y - 0.5) * 3.14159265359));
          float iamEarthDot = 1.0 - smoothstep(
            iamEarthDotSize, iamEarthDotSize + iamEarthSmoothness * 0.04,
            length(iamEarthCell)
          );
          vec3 iamEarthView = normalize(cameraPosition - vIamEarthWorldPosition);
          float iamEarthFresnel = pow(
            1.0 - max(dot(normalize(vIamEarthWorldNormal), iamEarthView), 0.0),
            iamEarthFresnelPower
          );
          totalEmissiveRadiance += iamEarthDotColor * iamEarthDot * iamEarthDotOpacity;
          totalEmissiveRadiance += iamEarthFresnelColor *
            (iamEarthFresnelBias + iamEarthFresnelScale * iamEarthFresnel) *
            iamEarthFresnelIntensity;`,
        );
      } else if (earth.layer === 'dots') {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec2 iamEarthCell = fract(vIamEarthUv * iamEarthFrequency) - 0.5;
          float iamEarthDot = 1.0 - smoothstep(
            iamEarthDotSize * 0.35,
            iamEarthDotSize * 0.35 + iamEarthSmoothness * 0.08,
            length(iamEarthCell)
          );
          diffuseColor.rgb = iamEarthDotColor;
          diffuseColor.a *= iamEarthDot * iamEarthDotOpacity;`,
        ).replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance += iamEarthDotColor * iamEarthDot * 1.25;`,
        );
      } else {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec3 iamEarthBary = vIamEarthBarycentric;
          vec3 iamEarthBaryWidth = fwidth(iamEarthBary) * max(iamEarthLineWidth, 0.01);
          vec3 iamEarthEdge = smoothstep(vec3(0.0), iamEarthBaryWidth, iamEarthBary);
          float iamEarthLine = 1.0 - min(min(iamEarthEdge.x, iamEarthEdge.y), iamEarthEdge.z);
          diffuseColor.rgb = iamEarthLineColor;
          diffuseColor.a *= iamEarthLine * iamEarthLineOpacity;`,
        ).replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance += iamEarthLineColor * iamEarthLine * iamEarthLineIntensity;`,
        );
      }
    });
  }

  if (compilePatches.length) {
    material.onBeforeCompile = function (shader) {
      compilePatches.forEach(patch => patch.call(this, shader));
    };
    material.customProgramCacheKey = () => `iam-scene-material-v1:${definition.id}:${JSON.stringify(earth ?? null)}:${Boolean(definition.radialReveal)}`;
  }
  return material;
}

function cloneSceneMaterial(material: THREE.Material): THREE.Material {
  const clone = material.clone();
  clone.onBeforeCompile = material.onBeforeCompile;
  clone.customProgramCacheKey = material.customProgramCacheKey;
  return clone;
}

function applyMaterial(root: THREE.Object3D, material: THREE.Material): void {
  root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.material = cloneSceneMaterial(material);
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
}

function applyAssetMaterials(root: THREE.Object3D, materials: Map<string, THREE.Material>): void {
  const visit = (object: THREE.Object3D, inheritedMaterialId?: string) => {
    const ownId = object.userData?.iamMaterialId;
    const materialId = typeof ownId === 'string' && ownId ? ownId : inheritedMaterialId;
    if (object instanceof THREE.Mesh && materialId) {
      const material = materials.get(materialId);
      if (!material) throw new Error(`iamscene_asset_material_not_found:${materialId}`);
      object.material = cloneSceneMaterial(material);
      object.castShadow = true;
      object.receiveShadow = true;
    }
    for (const child of object.children) visit(child, materialId);
  };
  visit(root);
}

function resolveBaseUrl(document: SceneDocument, supplied?: string | URL): URL {
  const candidate = supplied ?? document.metadata.assetBaseUri ?? (typeof location !== 'undefined' ? location.href : undefined);
  if (!candidate) throw new Error('iamscene_asset_base_url_required');
  return candidate instanceof URL ? candidate : new URL(candidate, typeof location !== 'undefined' ? location.href : undefined);
}

function asArrayBuffer(value: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

function setObjectOpacity(root: THREE.Object3D, opacity: number): void {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      material.opacity = opacity;
      material.transparent = opacity < 1 || material.blending === THREE.AdditiveBlending;
      material.needsUpdate = true;
    }
  });
}

function setRevealRadiusOnObject(root: THREE.Object3D, radius: number): void {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      const reveal = material.userData.iamRadialReveal;
      if (reveal?.radius) reveal.radius.value = radius;
    }
  });
}

function setEmissiveIntensity(root: THREE.Object3D, intensity: number): void {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if ('emissiveIntensity' in material) {
        (material as THREE.MeshStandardMaterial).emissiveIntensity = intensity;
      }
    }
  });
}

export async function createSceneRuntime(options: SceneRuntimeOptions): Promise<SceneRuntimeHandle> {
  const document = options.document;
  assertValidSceneDocument(document);
  const viewport = createThreeViewport(options.container, { THREE, OrbitControls }, {
    background: document.environment.background,
    controls: options.controls ?? true,
    autoRender: false,
    wrapper: false,
    cameraProjection: document.camera.projection,
    orthographicFrustumHeight: document.camera.frustumHeight,
    orthographicZoom: document.camera.zoom,
    fov: document.camera.fov,
    near: document.camera.near,
    far: document.camera.far,
    cameraUp: [0, 1, 0],
    lights: false,
    maxPixelRatio: 2,
    antialias: true,
  });
  const scene = viewport.scene as THREE.Scene;
  const camera = viewport.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
  camera.position.fromArray(document.camera.position);
  camera.lookAt(...document.camera.target);
  camera.updateProjectionMatrix();
  scene.background = new THREE.Color(document.environment.background);
  if (document.environment.fog) {
    scene.fog = new THREE.Fog(document.environment.fog.color, document.environment.fog.near, document.environment.fog.far);
  }

  scene.add(new THREE.AmbientLight('#ffffff', document.environment.ambientIntensity));
  for (const definition of document.environment.lights) {
    const light = definition.type === 'point'
      ? new THREE.PointLight(definition.color, definition.intensity)
      : new THREE.DirectionalLight(definition.color, definition.intensity);
    light.position.fromArray(definition.position);
    scene.add(light);
  }

  const materials = new Map<string, THREE.Material>(document.materials.map(definition => [definition.id, createSceneMaterial(definition)]));
  const nodes = new Map(document.scene.nodes.map(node => [node.id, node]));
  const objects = new Map<string, THREE.Group>();
  const paths = new Map<string, THREE.CatmullRomCurve3>();
  const pulseProgress = new Map<string, number>();
  const assetMap = new Map(document.assets.map(asset => [asset.id, asset]));
  const meshModels = new Map<string, THREE.Object3D>();
  const baseUrl = resolveBaseUrl(document, options.assetBaseUrl);
  const loader = createConfiguredGLTFLoader({THREE,GLTFLoader,DRACOLoader});
  loader.setMeshoptDecoder(MeshoptDecoder);

  for (const node of document.scene.nodes) {
    const object = new THREE.Group();
    object.name = node.name;
    object.visible = node.visible;
    object.userData.iamSceneNodeId = node.id;
    object.position.fromArray(node.transform.position ?? [0, 0, 0]);
    object.quaternion.fromArray(node.transform.rotation ?? [0, 0, 0, 1]);
    object.scale.fromArray(node.transform.scale ?? [1, 1, 1]);
    if (node.renderOrder !== undefined) object.renderOrder = node.renderOrder;
    objects.set(node.id, object);
  }

  for (const node of document.scene.nodes) {
    const object = objects.get(node.id)!;
    const parent = node.parentId ? objects.get(node.parentId) : scene;
    if (!parent) throw new Error(`iamscene_parent_not_found:${node.parentId}`);
    parent.add(object);
  }

  const loadAsset = async (asset: SceneAsset, meshIndex?: number): Promise<THREE.Object3D> => {
    let source = options.resolveAsset
      ? await options.resolveAsset(asset)
      : new URL(asset.uri, baseUrl).toString();
    let assetUrl = new URL(asset.uri, baseUrl);
    if (asset.mediaType === IAMGEOMETRY_MEDIA_TYPE || /\.iamgeometry(?:\?.*)?$/i.test(asset.uri)) {
      // .iamgeometry is a lightweight manifest, NOT another rendering engine.
      let bytes: ArrayBuffer;
      if (typeof source === 'string' || source instanceof URL) {
        assetUrl = new URL(source, baseUrl);
        const response = await fetch(assetUrl);
        if (!response.ok) throw new Error(`iamgeometry_fetch_failed:${response.status}`);
        bytes = await response.arrayBuffer();
      } else if (source instanceof Blob) {
        bytes = await source.arrayBuffer();
      } else {
        bytes = asArrayBuffer(source);
      }
      const geometry = parseIAMGeometry(new Uint8Array(bytes));
      const renderAsset = getIAMGeometryRender(geometry);
      const renderUrl = new URL(renderAsset.uri, assetUrl);
      const meshAsset: SceneAsset = {
        id: `${asset.id}:${renderAsset.id}`,
        uri: renderUrl.toString(),
        mediaType: renderAsset.mediaType || (renderAsset.format === 'glb' ? 'model/gltf-binary' : 'model/gltf+json'),
        role: 'presentation',
        units: renderAsset.units === 'cm' || renderAsset.units === 'mm' ? renderAsset.units : 'm',
        ...(renderAsset.sha256 ? { sha256: renderAsset.sha256 } : {}),
      };
      source = options.resolveAsset ? await options.resolveAsset(meshAsset) : renderUrl.toString();
      assetUrl = renderUrl;
    }
    const basePath = typeof source === 'string' || source instanceof URL
      ? new URL('.', source instanceof URL ? source : new URL(source, baseUrl)).toString()
      : new URL('.', assetUrl).toString();
    const gltf = typeof source === 'string' || source instanceof URL
      ? await loader.loadAsync(String(source))
      : await loader.parseAsync(await (source instanceof Blob ? source.arrayBuffer() : Promise.resolve(asArrayBuffer(source))), basePath);
    // Imported glTF nodes bind to an individual mesh index. Never mount the
    // entire GLB under every imported mesh node (duplicates all geometry).
    if (meshIndex !== undefined) {
      if (!Number.isInteger(meshIndex) || meshIndex < 0) throw new Error('iamscene_gltf_mesh_index_invalid');
      const mesh = await gltf.parser.getDependency('mesh', meshIndex);
      if (!mesh) throw new Error('iamscene_gltf_mesh_dependency_missing:' + meshIndex);
      return mesh;
    }
    return gltf.scene;
  };

  const prepareMesh = async (node: SceneNode, asset: SceneAsset): Promise<THREE.Object3D> => {
    const binding = node.userData?.iamGltf as { meshIndex?: number } | undefined;
    const model = await loadAsset(asset, binding?.meshIndex);
    const material = node.materialRef ? materials.get(node.materialRef) : undefined;
    if (node.materialRef && !material) throw new Error(`iamscene_material_not_found:${node.materialRef}`);
    if (material) applyMaterial(model, material);
    else applyAssetMaterials(model, materials);
    model.userData.iamSceneNodeId = node.id;
    return model;
  };

  const assetLoads: Promise<void>[] = [];
  for (const node of document.scene.nodes) {
    const object = objects.get(node.id)!;
    if (node.kind === 'mesh') {
      const material = node.materialRef ? materials.get(node.materialRef) : undefined;
      if (!node.assetRef && node.geometry?.type === 'sphere') {
        // Built-in primitive from the canonical .iamscene source document:
        // a scene must not need a presentation GLTF for simple authored geometry.
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(node.geometry.radius, 96, 64),
          material ? cloneSceneMaterial(material) : new THREE.MeshStandardMaterial({ color: '#d8f7ff' }),
        );
        mesh.userData.iamSceneNodeId = node.id;
        mesh.renderOrder = node.renderOrder ?? 0;
        object.add(mesh);
        meshModels.set(node.id, mesh);
      } else {
        if (!node.assetRef) throw new Error(`iamscene_mesh_asset_required:${node.id}`);
        const asset = assetMap.get(node.assetRef);
        if (!asset) throw new Error(`iamscene_asset_not_found:${node.assetRef}`);
        if (node.materialRef && !material) throw new Error(`iamscene_material_not_found:${node.materialRef}`);
        assetLoads.push(prepareMesh(node, asset).then(model => {
          object.add(model);
          meshModels.set(node.id, model);
        }));
      }
    } else if (node.kind === 'path') {
      if (node.geometry?.type !== 'polyline') throw new Error(`iamscene_path_geometry_invalid:${node.id}`);
      const curve = new THREE.CatmullRomCurve3(
        node.geometry.points.map(point => new THREE.Vector3(...point)),
        node.geometry.closed ?? false,
        'centripetal',
        0.15,
      );
      paths.set(node.id, curve);
      const geometry = new THREE.TubeGeometry(
        curve,
        node.geometry.segments ?? Math.max(24, node.geometry.points.length * 12),
        node.geometry.radius,
        node.geometry.radialSegments ?? 6,
        node.geometry.closed ?? false,
      );
      const material = node.materialRef ? materials.get(node.materialRef) : undefined;
      const mesh = new THREE.Mesh(geometry, material ? cloneSceneMaterial(material) : new THREE.MeshBasicMaterial({ color: '#00dfff' }));
      mesh.userData.iamSceneNodeId = node.id;
      mesh.renderOrder = node.renderOrder ?? 2;
      object.add(mesh);
    } else if (node.kind === 'pulse') {
      if (node.geometry?.type !== 'sphere' || !node.pathRef) throw new Error(`iamscene_pulse_geometry_invalid:${node.id}`);
      const geometry = new THREE.SphereGeometry(node.geometry.radius, 16, 12);
      const material = node.materialRef ? materials.get(node.materialRef) : undefined;
      const mesh = new THREE.Mesh(geometry, material ? cloneSceneMaterial(material) : new THREE.MeshBasicMaterial({ color: '#c8fbff' }));
      mesh.userData.iamSceneNodeId = node.id;
      mesh.renderOrder = node.renderOrder ?? 4;
      object.add(mesh);
      pulseProgress.set(node.id, 0);
    } else if (node.kind === 'light') {
      const light = new THREE.PointLight(node.userData?.color as THREE.ColorRepresentation ?? '#00dfff', Number(node.userData?.intensity ?? 1));
      light.position.fromArray(node.transform.position ?? [0, 0, 0]);
      object.add(light);
    }
  }
  await Promise.all(assetLoads);

  const animationMap = new Map(document.animations.map(animation => [animation.id, animation]));
  let activeAnimationId: string | null = null;
  let currentTime = 0;
  let playbackRate = options.playbackRate ?? 1;
  let playing = false;
  let frameHandle = 0;
  let lastFrameTime = 0;
  let hoveredNodeId: string | null = null;
  let disposed = false;

  const applyTrack = (targetId: string, property: string, value: unknown) => {
    const object = objects.get(targetId);
    if (!object || value === undefined) return;
    if (property === 'opacity' || property === 'material.opacity') {
      setObjectOpacity(object, Number(value));
    } else if (property === 'emissiveIntensity' || property === 'material.emissiveIntensity') {
      setEmissiveIntensity(object, Number(value));
    } else if (property === 'material.revealRadius') {
      setRevealRadiusOnObject(object, Number(value));
    } else if (property === 'visible') {
      object.visible = Boolean(value);
    } else if (property === 'pathProgress') {
      pulseProgress.set(targetId, Math.max(0, Math.min(1, Number(value))));
      const node = nodes.get(targetId);
      const curve = node?.pathRef ? paths.get(node.pathRef) : undefined;
      if (curve) {
        const point = curve.getPointAt(pulseProgress.get(targetId)!);
        const pathObject = objects.get(node!.pathRef!)!;
        pathObject.localToWorld(point);
        const parent = object.parent;
        if (parent) parent.worldToLocal(point);
        object.position.copy(point);
      }
    } else if (property === 'transform.position' || property === 'position') {
      if (Array.isArray(value) && value.length === 3) object.position.fromArray(value as [number, number, number]);
    } else if (property === 'transform.rotation') {
      if (Array.isArray(value) && value.length === 4) object.quaternion.fromArray(value as [number, number, number, number]);
    } else if (property === 'transform.scale' || property === 'scale') {
      if (Array.isArray(value) && value.length === 3) object.scale.fromArray(value as [number, number, number]);
    } else if (property.startsWith('rotation.')) {
      const axis = property.slice('rotation.'.length) as 'x' | 'y' | 'z';
      if (axis in object.rotation) object.rotation[axis] = Number(value);
    } else if (property.startsWith('position.')) {
      const axis = property.slice('position.'.length) as 'x' | 'y' | 'z';
      if (axis in object.position) object.position[axis] = Number(value);
    }
  };

  const render = () => {
    viewport.controls?.update?.();
    viewport.render();
  };
  const seekAnimation = (
    animationId: string,
    time: number,
    seekOptions: { wrap?: boolean } = {},
  ) => {
    const animation = animationMap.get(animationId);
    if (!animation) throw new Error(`iamscene_animation_not_found:${animationId}`);
    if (!Number.isFinite(time)) throw new Error('iamscene_animation_time_invalid');
    activeAnimationId = animationId;
    const wrap = seekOptions.wrap ?? animation.loop;
    currentTime = wrap
      ? ((time % animation.duration) + animation.duration) % animation.duration
      : Math.max(0, Math.min(animation.duration, time));
    for (const sample of sampleAnimation(animation, currentTime, { wrap: false })) {
      applyTrack(sample.targetId, sample.property, sample.value);
    }
    render();
  };
  const seek = (time: number) => {
    if (!Number.isFinite(time)) throw new Error('iamscene_animation_time_invalid');
    if (!activeAnimationId) { currentTime = Math.max(0, time); render(); return; }
    seekAnimation(activeAnimationId, time);
  };
  const tick = (now: number) => {
    if (!playing || disposed) return;
    if (!lastFrameTime) lastFrameTime = now;
    const delta = Math.max(0, Math.min(0.1, (now - lastFrameTime) / 1000));
    lastFrameTime = now;
    const animation = activeAnimationId ? animationMap.get(activeAnimationId) : undefined;
    if (animation) {
      const next = currentTime + delta * playbackRate;
      if (!animation.loop && next >= animation.duration) {
        seek(animation.duration);
        pause();
        return;
      }
      seek(next);
    } else render();
    frameHandle = requestAnimationFrame(tick);
  };
  const pause = () => {
    playing = false;
    lastFrameTime = 0;
    if (frameHandle) cancelAnimationFrame(frameHandle);
    frameHandle = 0;
  };
  const play = (animationId: string, playOptions: { restart?: boolean; time?: number } = {}) => {
    if (!animationMap.has(animationId)) throw new Error(`iamscene_animation_not_found:${animationId}`);
    pause();
    activeAnimationId = animationId;
    if (playOptions.time !== undefined) currentTime = playOptions.time;
    else if (playOptions.restart !== false) currentTime = 0;
    options.onAnimationChange?.(activeAnimationId, currentTime);
    seekAnimation(animationId, currentTime);
    playing = true;
    frameHandle = requestAnimationFrame(tick);
  };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dispatchInteraction = (nodeId: string, eventName: 'pointerenter' | 'pointerleave' | 'click') => {
    options.onNodeEvent?.(nodeId, eventName);
    const interaction = document.interactions.find(item => item.targetId === nodeId && item.event === eventName);
    if (interaction?.action.type === 'playAnimation') play(interaction.action.animationId, { restart: true });
  };
  const findHitNode = (event: PointerEvent): string | null => {
    const rect = viewport.renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(scene.children, true).find(item => item.object.visible);
    let object: THREE.Object3D | null = hit?.object ?? null;
    while (object) {
      const id = object.userData.iamSceneNodeId;
      if (typeof id === 'string') return id;
      object = object.parent;
    }
    return null;
  };
  const onPointerMove = (event: PointerEvent) => {
    const next = findHitNode(event);
    if (next === hoveredNodeId) return;
    if (hoveredNodeId) dispatchInteraction(hoveredNodeId, 'pointerleave');
    hoveredNodeId = next;
    if (hoveredNodeId) dispatchInteraction(hoveredNodeId, 'pointerenter');
  };
  const onPointerLeave = () => {
    if (hoveredNodeId) dispatchInteraction(hoveredNodeId, 'pointerleave');
    hoveredNodeId = null;
  };
  const onClick = () => { if (hoveredNodeId) dispatchInteraction(hoveredNodeId, 'click'); };
  const canvas = viewport.renderer.domElement;
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('click', onClick);

  const requestedAutoPlay = options.autoPlay === undefined ? document.animations[0]?.id : options.autoPlay;
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (requestedAutoPlay && !reducedMotion) play(requestedAutoPlay);
  else render();

  return {
    viewport,
    scene,
    camera,
    get currentAnimation() { return activeAnimationId; },
    get currentTime() { return currentTime; },
    play,
    pause,
    seek,
    seekAnimation,
    setRevealRadius(nodeId: string, radius: number) {
      if (!objects.has(nodeId)) throw new Error(`iamscene_node_not_found:${nodeId}`);
      if (!Number.isFinite(radius) || radius < 0) throw new Error('iamscene_reveal_radius_invalid');
      applyTrack(nodeId, 'material.revealRadius', radius);
      render();
    },
    async swapGeometry(nodeId: string, replacement: SceneAsset | string): Promise<void> {
      const node = nodes.get(nodeId);
      const target = objects.get(nodeId);
      if (!node || node.kind !== 'mesh' || !target) throw new Error(`iamscene_mesh_node_not_found:${nodeId}`);
      const asset = typeof replacement === 'string' ? assetMap.get(replacement) : replacement;
      if (!asset) throw new Error(`iamscene_asset_not_found:${replacement}`);
      const model = await prepareMesh(node, asset);
      if (disposed) throw new Error('iamscene_runtime_disposed');
      const previous = meshModels.get(nodeId);
      target.add(model);
      meshModels.set(nodeId, model);
      if (previous) {
        target.remove(previous);
        previous.traverse(item => {
          if (item instanceof THREE.Mesh) {
            item.geometry.dispose();
            const mats = Array.isArray(item.material) ? item.material : [item.material];
            for (const mat of mats) mat.dispose();
          }
        });
      }
      if (typeof replacement !== 'string') assetMap.set(replacement.id, replacement);
      render();
    },
    setPlaybackRate(rate: number) {
      if (!Number.isFinite(rate) || rate <= 0 || rate > 8) throw new Error('iamscene_playback_rate_invalid');
      playbackRate = rate;
    },
    render,
    dispose() {
      if (disposed) return;
      disposed = true;
      pause();
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('click', onClick);
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of meshMaterials) material.dispose();
        }
      });
      for (const material of materials.values()) material.dispose();
      viewport.dispose();
    },
  };
}
