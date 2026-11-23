/**
 * CAD-relevant subset of the canonical agentsam.source-types.v2 identity catalog.
 * This is an extension-to-identity routing policy, NOT a codec or permission list.
 * The alignment test checks every ID/extension against contracts/source-types.v2.json.
 * Unknown sources are not silently assumed to be importable.
 */
export const CAD_SOURCE_FORMATS = Object.freeze([
  ['cad.freecad', 'native-bim', '.fcstd'],
  ['cad.openscad', 'parametric', '.scad'],
  ['cad.step', 'native-bim', '.step', '.stp'],
  ['cad.iges', 'native-bim', '.iges', '.igs'],
  ['cad.opencascade-brep', 'native-bim', '.brep'],
  ['bim.ifc', 'native-bim', '.ifc'],
  ['bim.ifczip', 'native-bim', '.ifczip'],
  ['bim.ifcxml', 'native-bim', '.ifcxml'],
  ['bim.revit-project', 'native-bim', '.rvt'],
  ['bim.revit-family', 'native-bim', '.rfa'],
  ['cad.dxf', 'exchange', '.dxf'],
  ['cad.dwg', 'exchange', '.dwg'],
  ['model.stl', 'exchange', '.stl'],
  ['model.3mf', 'exchange', '.3mf'],
  ['model.wavefront-obj', 'exchange', '.obj'],
  ['model.ply', 'exchange', '.ply'],
  ['model.iamscene', 'presentation', '.iamscene.json', '.iamscene'],
  ['model.iamgeometry', 'exchange', '.iamgeometry'],
  ['model.glb', 'presentation', '.glb'],
  ['model.gltf', 'presentation', '.gltf'],
  ['model.blender', 'presentation', '.blend'],
  ['model.fbx', 'presentation', '.fbx'],
  ['model.collada', 'presentation', '.dae'],
  ['model.usd', 'presentation', '.usd'],
  ['model.usda', 'presentation', '.usda'],
  ['model.usdc', 'presentation', '.usdc'],
  ['model.usdz', 'presentation', '.usdz'],
  ['pointcloud.e57', 'exchange', '.e57'],
  ['pointcloud.las', 'exchange', '.las'],
  ['pointcloud.laz', 'exchange', '.laz'],
  ['pointcloud.xyz', 'exchange', '.xyz'],
  ['image.svg', 'exchange', '.svg'],
  ['image.png', 'presentation', '.png'],
  ['image.jpeg', 'presentation', '.jpg', '.jpeg'],
  ['image.webp', 'presentation', '.webp'],
  ['image.tiff', 'presentation', '.tif', '.tiff'],
  ['image.exr', 'presentation', '.exr'],
  ['document.pdf', 'verification', '.pdf'],
  ['data.csv', 'verification', '.csv'],
  ['data.json', 'verification', '.json'],
  ['archive.zip', 'exchange', '.zip'],
  ['video.mp4', 'presentation', '.mp4', '.m4v'],
  ['video.quicktime', 'presentation', '.mov'],
  ['video.matroska', 'presentation', '.mkv'],
  ['media.otio', 'exchange', '.otio'],
  ['media.otioz', 'exchange', '.otioz'],
  ['audio.wav', 'presentation', '.wav', '.wave'],
  ['cam.gcode', 'exchange', '.gcode', '.gc', '.nc', '.ngc', '.tap', '.cnc', '.mpf'],
].map(([id, role, ...extensions]) => Object.freeze({
  id, role, extensions: Object.freeze(extensions),
})));

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

/** Translate a legacy delivery label (e.g. "jpeg" or "mov") into canonical format identity. */
export function cadOutputFormatReference(label) {
  if (typeof label !== 'string' || !/^[a-z0-9.+-]{1,32}$/i.test(label)) return null;
  const found = identifyCadFileFormat('artifact.' + label.toLowerCase().replace(/^\./, ''));
  return found ? { catalog: found.catalog, id: found.id, extension: found.extension } : null;
}
