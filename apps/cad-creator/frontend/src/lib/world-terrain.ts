/**
 * Portable metric site/terrain document. This is site geometry and scenery,
 * NOT an inferred real-world elevation dataset or a modification of BIM walls.
 */
export type LandformKind = 'mountain' | 'hill' | 'valley';
export type GroundCover = 'meadow' | 'woodland' | 'rock' | 'arid';
export type SculptMode = 'raise' | 'lower' | 'flatten' | 'smooth';

export interface Landform {
  id: string;
  kind: LandformKind;
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  elevation: number;
  rotation: number;
  sharpness: number;
}

export interface SculptStroke {
  x: number;
  z: number;
  radius: number;
  strength: number;
  mode: SculptMode;
  target?: number;
}

export interface TerrainDocument {
  schema: 'agentsam.cad.terrain.v1';
  units: 'm';
  width: number;
  depth: number;
  resolution: number;
  baseElevation: number;
  protectedRadius: number;
  cover: GroundCover;
  seed: number;
  treeCount: number;
  rockCount: number;
  treeScale: number;
  rockScale: number;
  landforms: Landform[];
  strokes: SculptStroke[];
  /** Optional imported elevation grid, row-major from negative Z to positive Z. */
  imported?: { columns: number; rows: number; heights: number[] };
}

const finite = (x: unknown, fallback: number) =>
  typeof x === 'number' && Number.isFinite(x) ? x : fallback;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const terrainSchema = 'agentsam.cad.terrain.v1' as const;

export function createTerrainDocument(baseElevation = 0): TerrainDocument {
  return {
    schema: terrainSchema, units: 'm', width: 420, depth: 420, resolution: 96,
    baseElevation, protectedRadius: 73, cover: 'woodland', seed: 12571,
    treeCount: 110, rockCount: 80, treeScale: 1, rockScale: 1, strokes: [],
    landforms: [
      {id:'north-ridge',kind:'mountain',x:-132,z:-145,radiusX:94,radiusZ:65,elevation:37,rotation:-18,sharpness:1.6},
      {id:'west-foothills',kind:'hill',x:-163,z:65,radiusX:85,radiusZ:100,elevation:19,rotation:22,sharpness:1.1},
      {id:'east-ridge',kind:'mountain',x:141,z:128,radiusX:80,radiusZ:115,elevation:42,rotation:28,sharpness:1.9},
    ],
  };
}

function envelope(x: number, z: number, form: Landform): number {
  const theta = form.rotation * Math.PI / 180;
  const dx = x - form.x, dz = z - form.z;
  const rx = (dx * Math.cos(theta) - dz * Math.sin(theta)) / form.radiusX;
  const rz = (dx * Math.sin(theta) + dz * Math.cos(theta)) / form.radiusZ;
  const distance = Math.hypot(rx, rz);
  if (distance >= 2.6) return 0;
  const gaussian = Math.exp(-Math.pow(distance, Math.max(.6, form.sharpness)) * 2.8);
  return form.elevation * gaussian;
}
function protection(x: number, z: number, radius: number) {
  const d = Math.hypot(x, z);
  const edge = clamp((d - radius) / 24, 0, 1);
  return edge * edge * (3 - 2 * edge);
}
function importedHeight(doc: TerrainDocument, x: number, z: number) {
  if (!doc.imported) return 0;
  const {columns, rows, heights} = doc.imported;
  const px = clamp((x / doc.width + .5) * (columns - 1), 0, columns - 1);
  const pz = clamp((z / doc.depth + .5) * (rows - 1), 0, rows - 1);
  const x0 = Math.floor(px), z0 = Math.floor(pz);
  const x1 = Math.min(columns - 1, x0 + 1), z1 = Math.min(rows - 1, z0 + 1);
  const tx = px - x0, tz = pz - z0;
  const a = heights[z0 * columns + x0], b = heights[z0 * columns + x1];
  const c = heights[z1 * columns + x0], d = heights[z1 * columns + x1];
  return a * (1 - tx) * (1 - tz) + b * tx * (1 - tz) + c * (1 - tx) * tz + d * tx * tz;
}

export function terrainHeight(doc: TerrainDocument, x: number, z: number): number {
  const editableHeight = doc.landforms.reduce((sum, form) => sum + envelope(x, z, form), 0)
    + importedHeight(doc, x, z);
  let height = doc.baseElevation + protection(x, z, doc.protectedRadius) * editableHeight;
  for (const stroke of doc.strokes) {
    const distance = Math.hypot(x - stroke.x, z - stroke.z);
    if (distance >= stroke.radius) continue;
    const fade = 1 - distance / stroke.radius;
    const weight = fade * fade * (3 - 2 * fade);
    if (stroke.mode === 'flatten' || stroke.mode === 'smooth')
      height += ((stroke.target ?? doc.baseElevation) - height) * weight * clamp(stroke.strength, 0, 1);
    else height += weight * stroke.strength * (stroke.mode === 'lower' ? -1 : 1);
  }
  return height;
}

export function addLandform(doc: TerrainDocument, kind: LandformKind): TerrainDocument {
  const index = doc.landforms.length + 1;
  const next: Landform = {
    id: kind + '-' + index,kind,
    x: index % 2 ? 115 : -120,z:index % 3 ? -110 : 105,
    radiusX:kind === 'mountain' ? 65 : 50,
    radiusZ:kind === 'mountain' ? 65 : 50,
    elevation:kind === 'valley' ? -8 : kind === 'mountain' ? 35 : 12,
    rotation:0,sharpness:kind === 'mountain' ? 1.8 : 1,
  };
  return {...doc,landforms:[...doc.landforms,next]};
}

export function addSculptStroke(doc: TerrainDocument, x: number, z: number, radius: number,
  strength: number, mode: SculptMode): TerrainDocument {
  const stroke: SculptStroke = {
    x,z,radius:clamp(radius,1,100),strength:clamp(strength, .01, 50),mode,
    ...(mode === 'flatten' ? {target:doc.baseElevation} :
      mode === 'smooth' ? {target:(terrainHeight(doc,x+radius/2,z)+terrainHeight(doc,x-radius/2,z)
        +terrainHeight(doc,x,z+radius/2)+terrainHeight(doc,x,z-radius/2))/4} : {}),
  };
  return {...doc,strokes:[...doc.strokes,stroke]};
}

export function validateTerrainDocument(raw: unknown): TerrainDocument {
  if (!raw || typeof raw !== 'object') throw Error('Not a terrain document');
  const o = raw as Record<string,unknown>;
  if (o.schema !== terrainSchema || o.units !== 'm') throw Error('Unsupported terrain schema or units');
  const dimensions = ['width','depth','resolution','baseElevation','protectedRadius','seed','treeCount','rockCount'];
  for (const k of dimensions) if (!Number.isFinite(o[k])) throw Error('Invalid terrain field: ' + k);
  if (finite(o.width,0)<20 || finite(o.width,0)>20000 || finite(o.depth,0)<20 || finite(o.depth,0)>20000 ||
    !Number.isInteger(o.resolution) || finite(o.resolution,0)<16 || finite(o.resolution,0)>256)
    throw Error('Terrain grid size is out of bounds');
  if (!['meadow','woodland','rock','arid'].includes(String(o.cover))) throw Error('Invalid ground cover');
  if (!Array.isArray(o.landforms) || o.landforms.length > 200 ||
    !Array.isArray(o.strokes) || o.strokes.length > 5000) throw Error('Too many terrain operations');
  if (finite(o.treeCount,0)<0 || finite(o.treeCount,0)>2500 || finite(o.rockCount,0)<0 || finite(o.rockCount,0)>2500 ||
    finite(o.protectedRadius,0)<0 || finite(o.protectedRadius,0)>10000) throw Error('Invalid site features');
  const treeScale = finite(o.treeScale,1),rockScale=finite(o.rockScale,1);
  if(treeScale<.1||treeScale>12||rockScale<.1||rockScale>12)throw Error('Invalid scenery scale');
  const landforms = o.landforms.map(value => {
    const f = value as Landform;
    if (!f || typeof f.id !== 'string' || f.id.length > 128 ||
      !['mountain','hill','valley'].includes(f.kind) ||
      ![f.x,f.z,f.radiusX,f.radiusZ,f.elevation,f.rotation,f.sharpness].every(Number.isFinite) ||
      f.radiusX < 1 || f.radiusZ < 1 || f.radiusX > 10000 || f.radiusZ > 10000 ||
      f.sharpness < .25 || f.sharpness > 6 || Math.abs(f.elevation)>3000) throw Error('Invalid landform');
    return {...f};
  });
  const strokes = o.strokes.map(value => {
    const s = value as SculptStroke;
    if (!s || !['raise','lower','flatten','smooth'].includes(s.mode) ||
      ![s.x,s.z,s.radius,s.strength].every(Number.isFinite) ||
      s.radius<1 || s.radius>100 || s.strength<0 || s.strength>50 ||
      (s.target!==undefined&&!Number.isFinite(s.target))) throw Error('Invalid sculpt operation');
    return {...s};
  });
  let imported: TerrainDocument['imported'];
  if (o.imported !== undefined) {
    const grid = o.imported as NonNullable<TerrainDocument['imported']>;
    if (!grid || !Number.isInteger(grid.columns) || !Number.isInteger(grid.rows) ||
      grid.columns < 2 || grid.rows < 2 || grid.columns > 1024 || grid.rows > 1024 ||
      !Array.isArray(grid.heights) || grid.heights.length !== grid.columns * grid.rows ||
      !grid.heights.every(n => Number.isFinite(n) && Math.abs(n) <= 10000))
      throw Error('Invalid elevation grid');
    imported = {columns:grid.columns,rows:grid.rows,heights:[...grid.heights]};
  }
  return {schema:terrainSchema,units:'m',width:o.width as number,depth:o.depth as number,
    resolution:o.resolution as number,baseElevation:o.baseElevation as number,
    protectedRadius:o.protectedRadius as number,cover:o.cover as GroundCover,seed:o.seed as number,
    treeCount:o.treeCount as number,rockCount:o.rockCount as number,treeScale,rockScale,landforms,strokes,
    ...(imported?{imported}:{})};
}
