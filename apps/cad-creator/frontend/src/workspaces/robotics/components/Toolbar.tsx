/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import { Moon, PanelRight, Pause, Play, RotateCcw, Sun, MoveUpRight } from 'lucide-react';

interface ToolbarProps {
  isPaused: boolean;
  togglePause: () => void;
  onReset: () => void;
  onReachTest: () => void;
  isReachRunning: boolean;
  showSidebar: boolean;
  toggleSidebar: () => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

/**
 * Toolbar
 * Floating control bar for simulation actions.
 */
export function Toolbar({
  isPaused,
  togglePause,
  onReset,
  onReachTest,
  isReachRunning,
  showSidebar,
  toggleSidebar,
  isDarkMode,
  toggleDarkMode
}: ToolbarProps) {
  const panelStyle = isDarkMode ? "bg-slate-900/80 border-white/10 text-slate-100" : "bg-white/70 border-white/80 text-slate-800";
  const iconFill = isDarkMode ? "fill-slate-100" : "fill-slate-800";

  return (
    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 min-[660px]:left-10 min-[660px]:translate-x-0 flex items-center gap-2 z-30 max-w-[calc(100vw-16px)] overflow-x-auto">

      {/* Play/Pause Button */}
      <button
        onClick={togglePause}
        className={`h-10 shrink-0 rounded-xl px-2 glass-panel flex items-center justify-center gap-1 transition-all hover:scale-105 active:scale-95 shadow-xl ${panelStyle}`}
        title={isPaused ? "Resume" : "Pause"}
        aria-label={isPaused ? "Resume simulation" : "Pause simulation"}
      >
        {isPaused ? <Play className={`w-4 h-4 ${iconFill}`} /> : <Pause className={`w-4 h-4 ${iconFill}`} />}
        <span className="text-[10px]">{isPaused ? "Resume" : "Pause"}</span>
      </button>

      {/* Reset Button */}
      <button
        onClick={onReset}
        className={`h-10 shrink-0 rounded-xl px-2 glass-panel flex items-center justify-center gap-1 transition-all hover:scale-105 active:scale-95 shadow-xl ${panelStyle}`}
        title="Reset Simulation"
        aria-label="Reset simulation"
      >
        <RotateCcw className="w-4 h-4" />
        <span className="text-[10px]">Reset</span>
      </button>

      <button type="button" onClick={onReachTest} disabled={isReachRunning}
        className={`h-12 rounded-xl border border-emerald-500/30 px-3 text-xs font-semibold flex items-center gap-2 hover:bg-emerald-500/20 disabled:opacity-40 ${panelStyle}`}
        title="Command a small simulated IK reach and measure actual end-effector displacement">
        <MoveUpRight className="size-4" />
        <span>{isReachRunning ? 'Measuring…' : 'Test reach'}</span>
      </button>

      {/* Dark Mode Toggle */}
      <button
        onClick={toggleDarkMode}
        className={`h-10 shrink-0 rounded-xl px-2 glass-panel flex items-center justify-center gap-1 transition-all hover:scale-105 active:scale-95 shadow-xl ${panelStyle}`}
        title={isDarkMode ? "Light Mode" : "Dark Mode"}
        aria-label={isDarkMode ? "Use light mode" : "Use dark mode"}
      >
        {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        <span className="text-[10px]">{isDarkMode ? "Light" : "Dark"}</span>
      </button>

      {/* Sidebar Toggle */}
      <button
        onClick={toggleSidebar}
        className={`h-10 shrink-0 rounded-xl px-2 glass-panel flex items-center justify-center gap-1 transition-all hover:scale-105 active:scale-95 shadow-xl ${showSidebar ? (isDarkMode ? 'text-indigo-400 bg-slate-800' : 'text-indigo-600 bg-white') : panelStyle}`}
        title="Toggle Analysis Panel"
        aria-label={showSidebar ? "Close simulation inspector" : "Open simulation inspector"}
      >
        <PanelRight className="w-4 h-4" />
        <span className="text-[10px]">Inspector</span>
      </button>
    </div>
  );
}
