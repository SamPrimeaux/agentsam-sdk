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
export const ORNATE_BAROQUE_BASE = 'https://assets.inneranimalmedia.com/glb/chess/baroque';
export const ornatePieceUrl = (kind, color) => `${ORNATE_BAROQUE_BASE}/baroque_${kind}_${color}_opt.glb`; // preserved source assets, never regenerated here
