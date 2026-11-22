/** Keep the decoder path aligned with the compressed GLB ingestion already used by SamScene. */
export const DEFAULT_DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

const sharedDracoLoaders = new WeakMap();

function getSharedDracoLoader(DRACOLoader, decoderPath) {
  let byPath = sharedDracoLoaders.get(DRACOLoader);
  if (!byPath) {
    byPath = new Map();
    sharedDracoLoaders.set(DRACOLoader, byPath);
  }
  let loader = byPath.get(decoderPath);
  if (!loader) {
    loader = new DRACOLoader();
    loader.setDecoderPath(decoderPath);
    loader.preload?.();
    byPath.set(decoderPath, loader);
  }
  return loader;
}

/**
 * Create a host-version-compatible GLTFLoader and attach the shared Draco decoder
 * when the host supplies DRACOLoader. The host still owns its Three.js version.
 */
export function createConfiguredGLTFLoader(runtime, options = {}) {
  const GLTFLoader = runtime?.GLTFLoader;
  if (typeof GLTFLoader !== 'function') throw new Error('agentsam_3d_gltf_loader_required');

  const loader = new GLTFLoader(options.manager);
  const dracoEnabled = options.draco !== false;
  const DRACOLoader = runtime?.DRACOLoader;
  if (dracoEnabled && typeof DRACOLoader === 'function') {
    loader.setDRACOLoader(getSharedDracoLoader(DRACOLoader, options.decoderPath ?? DEFAULT_DRACO_DECODER_PATH));
  } else if (dracoEnabled && options.requireDraco) {
    throw new Error('agentsam_3d_draco_loader_required');
  }

  if (typeof options.withCredentials === 'boolean') loader.setWithCredentials?.(options.withCredentials);
  if (typeof options.crossOrigin === 'string') loader.setCrossOrigin?.(options.crossOrigin);
  return loader;
}
