// Chess adapter: legal structured move (from chess.js authority upstream) -> generic relocations.
// Generic robotics layer below this file knows no chess rules.
export function moveToGoals(move) {
  if (!move?.object_id || !move?.from || !move?.to) throw new Error('invalid_move:object_id,from,to required');
  const goals = [];
  if (move.captured_id) goals.push({ goal: 'relocate', object_id: move.captured_id, from: move.captured_square || move.to, to: 'capture_tray', reason: 'capture_removed_first' });
  goals.push({ goal: 'relocate', object_id: move.object_id, from: move.from, to: move.to });
  if (move.castle_rook_id) goals.push({ goal: 'relocate', object_id: move.castle_rook_id, from: move.castle_rook_from, to: move.castle_rook_to, reason: 'castling' });
  if (move.promotion) goals.push({ goal: 'replace_representation', object_id: move.object_id, promote_to: move.promotion, at: move.to });
  // en passant: captured pawn is not on `to` square — captured_square carries it.
  return { environment: 'chess', execution: 'simulation', goals };
}
// Same-origin default only. The consuming host supplies a CDN origin when needed.
// Never encode an operator's domain into the portable SAM robotics adapter.
export const ORNATE_BAROQUE_BASE = '/glb/chess/baroque';
export function ornatePieceUrl(kind, color, { baseUrl = ORNATE_BAROQUE_BASE } = {}) {
  const base = String(baseUrl).replace(/\/+$/, '');
  if (!base) throw new Error('ornate_asset_base_required');
  return `${base}/baroque_${kind}_${color}_opt.glb`; // source GLBs remain owned/preserved by the host
}
