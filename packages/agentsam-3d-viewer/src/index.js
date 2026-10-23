import { inferModelFormat } from './format.js';

export { inferModelFormat, SUPPORTED_MODEL_FORMATS } from './format.js';

function validateRuntime(runtime) {
  if (!runtime?.THREE || typeof runtime.THREE.Scene !== 'function' || typeof runtime.OrbitControls !== 'function') {
    throw new Error('agentsam_3d_runtime_required');
  }
  return runtime;
}

function asArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  throw new Error('agentsam_3d_binary_source_invalid');
}

function disposeObject(object) {
  if (!object) return;
  object.traverse?.((node) => {
    if (!node.isMesh) return;
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose?.();
      }
      material.dispose?.();
    }
  });
}

/**
 * Create a reusable, framework-agnostic Three.js viewport.
 * Use autoRender:false when the host owns its animation loop or scene interactions.
 */
export function createThreeViewport(container, runtime, options = {}) {
  const { THREE, OrbitControls } = validateRuntime(runtime);
  if (!container || typeof container.appendChild !== 'function') {
    throw new Error('agentsam_3d_container_required');
  }
  const background = options.background ?? '#111722';
  const ownsRoot = options.wrapper !== false;
  const root = ownsRoot ? document.createElement('div') : container;
  if (ownsRoot) {
    root.className = 'agentsam-3d-viewport';
    Object.assign(root.style, {
      position: 'relative',
      width: '100%',
      height: '100%',
      minHeight: options.minHeight ?? '240px',
      overflow: 'hidden',
      background: background === 'transparent' ? 'transparent' : String(background),
      touchAction: 'pan-y',
    });
    root.setAttribute('role', options.role ?? 'img');
    root.setAttribute('aria-label', options.ariaLabel ?? 'Interactive 3D viewport');
    root.tabIndex = 0;
    container.appendChild(root);
  }

  const scene = new THREE.Scene();
  scene.background = background === 'transparent' ? null : new THREE.Color(background);
  if (options.lights !== false) {
    scene.add(new THREE.HemisphereLight(0xf8fafc, 0x364152, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 1.65);
    key.position.set(20, 35, 25);
    scene.add(key);
  }
  if (options.showGrid) {
    const grid = new THREE.GridHelper(options.gridSize ?? 10, options.gridDivisions ?? 20, 0x64748b, 0x334155);
    const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
    materials.forEach((material) => { material.transparent = true; material.opacity = 0.28; });
    scene.add(grid);
  }
  if (options.showAxes) scene.add(new THREE.AxesHelper(options.axesSize ?? 1.5));

  const camera = new THREE.PerspectiveCamera(
    options.fov ?? 42,
    1,
    options.near ?? 0.01,
    options.far ?? 10000,
  );
  camera.position.set(4, 3, 5);
  const renderer = new THREE.WebGLRenderer({
    antialias: options.antialias !== false,
    alpha: background === 'transparent',
    preserveDrawingBuffer: options.preserveDrawingBuffer === true,
    powerPreference: options.powerPreference ?? 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.maxPixelRatio ?? 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = options.shadowMap?.enabled === true;
  if (options.shadowMap?.type !== undefined) renderer.shadowMap.type = options.shadowMap.type;
  renderer.toneMapping = options.toneMapping ?? THREE.NoToneMapping;
  renderer.toneMappingExposure = options.toneMappingExposure ?? 1;
  renderer.setSize(Math.max(1, root.clientWidth || container.clientWidth || 400), Math.max(1, root.clientHeight || container.clientHeight || 300));
  Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%', outline: 'none' });
  renderer.domElement.setAttribute('aria-hidden', 'true');
  if (options.insertCanvasFirst) root.insertBefore(renderer.domElement, root.firstChild);
  else root.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = options.enableDamping !== false;
  controls.dampingFactor = options.dampingFactor ?? 0.05;
  controls.minDistance = options.minDistance ?? 0.1;
  controls.maxDistance = options.maxDistance ?? 2000;
  controls.update();

  let disposed = false;
  let frame = 0;
  const resize = () => {
    if (disposed) return;
    const width = Math.max(1, root.clientWidth || container.clientWidth || 1);
    const height = Math.max(1, root.clientHeight || container.clientHeight || 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (resizeObserver) resizeObserver.observe(root);
  else window.addEventListener('resize', resize);

  const render = () => {
    if (disposed) return;
    controls.update();
    renderer.render(scene, camera);
  };
  const tick = () => {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    if (document.hidden) return;
    options.onFrame?.({ scene, camera, renderer, controls });
    render();
  };
  if (options.autoRender !== false) tick();

  function fit(object, padding = 1.3) {
    const bounds = new THREE.Box3().setFromObject(object);
    if (bounds.isEmpty()) return null;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const distance = Math.max(size.length() * padding, 1);
    camera.position.copy(center.clone().add(new THREE.Vector3(distance * 0.8, distance * 0.55, distance * 0.8)));
    camera.near = Math.max(distance / 10000, 0.005);
    camera.far = Math.max(distance * 20, 100);
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.maxDistance = Math.max(distance * 6, controls.minDistance * 10);
    controls.update();
    return { center, size, distance };
  }

  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }
  function start() {
    if (disposed || frame) return;
    tick();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    resizeObserver?.disconnect();
    if (!resizeObserver) window.removeEventListener('resize', resize);
    controls.dispose();
    renderer.dispose();
    if (ownsRoot) root.remove();
    else renderer.domElement.remove();
  }

  return { root, scene, camera, renderer, controls, render, fit, resize, start, stop, dispose };
}

/**
 * Mount an interactive GLB/GLTF/STL viewer into any DOM container.
 * The returned `ready` promise resolves with the loaded Three.js Object3D.
 */
export function mountModelViewer(container, source, runtime, options = {}) {
  const { THREE, GLTFLoader, STLLoader } = validateRuntime(runtime);
  const format = inferModelFormat(source, options.format);
  if (format === 'stl' && typeof STLLoader !== 'function') throw new Error('agentsam_3d_stl_loader_required');
  if (format !== 'stl' && typeof GLTFLoader !== 'function') throw new Error('agentsam_3d_gltf_loader_required');
  const viewport = createThreeViewport(container, runtime, {
    ...options,
    ariaLabel: options.ariaLabel ?? 'Interactive 3D model viewer',
    autoRender: false,
  });
  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  Object.assign(status.style, {
    position: 'absolute',
    inset: '12px auto auto 12px',
    maxWidth: 'calc(100% - 24px)',
    padding: '6px 10px',
    borderRadius: '8px',
    background: 'rgba(15, 23, 42, 0.82)',
    color: '#f8fafc',
    font: '12px/1.4 system-ui, sans-serif',
  });
  status.textContent = 'Loading 3D model…';
  viewport.root.appendChild(status);

  let model = null;
  let disposed = false;
  const loader = format === 'stl' ? new STLLoader() : new GLTFLoader();
  const ready = (async () => {
    let object;
    if (format === 'stl') {
      const geometry = typeof source === 'string'
        ? await loader.loadAsync(source)
        : loader.parse(await (source instanceof Blob ? source.arrayBuffer() : Promise.resolve(asArrayBuffer(source))));
      geometry.computeVertexNormals();
      object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        color: options.stlColor ?? '#c8d4e4', roughness: 0.72, metalness: 0.06,
      }));
    } else {
      const gltf = typeof source === 'string'
        ? await loader.loadAsync(source)
        : await loader.parseAsync(
          await (source instanceof Blob ? source.arrayBuffer() : Promise.resolve(asArrayBuffer(source))),
          options.basePath ?? '',
        );
      object = gltf.scene;
    }
    if (disposed) { disposeObject(object); return object; }
    model = object;
    model.traverse?.((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
    });
    viewport.scene.add(model);
    viewport.fit(model, options.fitPadding ?? 1.3);
    status.remove();
    options.onLoad?.(model);
    return model;
  })().catch((error) => {
    if (!disposed) status.textContent = '3D model could not be loaded.';
    options.onError?.(error);
    throw error;
  });

  let frame = 0;
  const tick = () => {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    if (document.hidden) return;
    if (options.autoRotate && model) model.rotation.y += options.autoRotateSpeed ?? 0.003;
    viewport.render();
  };
  tick();

  return {
    ...viewport,
    ready,
    get model() { return model; },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      disposeObject(model);
      viewport.dispose();
    },
  };
}
