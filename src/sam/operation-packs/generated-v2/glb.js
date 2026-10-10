/** Structural GLB inspector. This does not replace Khronos glTF Validator. */
export function inspectGlb(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < 20) throw new Error('glb_too_small');
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (d.getUint32(0, true) !== 0x46546c67) throw new Error('glb_bad_magic');
  const version = d.getUint32(4, true);
  if (version !== 2) throw new Error('glb_unsupported_version');
  const declaredLength = d.getUint32(8, true);
  if (declaredLength !== bytes.byteLength) throw new Error('glb_length_mismatch');
  let offset = 12, json = null, binaryBytes = 0, chunks = 0;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) throw new Error('glb_truncated_chunk_header');
    const len = d.getUint32(offset, true), type = d.getUint32(offset + 4, true);
    offset += 8;
    if (offset + len > bytes.byteLength || len % 4) throw new Error('glb_invalid_chunk_length');
    if (chunks === 0 && type !== 0x4e4f534a) throw new Error('glb_json_not_first');
    if (type === 0x4e4f534a) {
      if (json) throw new Error('glb_duplicate_json');
      let src = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset, offset + len));
      src = src.replace(/[\u0000-\u0020]+$/g, '');
      json = JSON.parse(src);
    } else if (type === 0x004e4942) binaryBytes += len;
    offset += len; chunks++;
  }
  if (!json || json.asset?.version !== '2.0') throw new Error('glb_missing_gltf2_asset');
  return {
    ok: true, mediaKind: 'model3d', format: 'glb', version,
    byteLength: bytes.byteLength, binaryBytes, chunks,
    scenes: json.scenes?.length || 0,
    nodes: json.nodes?.length || 0,
    meshes: json.meshes?.length || 0,
    primitives: (json.meshes || []).reduce((n, m) => n + (m.primitives?.length || 0), 0),
    materials: json.materials?.length || 0,
    textures: json.textures?.length || 0,
    images: json.images?.length || 0,
    animations: json.animations?.length || 0,
    extensionsUsed: json.extensionsUsed || [],
    note: 'structural inspection only; full Khronos validation requires a dedicated validator'
  };
}
