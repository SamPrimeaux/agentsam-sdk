/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Activity,
  Box,
  ChevronRight,
  Cpu,
  Download,
  Flame,
  Layers,
  Moon,
  Sparkles,
  Sun,
  Wand2,
  Wrench
} from 'lucide-react';
import React from 'react';
import { WORKSPACE_REGISTRY, WorkspaceId } from './workspaceRegistry';

interface CadCreatorShellProps {
  activeWorkspace: WorkspaceId;
  onSelectWorkspace: (id: WorkspaceId) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  showDiagnostics: boolean;
  onToggleDiagnostics: () => void;
  onOpenCopilot: () => void;
}

export function CadCreatorShell({
  activeWorkspace,
  onSelectWorkspace,
  isDarkMode,
  onToggleDarkMode,
  showDiagnostics,
  onToggleDiagnostics,
  onOpenCopilot
}: CadCreatorShellProps) {
  const headerBg = isDarkMode
    ? 'bg-slate-950/80 border-white/10 text-slate-100 backdrop-blur-xl'
    : 'bg-white/80 border-slate-200 text-slate-800 backdrop-blur-xl';

  return (
    <header
      id="cad-creator-header"
      className={`h-14 px-4 min-[660px]:px-6 border-b flex items-center justify-between z-30 shrink-0 select-none ${headerBg}`}
    >
      {/* Brand Identity & Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 p-0.5 shadow-md flex items-center justify-center overflow-hidden">
            <img
              src="https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/2a047804-2626-4529-4324-f5a800f48500/avatar"
              alt="AgentSam Logo"
              className="w-full h-full object-cover rounded-[9px]"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-xs font-bold tracking-tight">AgentSam CAD Creator</h1>
              <span className="hidden sm:inline-block text-[9px] font-mono px-1.5 py-0.2 rounded font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                PROD
              </span>
            </div>
            <p className="text-[9px] text-slate-400 hidden min-[880px]:block">
              Parametric Solids · Physics Simulation · Generative AI
            </p>
          </div>
        </div>
      </div>

      {/* Primary Workspace Navigation Tabs */}
      <nav className="flex items-center gap-1 overflow-x-auto custom-scrollbar max-w-[50vw] sm:max-w-none px-1">
        {WORKSPACE_REGISTRY.map(ws => {
          const Icon = ws.icon;
          const isActive = activeWorkspace === ws.id;

          return (
            <button
              key={ws.id}
              onClick={() => onSelectWorkspace(ws.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 ${
                isActive
                  ? isDarkMode
                    ? 'bg-white/10 text-indigo-400 shadow-sm border border-white/10'
                    : 'bg-indigo-50 text-indigo-600 border border-indigo-200 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
              title={ws.description}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{ws.shortName}</span>
              {ws.badge && (
                <span
                  className={`text-[8px] font-mono px-1 py-0.2 rounded font-bold uppercase ${
                    isActive ? 'bg-indigo-500 text-white' : 'bg-slate-700/40 text-slate-400'
                  }`}
                >
                  {ws.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Global Actions Bar */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Diagnostic HUD Button */}
        <button
          onClick={onToggleDiagnostics}
          className={`p-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all ${
            showDiagnostics
              ? isDarkMode
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-amber-50 text-amber-600 border-amber-300'
              : 'border-inherit hover:bg-white/5 text-slate-400'
          }`}
          title="Toggle Simulation Diagnostics (Shortcut: D)"
        >
          <Activity className="w-4 h-4" />
          <span className="hidden min-[760px]:inline text-xs font-mono">500Hz HUD</span>
        </button>

        {/* Dark Mode Toggle */}
        <button
          onClick={onToggleDarkMode}
          className="p-2 rounded-xl border border-inherit text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-all"
          title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* AgentSam Copilot Drawer Trigger */}
        <button
          onClick={onOpenCopilot}
          className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-500 hover:from-indigo-500 hover:to-emerald-400 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95"
          title="Open AgentSam Physical Design Assistant"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">AgentSam</span>
        </button>
      </div>
    </header>
  );
}
