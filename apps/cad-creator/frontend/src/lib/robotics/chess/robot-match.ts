/** Deterministic, zero-LLM chess opponent. chess.js is rules authority. */
import { Chess, type Move } from 'chess.js';

export const POINT_VALUES: Readonly<Record<string, number>> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function capturePoints(history: readonly Move[]) {
  return history.reduce((score, move) => {
    if (move.captured) score[move.color === 'w' ? 'player' : 'robot'] += POINT_VALUES[move.captured] ?? 0;
    return score;
  }, { player: 0, robot: 0 });
}

function evaluateRobotPosition(game: Chess): number {
  if (game.isCheckmate()) return game.turn() === 'w' ? 100_000 : -100_000;
  if (game.isDraw()) return 0;
  let value = 0;
  for (const row of game.board()) for (const piece of row) {
    if (!piece) continue;
    const pieceValue = POINT_VALUES[piece.type] ?? 0;
    const rank = Number(piece.square[1]);
    const file = piece.square.charCodeAt(0) - 97;
    const development = piece.type === 'p' ? (piece.color === 'b' ? 7-rank : rank-2) * 0.045 : 0;
    const center = (3.5-Math.abs(3.5-file)) * 0.026 + (3.5-Math.abs(4.5-rank)) * 0.026;
    value += (piece.color === 'b' ? 1 : -1) * (pieceValue + center + development);
  }
  return value;
}

/** Two-ply deterministic search; evaluations never mutate the player's game. */
export function chooseRobotMove(game: Chess): Move | null {
  if (game.turn() !== 'b' || game.isGameOver()) return null;
  let best: Move | null = null;
  let highScore = -Infinity;
  for (const move of game.moves({ verbose: true }) as Move[]) {
    const search = new Chess(game.fen());
    search.move({ from: move.from, to: move.to, promotion: move.promotion });
    let score = evaluateRobotPosition(search);
    if (!search.isGameOver()) {
      let worst = Infinity;
      for (const reply of search.moves({ verbose: true }) as Move[]) {
        search.move({ from: reply.from, to: reply.to, promotion: reply.promotion });
        worst = Math.min(worst, evaluateRobotPosition(search));
        search.undo();
      }
      score = worst;
    }
    if (score > highScore || (score === highScore && move.san.localeCompare(best?.san ?? '') < 0)) {
      best = move;
      highScore = score;
    }
  }
  return best;
}
