/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Compass,
  Grid,
  Layers,
  LayoutGrid,
  Maximize2,
  MousePointer,
  Ruler,
  ShieldAlert,
  Sliders
} from 'lucide-react';
import React, { useState } from 'react';

interface PlanWorkspaceProps {
  isDarkMode: boolean;
}

export function PlanWorkspace({ isDarkMode }: PlanWorkspaceProps) {
  const [showSafetyZone, setShowSafetyZone] = useState(true);
  const [showReachEnvelope, setShowReachEnvelope] = useState(true);
  const [showConveyor, setShowConveyor] = useState(true);

  const panelBg = isDarkMode ? 'bg-slate-900/80 border-white/10 text-slate-100' : 'bg-white/80 border-slate-200 text-slate-800';
  const cardBg = isDarkMode ? 'bg-slate-950/60 border-white/5' : 'bg-slate-50/80 border-slate-200';

  return (
    <div className="w-full h-full flex flex-col min-[880px]:flex-row gap-4 p-4 min-[880px]:p-6 overflow-y-auto">
      {/* 2D Architectural & Workcell Safety Floorplan View */}
      <div className={`flex-1 flex flex-col rounded-2xl border p-4 shadow-xl ${panelBg} min-h-[480px]`}>
        <div className="flex items-center justify-between pb-3 border-b border-inherit mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-sm">
              <LayoutGrid className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold leading-tight">2D Workcell & Floorplan CAD</h2>
              <p className="text-[10px] text-slate-400">Safety Envelope & Fixture Coordinate Layout</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-slate-400">Grid: 100mm/div</span>
            <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono font-semibold">1:20 Scale</span>
          </div>
        </div>

        {/* 2D Workcell Plan Stage */}
        <div className="flex-1 rounded-xl bg-slate-950 border border-white/10 relative overflow-hidden flex items-center justify-center p-6 min-h-[340px]">
          {/* Technical Blueprint Grid */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#334155_1px,transparent_1px),linear-gradient(to_bottom,#334155_1px,transparent_1px)] bg-[size:20px_20px] opacity-25" />

          <div className="relative z-10 w-80 h-80 rounded-2xl border-2 border-dashed border-slate-600 flex items-center justify-center p-4">
            {/* Safety Zone Perimeter */}
            {showSafetyZone && (
              <div className="absolute inset-2 rounded-xl border-2 border-amber-500/60 bg-amber-500/5 flex items-start justify-end p-2 pointer-events-none animate-pulse">
                <span className="text-[9px] font-mono text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" /> ISO 10218-1 Safety Barrier
                </span>
              </div>
            )}

            {/* Robot Max Reach Envelope (855mm radius) */}
            {showReachEnvelope && (
              <div className="w-56 h-56 rounded-full border-2 border-indigo-500/70 bg-indigo-500/10 flex items-center justify-center pointer-events-none">
                <span className="text-[8px] font-mono text-indigo-400 uppercase tracking-tight">Franka Reach R855mm</span>
              </div>
            )}

            {/* Franka Robot Pedestal Base (Center) */}
            <div className="absolute w-10 h-10 rounded-full bg-indigo-600 border-2 border-white shadow-lg flex items-center justify-center text-white text-[9px] font-bold">
              ARM
            </div>

            {/* Stacking Tray Target */}
            <div className="absolute top-10 right-14 w-14 h-14 rounded-lg bg-slate-800 border border-slate-500 flex items-center justify-center text-[8px] font-mono text-slate-300">
              Stack Tray
            </div>

            {/* Pick Zone */}
            <div className="absolute bottom-10 left-12 w-20 h-16 rounded-lg border border-emerald-500/80 bg-emerald-500/10 flex items-center justify-center text-[8px] font-mono text-emerald-400">
              Pick Area (x20)
            </div>
          </div>
        </div>
      </div>

      {/* Side Layer Controls */}
      <div className={`w-full min-[880px]:w-[340px] flex flex-col rounded-2xl border p-4 shadow-xl ${panelBg} shrink-0 space-y-3`}>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-indigo-400" />
          Plan Layer Visibility
        </h3>

        <div className="space-y-2">
          <label className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer ${cardBg}`}>
            <span className="text-xs font-semibold">ISO Safety Perimeter Fence</span>
            <input
              type="checkbox"
              checked={showSafetyZone}
              onChange={e => setShowSafetyZone(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
            />
          </label>

          <label className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer ${cardBg}`}>
            <span className="text-xs font-semibold">Robot 855mm Kinematic Reach</span>
            <input
              type="checkbox"
              checked={showReachEnvelope}
              onChange={e => setShowReachEnvelope(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
            />
          </label>

          <label className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer ${cardBg}`}>
            <span className="text-xs font-semibold">Infeed Conveyor & Pick Zone</span>
            <input
              type="checkbox"
              checked={showConveyor}
              onChange={e => setShowConveyor(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
