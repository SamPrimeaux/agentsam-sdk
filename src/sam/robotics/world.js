// Engine-neutral robotics world model. No chess rules, no CAD storage, no LLM.
// Units: canonical CAD DesignProject = inches (scale=1). Robotics SI = meters.
// Conversions happen ONLY here at explicit boundaries: inches->mm (OCCT) ->m (Blender/MuJoCo).
import { createHash } from 'node:crypto';

export const WORLD_SCHEMA = 'sam.robotics.world.v1';
export const INCH_MM = 25.4;
export const inchesToMm = (v) => v * INCH_MM;
export const inchesToM = (v) => (v * INCH_MM) / 1000;
export const mmToM = (v) => v / 1000;
export const mToMm = (v) => v * 1000;

export function hashScene(value) {
  return createHash('sha256').update(JSON.stringify(sortKeys(value))).digest('hex');
}
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

// Calibrated chessboard frame: origin at a1 corner, +x toward h-file, +y toward rank 8, meters.
export const BOARD = { squareM: 0.05715, origin: { x: 0, y: 0, z: 0 } }; // 2.25in squares
export function squareToWorld(square, board = BOARD) {
  if (!/^[a-h][1-8]$/.test(square || '')) throw new Error(`invalid_square:${square}`);
  const file = square.charCodeAt(0) - 97, rank = square.charCodeAt(1) - 49;
  return { x: board.origin.x + (file + 0.5) * board.squareM, y: board.origin.y + (rank + 0.5) * board.squareM, z: board.origin.z };
}
export function worldToSquare(p, board = BOARD) {
  const f = Math.floor((p.x - board.origin.x) / board.squareM), r = Math.floor((p.y - board.origin.y) / board.squareM);
  if (f < 0 || f > 7 || r < 0 || r > 7) return null;
  return `${String.fromCharCode(97 + f)}${r + 1}`;
}

/** Build inspectable world state. objects: [{id,kind,square?|pose}] identity survives moves. */
export function createWorld({ environment = 'chess', objects = [], robot = null, source = null } = {}) {
  const objs = objects.map((o) => ({ ...o, pose: o.pose ?? (o.square ? squareToWorld(o.square) : { x: 0, y: 0, z: 0 }) }));
  const world = {
    schema: WORLD_SCHEMA, environment, time: 0,
    frames: { board: BOARD, robot_base: { x: 0.3, y: -0.25, z: 0 }, units: 'meters' },
    objects: objs, robot, source, // source: {project_id, revision, content_hash} for CAD-derived scenes
  };
  world.scene_hash = hashScene({ objects: objs, robot, source });
  return world;
}
export function locateObject(world, objectId) {
  const o = world?.objects?.find((x) => x.id === objectId);
  return o ? { found: true, object_id: o.id, kind: o.kind, square: o.square ?? worldToSquare(o.pose), pose: o.pose } : { found: false, object_id: objectId };
}
export function applyRelocation(world, objectId, toSquare) {
  const next = structuredClone(world);
  const o = next.objects.find((x) => x.id === objectId);
  if (!o) throw new Error(`object_not_found:${objectId}`);
  o.square = toSquare; o.pose = squareToWorld(toSquare);
  next.scene_hash = hashScene({ objects: next.objects, robot: next.robot, source: next.source });
  return next;
}
