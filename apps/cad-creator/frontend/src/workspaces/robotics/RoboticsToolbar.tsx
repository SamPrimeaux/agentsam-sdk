/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Activity, Camera, Moon, PanelRight, Pause, Play, RotateCcw, Sun, Wrench } from 'lucide-react';
import React from 'react';

interface RoboticsToolbarProps {
  isPaused: boolean;
  togglePause: () => void;
  onReset: () => void;
  showSidebar: boolean;
  toggleSidebar: () => void;
  showDiagnostics: boolean;
  toggleDiagnostics: () => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  onResetCamera?: () => void;
}

export function RoboticsToolbar({
  isPaused,
  togglePause,
  onReset,
  showSidebar,
  toggleSidebar,
  showDiagnostics,
  toggleDiagnostics,
  isDarkMode,
  toggleDarkMode,
  onResetCamera
}: RoboticsToolbarProps) {
  const panelStyle = isDarkMode
    ? 'bg-slate-900/80 border-white/10 text-slate-100'
    : 'bg-white/80 border-slate-200 text-slate-800 shadow-lg';
  const iconFill = isDarkMode ? 'fill-slate-100' : 'fill-slate-800';

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 min-[660px]:left-8 min-[660px]:translate-x-0 flex items-center gap-2.5 z-30">
      {/* Play/Pause Button */}
      <button
        onClick={togglePause}
        className={`w-12 h-12 rounded-2xl glass-panel flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-xl ${panelStyle}`}
        title={isPaused ? 'Resume Simulation' : 'Pause Simulation'}
      >
        {isPaused ? <Play className={`w-5 h-5 ${iconFill}`} /> : <Pause className={`w-5 h-5 ${iconFill}`} />}
      </button>

      {/* Reset Simulation */}
      <button
        onClick={onReset}
        className={`w-12 h-12 rounded-2xl glass-panel flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-xl ${panelStyle}`}
        title="Reset Simulation & Randomize Objects"
      >
        <RotateCcw className="w-5 h-5" />
      </button>

      {/* Reset Camera View */}
      {onResetCamera && (
        <button
          onClick={onResetCamera}
          className={`w-12 h-12 rounded-2xl glass-panel flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-xl ${panelStyle}`}
          title="Reset Camera Framing"
        >
          <Camera className="w-5 h-5" />
        </button>
      )}

      {/* Diagnostic Overlay HUD Toggle */}
      <button
        onClick={toggleDiagnostics}
        className={`w-12 h-12 rounded-2xl glass-panel flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-xl ${
          showDiagnostics
            ? isDarkMode
              ? 'text-amber-400 bg-slate-800 border-amber-400/40'
              : 'text-amber-600 bg-amber-50 border-amber-300'
            : panelStyle
        }`}
        title="Toggle Real-Time Diagnostics HUD (Shortcut: D)"
      >
        <Activity className="w-5 h-5" />
      </button>

      {/* Dark Mode Toggle */}
      <button
        onClick={toggleDarkMode}
        className={`w-12 h-12 rounded-2xl glass-panel flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-xl ${panelStyle}`}
        title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>

      {/* Embodied Reasoning Sidebar Toggle */}
      <button
        onClick={toggleSidebar}
        className={`w-12 h-12 rounded-2xl glass-panel flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-xl ${
          showSidebar
            ? isDarkMode
              ? 'text-indigo-400 bg-slate-800'
              : 'text-indigo-600 bg-white'
            : panelStyle
        }`}
        title="Toggle Embodied Perception Panel"
      >
        <PanelRight className="w-5 h-5" />
      </button>
    </div>
  );
}
