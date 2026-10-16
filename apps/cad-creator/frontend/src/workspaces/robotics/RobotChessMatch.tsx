import React, { useEffect, useRef, useState } from 'react';
import { Chess, type Square, type Move } from 'chess.js';
import type { SimulationProvider } from '../../lib/robotics/simulation/provider';
import { RobotChessScene } from '../../lib/robotics/chess/robot-chess-scene';
import { capturePoints, chooseRobotMove } from '../../lib/robotics/chess/robot-match';

interface Props { provider: SimulationProvider; onLeave: () => void }

export function RobotChessMatch({ provider, onLeave }: Props) {
  const game = useRef(new Chess());
  const scene = useRef<RobotChessScene | null>(null);
  const callbackRef = useRef<(square: Square) => void>(() => {});
  const alive = useRef(false);
  const [fen, setFen] = useState(() => game.current.fen());
  const [selected, setSelected] = useState<Square | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('Your move · Select a white piece');
  const [lastRobot, setLastRobot] = useState<Move | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [assetProgress, setAssetProgress] = useState('Loading original chess models · 0/12');
  const [assetError, setAssetError] = useState<string | null>(null);
  const [assetRetry, setAssetRetry] = useState(0);
  const history = game.current.history({ verbose: true }) as Move[];
  const points = capturePoints(history);
  const legal = selected ? game.current.moves({ square: selected, verbose: true }).map(m => m.to) : [];

  useEffect(() => {
    alive.current = true;
    try {
      const overlay = new RobotChessScene(provider, (square) => callbackRef.current(square));
      scene.current = overlay;
      overlay.draw(game.current, null, []);
      setAssetError(null);
      setAssetProgress('Loading original chess models · 0/12');
      void overlay.loadBaroquePieces((done,total) => {
        if (alive.current) setAssetProgress('Loading original chess models · ' + done + '/' + total);
      }).then(() => {
        if (!alive.current) return;
        setAssetProgress('Original Baroque models loaded');
        overlay.draw(game.current, null, []);
      }).catch(error => {
        if (!alive.current) return;
        setAssetError(error instanceof Error ? error.message : String(error));
        setAssetProgress('Original models unavailable · procedural fallback');
      });
    } catch (error) {
      setSceneError(error instanceof Error ? error.message : String(error));
    }
    return () => {
      alive.current = false;
      scene.current?.dispose();
      scene.current = null;
    };
  }, [provider, assetRetry]);

  useEffect(() => { scene.current?.draw(game.current, selected, legal); }, [fen, selected]);

  const refresh = () => setFen(game.current.fen());
  const reset = () => {
    if (busy) return;
    game.current.reset();
    setSelected(null);
    setLastRobot(null);
    setPhase('Your move · Select a white piece');
    provider.reset();
    refresh();
  };

  callbackRef.current = (square) => {
    if (busy || game.current.isGameOver() || game.current.turn() !== 'w') return;
    const piece = game.current.get(square);
    if (!selected) {
      if (piece?.color === 'w') {
        setSelected(square);
        if (!game.current.moves({square,verbose:true}).length)
          setPhase('No legal moves from ' + square + ' · select another white piece');
        else setPhase('Selected ' + square + ' · choose an illuminated destination');
      }
      return;
    }
    if (piece?.color === 'w') {
      setSelected(square);
      setPhase(game.current.moves({square,verbose:true}).length ? 'Selected ' + square + ' · choose an illuminated destination' : 'No legal moves from ' + square);
      return;
    }
    let move: Move;
    try {
      // Until a dedicated promotion chooser is included, promote to a queen.
      move = game.current.move({ from: selected, to: square, promotion: 'q' }) as Move;
    } catch {
      setSelected(null);
      setPhase('Illegal move · Choose a highlighted square');
      return;
    }
    setSelected(null);
    refresh();
    if (game.current.isGameOver()) {
      setPhase(game.current.isCheckmate() ? 'Checkmate! You win.' : 'Game drawn');
      return;
    }
    setBusy(true);
    setPhase('Franka is choosing a move…');
    void (async () => {
      const robot = chooseRobotMove(game.current);
      if (!robot || !alive.current) {
        if (alive.current) setBusy(false);
        return;
      }
      setPhase('Franka moving ' + robot.from + ' → ' + robot.to + ' · Visual simulation');
      // The validated chess turn commits independently of a visual gesture.
      // A renderer or IK failure must never undo the authoritative game state.
      game.current.move({ from: robot.from, to: robot.to, promotion: robot.promotion });
      setLastRobot(robot);
      refresh();
      try {
        await scene.current?.showRobotMove(robot);
        if (!alive.current) return;
        if (game.current.isCheckmate()) setPhase('Checkmate! Franka wins.');
        else if (game.current.isDraw()) setPhase('Game drawn');
        else if (game.current.isCheck()) setPhase('Check · Your move');
        else setPhase('Your move · Select a white piece');
      } catch (error) {
        if (alive.current) {
          setPhase('Chess move recorded; simulated robot gesture interrupted.');
          console.error('Franka chess simulation:', error);
        }
      } finally {
        if (alive.current) setBusy(false);
      }
    })();
  };

  return (
    <>
      <div className="pointer-events-auto absolute left-3 top-3 z-30 w-[min(290px,calc(100%-24px))] rounded-2xl border border-white/15 bg-[#121720]/95 px-3 py-3 text-slate-100 shadow-xl" data-testid="robot-chess-hud">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[9px] uppercase tracking-[.16em] text-amber-300">AgentSam / Robotics</p>
            <h2 className="text-sm font-semibold tracking-wide">Chess vs Franka</h2>
          </div>
          <button type="button" className="rounded-lg border border-white/15 px-2 py-1 text-[10px] hover:bg-white/10 focus-visible:outline focus-visible:outline-2" onClick={onLeave}>Sandbox</button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 border-y border-white/10 py-2">
          <div className="min-w-0"><p className="text-[10px] text-slate-400">You · White</p><p className="text-xl font-semibold tabular-nums">{points.player} <span className="text-[9px] text-slate-400">pts</span></p></div>
          <span className="text-[10px] text-slate-500">vs</span>
          <div className="min-w-0 text-right"><p className="text-[10px] text-slate-400">Franka · Black</p><p className="text-xl font-semibold tabular-nums">{points.robot} <span className="text-[9px] text-slate-400">pts</span></p></div>
        </div>
        <p aria-live="polite" className="mt-2 text-[11px] text-slate-200">{sceneError ? 'Chess viewport unavailable: ' + sceneError : phase}</p>
        <p data-testid="baroque-load-status" role="status" className={`mt-1 text-[10px] ${assetError ? 'text-amber-300' : 'text-slate-400'}`}>
          {assetProgress}
        </p>
        {assetError && <button type="button" onClick={() => setAssetRetry(value => value+1)}
          className="mt-1 rounded-md border border-amber-500/30 px-2 py-1 text-[10px] text-amber-200 focus-visible:outline focus-visible:outline-2">
          Retry original GLBs
        </button>}
        {lastRobot && <p className="mt-1 text-[10px] text-amber-300">Last: Franka {lastRobot.san}</p>}
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={reset} disabled={busy} className="rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-medium hover:bg-white/20 disabled:opacity-40">New game</button>
          <span className="text-[10px] text-slate-400">{history.length} half-moves</span>
          {game.current.isCheck() && <span className="ml-auto text-[10px] text-amber-300">Check</span>}
        </div>
        <p className="mt-2 text-[9px] leading-relaxed text-slate-400">Capture points: pawn 1 · knight/bishop 3 · rook 5 · queen 9. Chess rules are enforced. Robot action is Mode A visual/IK, not a verified physical grasp.</p>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-xl border border-white/10 bg-[#121720]/90 px-3 py-2 text-[10px] text-slate-200">
        <span className="text-emerald-300">●</span> {busy ? 'Simulation running' : 'Interactive 3D board'} · Drag to orbit · Scroll to zoom
      </div>
    </>
  );
}
