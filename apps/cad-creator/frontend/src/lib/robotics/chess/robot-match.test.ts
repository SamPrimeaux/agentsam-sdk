import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { capturePoints, chooseRobotMove } from './robot-match';
import { chessSquarePosition } from './robot-chess-scene';

describe('robot chess integration foundation', () => {
  it('keeps human White, computer Black and legal moves chess.js-authoritative', () => {
    const game = new Chess();
    expect(chooseRobotMove(game)).toBeNull();
    game.move('e4');
    const unchanged = game.fen();
    const response = chooseRobotMove(game);
    expect(response?.color).toBe('b');
    expect(game.fen()).toBe(unchanged);
    const legal = game.moves({ verbose: true });
    expect(legal.some((move) => move.from === response?.from && move.to === response?.to)).toBe(true);
    game.move({ from: response!.from, to: response!.to, promotion: response!.promotion });
    expect(game.turn()).toBe('w');
  });

  it('scores captures as points without awarding points for quiet moves', () => {
    const game = new Chess();
    for (const move of ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3']) game.move(move);
    expect(capturePoints(game.history({ verbose: true }))).toEqual({ player: 1, robot: 1 });
  });

  it('enforces castling and promotion using chess.js rather than handcrafted rules', () => {
    const game = new Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const promotions = game.moves({ square: 'a7', verbose: true }).filter((m) => m.to === 'a8');
    expect(promotions.map((m) => m.promotion).sort()).toEqual(['b', 'n', 'q', 'r']);
  });

  it('places the player opposite Franka and scales the board in meters', () => {
    const a1 = chessSquarePosition('a1');
    const h8 = chessSquarePosition('h8');
    expect(a1.y).toBeGreaterThan(h8.y);
    expect(h8.x - a1.x).toBeGreaterThan(0.39);
    expect(h8.x - a1.x).toBeLessThan(0.41);
  });
});
