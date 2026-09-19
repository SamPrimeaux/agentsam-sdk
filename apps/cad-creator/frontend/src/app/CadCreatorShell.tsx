/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Download,
  Moon,
  Redo2,
  Share2,
  Sparkles,
  Sun,
  Undo2,
  Activity
} from 'lucide-react';
import { preloadRoboticsWorkspace } from '../workspaces/robotics/lazy';
import {
  WORKSPACE_REGISTRY,
  WorkspaceDescriptor,
  WorkspaceId
} from './workspaceRegistry';

export interface CadCreatorShellProps {
  activeWorkspace: WorkspaceId;
  onSelectWorkspace: (id: WorkspaceId) => void;
  projectName: string;
  isSynced: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onExport: () => void;
  presentation?: 'standalone' | 'embedded';
  showDiagnostics?: boolean;
  onToggleDiagnostics?: () => void;
}

export function CadCreatorShell({
  activeWorkspace,
  onSelectWorkspace,
  projectName,
  isSynced,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isDarkMode,
  onToggleDarkMode,
  isSidebarOpen,
  onToggleSidebar,
  onExport,
  presentation = 'standalone',
  showDiagnostics,
  onToggleDiagnostics
}: CadCreatorShellProps) {
  const headerBg = isDarkMode
    ? 'bg-slate-950/90 border-white/10 text-slate-100 backdrop-blur-xl'
    : 'bg-white/90 border-slate-200 text-slate-800 backdrop-blur-xl';

  return (
    <header
      id="cad-creator-header"
      className={`h-13 px-3 sm:px-4 border-b flex items-center justify-between z-30 shrink-0 select-none ${headerBg}`}
    >
      {/* 1. Left: Brand & Project Name */}
      <div className="flex items-center gap-3">
        {presentation === 'standalone' && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 p-0.5 shadow-md flex items-center justify-center overflow-hidden">
              <span className="text-white font-bold text-xs tracking-tighter">AS</span>
            </div>
            <div className="hidden sm:block">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold tracking-tight">AgentSam CAD</span>
                <span className="text-[9px] font-mono px-1 py-0.2 rounded font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  CREATOR
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 pl-1 sm:border-l border-inherit/40 sm:pl-3">
          <span className="text-xs font-semibold truncate max-w-[120px] sm:max-w-[180px]">
            {projectName}
          </span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isSynced ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
            title={isSynced ? 'Synced' : 'Syncing...'}
          />
        </div>
      </div>

      {/* 2. Center: Five Canonical Workspaces */}
      <nav className="flex items-center gap-1 overflow-x-auto custom-scrollbar px-2">
        {WORKSPACE_REGISTRY.map((ws) => {
          const Icon = ws.icon;
          const isActive = activeWorkspace === ws.id;

          return (
            <button
              key={ws.id}
              type="button"
              onClick={() => onSelectWorkspace(ws.id)}
              onMouseEnter={() => {
                if (ws.id === 'robotics') {
                  void preloadRoboticsWorkspace();
                }
              }}
              onFocus={() => {
                if (ws.id === 'robotics') {
                  void preloadRoboticsWorkspace();
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 ${
                isActive
                  ? isDarkMode
                    ? 'bg-white/10 text-indigo-400 shadow-sm border border-white/10'
                    : 'bg-indigo-50 text-indigo-600 border border-indigo-200 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
              title={ws.description}
            >
              <Icon className="size-3.5" />
              <span>{ws.shortName}</span>
              {ws.badge && (
                <span
                  className={`text-[8px] font-mono px-1 py-0.2 rounded font-bold uppercase hidden md:inline-block ${
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

      {/* 3. Right: Undo/Redo, AgentSam Assistant Toggle, Export, Theme */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <div className="flex items-center gap-0.5 border-r border-inherit/40 pr-1.5 sm:pr-2">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="size-3.5" />
          </button>
        </div>

        {/* Diagnostic Toggle when in robotics */}
        {activeWorkspace === 'robotics' && onToggleDiagnostics && (
          <button
            type="button"
            onClick={onToggleDiagnostics}
            className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
              showDiagnostics
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
            title="Toggle Diagnostics HUD"
          >
            <Activity className="size-3.5" />
            <span className="hidden lg:inline text-[10px]">HUD</span>
          </button>
        )}

        {/* AgentSam Co-pilot Toggle */}
        <button
          type="button"
          onClick={onToggleSidebar}
          className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
            isSidebarOpen
              ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-sm shadow-indigo-500/20'
              : 'text-slate-300 hover:text-white hover:bg-white/10 border border-inherit/40'
          }`}
          title="Toggle AgentSam Assistant"
        >
          <Sparkles className="size-3.5" />
          <span className="hidden sm:inline">AgentSam</span>
        </button>

        {/* Export / Share */}
        <button
          type="button"
          onClick={onExport}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
          title="Export / Publish"
        >
          <Share2 className="size-3.5" />
        </button>

        {/* Dark Mode Toggle */}
        {presentation === 'standalone' && (
          <button
            type="button"
            onClick={onToggleDarkMode}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
            title={isDarkMode ? 'Light Mode' : 'Dark Mode'}
          >
            {isDarkMode ? <Sun className="size-3.5 text-amber-400" /> : <Moon className="size-3.5" />}
          </button>
        )}
      </div>
    </header>
  );
}
