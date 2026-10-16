/**
 * Cohesive Franka + ornate Baroque chess scene descriptor (pure data).
 * Render meshes are the preserved original GLBs; collision proxies are
 * derived separately and never replace presentation meshes.
 * Robot sits beside Black's side (rank 8); board frame: a1 origin, meters.
 */
import * as THREE from 'three';
export const ORNATE_BASE = 'https://assets.inneranimalmedia.com/glb/chess/baroque';
export const squareVector = (square: string) => { const p = squarePose(square); return new THREE.Vector3(p.x, p.y, p.z); };
// Original source remains R2. The serving host streams the same bytes through
// a narrow same-origin route because the public R2 domain has no CORS policy.
export const CAD_CHESS_ASSET_BASE = '/cad-creator/assets/chess/baroque';
export const ornatePieceUrl = (kind: string, color: string) => `${CAD_CHESS_ASSET_BASE}/baroque_${kind}_${color}_opt.glb`;
export const BOARD_URL = `${ORNATE_BASE}/baroque_board_opt.glb`;
export const SQUARE_M = 0.05715;
export function squarePose(square: string) {
  const f = square.charCodeAt(0)-97, r = square.charCodeAt(1)-49;
  return { x: (f+0.5)*SQUARE_M, y: (r+0.5)*SQUARE_M, z: 0 };
}
export function buildFrankaChessScene() {
  const kinds = ['king','queen','bishop','knight','rook','pawn'] as const;
  return {
    board: { url: BOARD_URL, square_m: SQUARE_M },
    robot: { id: 'franka-panda', base: { x: 0.2286, y: -0.30, z: 0 }, home: [0,-0.785,0,-2.356,0,1.571,0.785] },
    camera: { player: { pos: [0.23, -0.75, 0.65], fov: 42 }, cinematic: { pos: [0.7, -0.5, 0.45], fov: 38 }, near: 0.01, far: 50 },
    pieces: kinds.flatMap((kind) => (['white','black'] as const).map((color) => ({
      kind, color, render_url: ornatePieceUrl(kind, color),
      collision_proxy: { shape: 'cylinder', radius_m: 0.016, height_m: 0.06, derived: true },
    }))),
    opponent_modes: [
      { id: 'standard', label: 'AgentSam — Standard Chess', robot: false },
      { id: 'franka', label: 'AgentSam — Franka Robot', robot: true },
    ],
  };
}
