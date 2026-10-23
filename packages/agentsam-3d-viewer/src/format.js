const SUPPORTED_FORMATS = new Set(['glb', 'gltf', 'stl']);

/** Resolve a model format from an explicit option, URL, or Blob MIME type. */
export function inferModelFormat(source, explicitFormat) {
  if (explicitFormat != null) {
    const format = String(explicitFormat).toLowerCase().replace(/^\./, '');
    if (!SUPPORTED_FORMATS.has(format)) throw new Error('agentsam_3d_format_unsupported');
    return format;
  }
  if (typeof source === 'string') {
    const pathname = source.split(/[?#]/, 1)[0].toLowerCase();
    const match = pathname.match(/\.(glb|gltf|stl)$/);
    if (match) return match[1];
  }
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    const mime = String(source.type || '').toLowerCase();
    if (mime === 'model/gltf-binary' || mime === 'model/vnd.gltf.binary') return 'glb';
    if (mime === 'model/gltf+json' || mime === 'model/gltf+json; charset=utf-8') return 'gltf';
    if (mime === 'model/stl' || mime === 'application/sla') return 'stl';
  }
  throw new Error('agentsam_3d_format_required');
}

export const SUPPORTED_MODEL_FORMATS = Object.freeze([...SUPPORTED_FORMATS]);
