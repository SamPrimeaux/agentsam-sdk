/**
 * CAD-relevant subset of the canonical agentsam.source-types.v2 identity catalog.
 * The catalog owns extensions. Only CAD-specific roles and ambiguity policy
 * belong here. Recognition is not evidence of codec/import/export readiness.
 */
import sourceCatalog from '@inneranimalmedia/agentsam-contracts/source-types/catalog' with { type: 'json' };

const formatsById = new Map(sourceCatalog.formats.map(format => [format.id, format]));
const cadRoles = Object.freeze([
  ['cad.freecad', 'native-bim'],
  ['cad.openscad', 'parametric'],
  ['cad.step', 'native-bim'],
  ['cad.iges', 'native-bim'],
  ['cad.opencascade-brep', 'native-bim'],
  ['bim.ifc', 'native-bim'],
  ['bim.ifczip', 'native-bim'],
  ['bim.ifcxml', 'native-bim'],
  ['bim.revit-project', 'native-bim'],
  ['bim.revit-family', 'native-bim'],
  ['cad.dxf', 'exchange'],
  ['cad.dwg', 'exchange'],
  ['model.stl', 'exchange'],
  ['model.3mf', 'exchange'],
  ['model.wavefront-obj', 'exchange'],
  ['model.ply', 'exchange'],
  ['model.iamscene', 'presentation'],
  ['model.iamgeometry', 'exchange'],
  ['model.glb', 'presentation'],
  ['model.gltf', 'presentation'],
  ['model.blender', 'presentation'],
  ['model.fbx', 'presentation'],
  ['model.collada', 'presentation'],
  ['model.usd', 'presentation'],
  ['model.usda', 'presentation'],
  ['model.usdc', 'presentation'],
  ['model.usdz', 'presentation'],
  ['pointcloud.e57', 'exchange'],
  ['pointcloud.las', 'exchange'],
  ['pointcloud.laz', 'exchange'],
  ['pointcloud.xyz', 'exchange'],
  ['image.svg', 'exchange'],
  ['image.png', 'presentation'],
  ['image.jpeg', 'presentation'],
  ['image.webp', 'presentation'],
  ['image.tiff', 'presentation'],
  ['image.exr', 'presentation'],
  ['document.pdf', 'verification'],
  ['data.csv', 'verification'],
  ['data.json', 'verification'],
  ['archive.zip', 'exchange'],
  ['video.mp4', 'presentation'],
  ['video.quicktime', 'presentation'],
  ['video.matroska', 'presentation'],
  ['media.otio', 'exchange'],
  ['media.otioz', 'exchange'],
  ['audio.wav', 'presentation'],
  ['cam.gcode', 'exchange'],
]);

// .h is a recognized G-code alias in some controllers but overwhelmingly a
// programming-language header. Do not discover all headers as CNC programs.
const excludedExtensions = Object.freeze({ 'cam.gcode': new Set(['.h']) });
export const CAD_SOURCE_FORMATS = Object.freeze(cadRoles.map(([id, role]) => {
  const canonical = formatsById.get(id);
  if (!canonical) throw new Error('cad_source_format_missing_from_catalog:' + id);
  const extensions = canonical.extensions.filter(ext => !excludedExtensions[id]?.has(ext));
  if (!extensions.length) throw new Error('cad_source_format_has_no_extensions:' + id);
  return Object.freeze({ id, role, extensions: Object.freeze(extensions) });
}));

const suffixes = CAD_SOURCE_FORMATS.flatMap(entry =>
  entry.extensions.map(extension => ({ entry, extension }))
).sort((a, b) => b.extension.length - a.extension.length);

/** Longest suffix wins; returns an extension HINT, never file-content verification. */
export function identifyCadFileFormat(filename) {
  if (typeof filename !== 'string' || filename.length === 0) return null;
  const basename = filename.split(/[\\/]/).at(-1).split(/[?#]/)[0].toLowerCase();
  const match = suffixes.find(({ extension }) => basename.endsWith(extension) && basename.length > extension.length);
  return match ? {
    catalog: 'agentsam.source-types.v2',
    id: match.entry.id,
    extension: match.extension,
    role: match.entry.role,
  } : null;
}

/** Translate a legacy delivery label into canonical format identity. */
export function cadOutputFormatReference(label) {
  if (typeof label !== 'string' || !/^[a-z0-9.+-]{1,32}$/i.test(label)) return null;
  const found = identifyCadFileFormat('artifact.' + label.toLowerCase().replace(/^\./, ''));
  return found ? { catalog: found.catalog, id: found.id, extension: found.extension } : null;
}
