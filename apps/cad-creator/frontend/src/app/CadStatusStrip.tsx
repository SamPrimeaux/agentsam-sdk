/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ChevronUp,
  Circle,
  Cpu,
  Layers,
  Terminal,
  X
} from 'lucide-react';
import {
  DEFAULT_RUNTIME_CAPABILITIES,
  RuntimeCapabilityStatus,
  WorkspaceDescriptor
} from './workspaceRegistry';

export interface CadStatusStripProps {
  workspace: WorkspaceDescriptor;
  activeTool: string;
  unit: string;
  selectionCount: number;
  jobStatus?: string;
  isSynced: boolean;
  isDarkMode: boolean;
  capabilities?: RuntimeCapabilityStatus[];
}

export function CadStatusStrip({
  workspace,
  activeTool,
  unit,
  selectionCount,
  jobStatus = 'Ready',
  isSynced,
  isDarkMode,
  capabilities = DEFAULT_RUNTIME_CAPABILITIES
}: CadStatusStripProps) {
  const [selectedCapability, setSelectedCapability] = useState<RuntimeCapabilityStatus | null>(null);

  const bg = isDarkMode
    ? 'bg-slate-950/90 border-white/10 text-slate-300'
    : 'bg-white/90 border-slate-200 text-slate-700';

  return (
    <>
      <footer
        id="cad-creator-status-strip"
        className={`h-7 px-3 border-t text-[11px] font-mono flex items-center justify-between select-none z-30 shrink-0 backdrop-blur-md ${bg}`}
      >
        {/* Left: Active Workspace + Contextual Engineering State */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-semibold text-slate-200">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="uppercase text-[10px] tracking-wider text-indigo-400 font-bold">
              {workspace.shortName}
            </span>
          </div>

          <span className="text-slate-600">|</span>

          <span className="text-slate-400 hidden sm:inline">
            Tool: <strong className="text-slate-200 uppercase">{activeTool}</strong>
          </span>

          <span className="text-slate-600 hidden sm:inline">|</span>

          <span className="text-slate-400">
            Units: <strong className="text-slate-200">{unit.toUpperCase()}</strong>
          </span>

          {selectionCount > 0 && (
            <>
              <span className="text-slate-600">|</span>
              <span className="text-indigo-400 font-semibold">
                {selectionCount} Selected
              </span>
            </>
          )}

          <span className="text-slate-600 hidden md:inline">|</span>

          <span className="text-slate-400 hidden md:inline">
            Job: <span className="text-emerald-400">{jobStatus}</span>
          </span>
        </div>

        {/* Right: Real Runtime Capability Indicators */}
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar">
          {capabilities.map((cap) => {
            const isReady = cap.status === 'ready' || cap.status === 'connected';
            const colorClass =
              cap.status === 'ready'
                ? 'text-emerald-400'
                : cap.status === 'connected'
                ? 'text-indigo-400'
                : cap.status === 'not_connected'
                ? 'text-slate-500'
                : 'text-rose-400';

            return (
              <button
                key={cap.id}
                type="button"
                onClick={() => setSelectedCapability(cap)}
                className={`px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 transition-colors hover:bg-white/10 ${colorClass}`}
                title={`Click for ${cap.name} runtime provenance`}
              >
                <span>{cap.status === 'not_connected' ? '○' : '●'}</span>
                <span className="font-semibold">{cap.name}</span>
                {cap.version && <span className="text-[9px] text-slate-400 opacity-80">{cap.version}</span>}
              </button>
            );
          })}

          <span className="text-slate-600">|</span>

          <div className="flex items-center gap-1 text-[10px] text-slate-400">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isSynced ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span>{isSynced ? 'Synced' : 'Offline'}</span>
          </div>
        </div>
      </footer>

      {/* Runtime Capability Provenance Modal / Inspector */}
      {selectedCapability && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setSelectedCapability(null)}
        >
          <div
            className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl font-mono text-xs ${
              isDarkMode ? 'bg-slate-900 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-inherit">
              <div className="flex items-center gap-2">
                <Cpu className="size-4 text-indigo-400" />
                <h3 className="font-bold text-sm tracking-tight">{selectedCapability.name} Runtime</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCapability(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-slate-200"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="py-4 space-y-2.5">
              <div className="flex justify-between py-1 border-b border-inherit/40">
                <span className="text-slate-400">Status</span>
                <span className="font-bold uppercase text-emerald-400">{selectedCapability.status}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-inherit/40">
                <span className="text-slate-400">Available</span>
                <span className="font-bold">{selectedCapability.available ? 'Yes' : 'No'}</span>
              </div>
              {selectedCapability.version && (
                <div className="flex justify-between py-1 border-b border-inherit/40">
                  <span className="text-slate-400">Version</span>
                  <span className="font-bold text-slate-200">{selectedCapability.version}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-inherit/40">
                <span className="text-slate-400">Execution Lane</span>
                <span className="font-bold text-indigo-400">{selectedCapability.lane}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-inherit/40">
                <span className="text-slate-400">Source</span>
                <span className="font-bold text-slate-300">{selectedCapability.source}</span>
              </div>
              {selectedCapability.binary && (
                <div className="flex justify-between py-1 border-b border-inherit/40">
                  <span className="text-slate-400">Binary Path</span>
                  <span className="font-bold text-[11px] truncate max-w-[240px] text-slate-300" title={selectedCapability.binary}>
                    {selectedCapability.binary}
                  </span>
                </div>
              )}
              {selectedCapability.description && (
                <p className="text-[11px] text-slate-400 pt-2 leading-relaxed font-sans">
                  {selectedCapability.description}
                </p>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedCapability(null)}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
