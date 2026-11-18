import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createThreeViewport, type ThreeViewportHandle } from '@inneranimalmedia/agentsam-3d-viewer';
import { sampleAnimation } from './animation.js';
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
  setPlaybackRate(rate: number): void;
  render(): void;
  dispose(): void;
}

function makeMaterial(definition: SceneMaterial): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
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
}

function applyMaterial(root: THREE.Object3D, material: THREE.Material): void {
  root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.material = material.clone();
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
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
    fov: document.camera.fov,
    near: document.camera.near,
    far: document.camera.far,
    cameraUp: [0, 1, 0],
    lights: false,
    maxPixelRatio: 2,
    antialias: true,
  });
  const scene = viewport.scene as THREE.Scene;
  const camera = viewport.camera as THREE.PerspectiveCamera;
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

  const materials = new Map(document.materials.map(definition => [definition.id, makeMaterial(definition)]));
  const nodes = new Map(document.scene.nodes.map(node => [node.id, node]));
  const objects = new Map<string, THREE.Group>();
  const paths = new Map<string, THREE.CatmullRomCurve3>();
  const pulseProgress = new Map<string, number>();
  const assetMap = new Map(document.assets.map(asset => [asset.id, asset]));
  const baseUrl = resolveBaseUrl(document, options.assetBaseUrl);
  const loader = new GLTFLoader();

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

  const loadAsset = async (asset: SceneAsset): Promise<THREE.Object3D> => {
    const source = options.resolveAsset
      ? await options.resolveAsset(asset)
      : new URL(asset.uri, baseUrl).toString();
    const basePath = typeof source === 'string' || source instanceof URL
      ? new URL('.', source instanceof URL ? source : new URL(source, baseUrl)).toString()
      : baseUrl.toString();
    const gltf = typeof source === 'string' || source instanceof URL
      ? await loader.loadAsync(String(source))
      : await loader.parseAsync(await (source instanceof Blob ? source.arrayBuffer() : Promise.resolve(asArrayBuffer(source))), basePath);
    return gltf.scene;
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
          material?.clone() ?? new THREE.MeshStandardMaterial({ color: '#d8f7ff' }),
        );
        mesh.userData.iamSceneNodeId = node.id;
        mesh.renderOrder = node.renderOrder ?? 0;
        object.add(mesh);
      } else {
        if (!node.assetRef) throw new Error(`iamscene_mesh_asset_required:${node.id}`);
        const asset = assetMap.get(node.assetRef);
        if (!asset) throw new Error(`iamscene_asset_not_found:${node.assetRef}`);
        assetLoads.push(loadAsset(asset).then(model => {
          if (material) applyMaterial(model, material);
          model.userData.iamSceneNodeId = node.id;
          object.add(model);
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
      const mesh = new THREE.Mesh(geometry, material?.clone() ?? new THREE.MeshBasicMaterial({ color: '#00dfff' }));
      mesh.userData.iamSceneNodeId = node.id;
      mesh.renderOrder = node.renderOrder ?? 2;
      object.add(mesh);
    } else if (node.kind === 'pulse') {
      if (node.geometry?.type !== 'sphere' || !node.pathRef) throw new Error(`iamscene_pulse_geometry_invalid:${node.id}`);
      const geometry = new THREE.SphereGeometry(node.geometry.radius, 16, 12);
      const material = node.materialRef ? materials.get(node.materialRef) : undefined;
      const mesh = new THREE.Mesh(geometry, material?.clone() ?? new THREE.MeshBasicMaterial({ color: '#c8fbff' }));
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
  const seek = (time: number) => {
    const animation = activeAnimationId ? animationMap.get(activeAnimationId) : undefined;
    if (!animation) { currentTime = Math.max(0, time); render(); return; }
    currentTime = animation.loop
      ? ((time % animation.duration) + animation.duration) % animation.duration
      : Math.max(0, Math.min(animation.duration, time));
    for (const sample of sampleAnimation(animation, currentTime)) applyTrack(sample.targetId, sample.property, sample.value);
    render();
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
    seek(currentTime);
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
