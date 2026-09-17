/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Cpu,
  Download,
  Gauge,
  Layers,
  Maximize2,
  Minimize2,
  RefreshCw,
  Sliders,
  Sparkles,
  Wrench,
  X,
  Zap
} from 'lucide-react';
import React, { useState } from 'react';
import { SimulationTelemetry, ToolIntegrationStatus } from '../../lib/robotics/runtime/types';
import { SimulationStats } from './useSimulationStats';

interface DiagnosticOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  telemetry?: SimulationTelemetry | null;
  stats?: SimulationStats;
  isDarkMode: boolean;
  onOpenToolIntegration?: (toolId: 'blender' | 'openscad' | 'freecad' | 'meshy') => void;
}

const TOOL_INTEGRATIONS: ToolIntegrationStatus[] = [
  {
    id: 'openscad',
    name: 'OpenSCAD',
    category: 'deterministic_cad',
    status: 'ready',
    description: 'Parametric CSG kernel for custom end-effectors, fixture plates, and mounting brackets.',
    supportedFormats: ['SCAD', 'STL', 'DXF', '3MF']
  },
  {
    id: 'blender',
    name: 'Blender 4.2',
    category: 'renderer',
    status: 'ready',
    description: 'Photorealistic PBR rendering, camera baking, and GLTF/GLB high-poly asset generation.',
    supportedFormats: ['BLEND', 'GLB', 'OBJ', 'PNG']
  },
  {
    id: 'freecad',
    name: 'FreeCAD / OpenCASCADE',
    category: 'solid_kernel',
    status: 'connected',
    description: 'Precision B-Rep solid boundary modeling with ISO 10303 STEP/IGES interchange.',
    supportedFormats: ['STEP', 'IGES', 'BREP', 'FCStd']
  },
  {
    id: 'meshy',
    name: 'Meshy Generative 3D',
    category: 'generative_ai',
    status: 'ready',
    description: 'AI-driven text/image-to-3D generation for custom manipulation targets and environment meshes.',
    supportedFormats: ['GLB', 'USDZ', 'FBX']
  }
];

export function DiagnosticOverlay({
  isOpen,
  onClose,
  telemetry: directTelemetry,
  stats,
  isDarkMode,
  onOpenToolIntegration
}: DiagnosticOverlayProps) {
  const [activeTab, setActiveTab] = useState<'telemetry' | 'joints' | 'tools'>('telemetry');
  const [isMinimized, setIsMinimized] = useState(false);

  if (!isOpen) return null;

  const telemetry = stats?.telemetry || directTelemetry || null;
  const fps = stats?.fps ?? telemetry?.fps ?? 60;
  const collisionCount = stats?.collisionCount ?? telemetry?.collisionCount ?? 0;
  const robotContacts = stats?.robotContacts ?? telemetry?.robotContacts ?? 0;
  const environmentContacts = stats?.environmentContacts ?? telemetry?.environmentContacts ?? 0;
  const gripperForce = stats?.gripperForce ?? telemetry?.gripperForce ?? 0;
  const jointVelocities = stats?.jointVelocities ?? telemetry?.jointVelocities ?? [0, 0, 0, 0, 0, 0, 0];
  const maxVel = stats?.maxJointVelocity ?? telemetry?.maxJointVelocity ?? 0;
  const status = stats?.simulationStatus ?? telemetry?.simulationStatus ?? 'running';
  const forceHistory = stats?.forceHistory ?? [];

  const panelBg = isDarkMode
    ? 'bg-slate-900/90 border-white/10 text-slate-100 shadow-2xl backdrop-blur-xl'
    : 'bg-white/90 border-slate-200 text-slate-800 shadow-2xl backdrop-blur-xl';

  const cardBg = isDarkMode ? 'bg-slate-950/60 border-white/5' : 'bg-slate-50/80 border-slate-200/80';
  const badgeBg = isDarkMode ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-indigo-50 text-indigo-600 border-indigo-200';

  return (
    <div
      id="robotics-diagnostic-overlay"
      className={`fixed top-20 right-4 min-[660px]:right-8 z-40 w-96 rounded-2xl border transition-all duration-200 ${panelBg} ${
        isMinimized ? 'h-14 overflow-hidden' : 'max-h-[85vh] flex flex-col'
      }`}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-inherit shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
            <Activity className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h3 className="text-xs font-bold tracking-tight leading-tight flex items-center gap-2">
              Simulation Diagnostics
              <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border font-semibold ${badgeBg}`}>
                {status.toUpperCase()}
              </span>
            </h3>
            <p className="text-[10px] text-slate-400 font-mono">500 Hz Physics · MuJoCo WASM</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
            title={isMinimized ? "Expand Diagnostic HUD" : "Minimize Diagnostic HUD"}
          >
            {isMinimized ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
            title="Close Diagnostics (Shortcut: D)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Navigation Tabs */}
          <div className="flex px-3 pt-2.5 gap-1 shrink-0">
            {[
              { id: 'telemetry', label: 'Telemetry', icon: Gauge },
              { id: 'joints', label: '7-DOF Joints', icon: Sliders },
              { id: 'tools', label: 'CAD & AI Tools', icon: Wrench }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    isActive
                      ? isDarkMode
                        ? 'bg-white/10 text-indigo-400 font-bold shadow-sm'
                        : 'bg-white text-indigo-600 shadow-sm border border-slate-200'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Body */}
          <div className="p-3.5 space-y-3 overflow-y-auto custom-scrollbar flex-1 text-xs">
            {/* TAB 1: CORE TELEMETRY */}
            {activeTab === 'telemetry' && (
              <div className="space-y-3 animate-in fade-in duration-150">
                {/* 1. Real-time Frame Rate & Collision Stat Banner */}
                <div className="grid grid-cols-2 gap-2">
                  <div className={`p-3 rounded-xl border ${cardBg}`}>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Render Framerate
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-mono font-bold text-emerald-400">{fps}</span>
                      <span className="text-[10px] text-slate-400 font-mono">FPS</span>
                    </div>
                    <span className="text-[9px] text-slate-500 block mt-0.5">Physics: {stats?.stepRateHz ?? telemetry?.stepRateHz ?? 500} Hz</span>
                  </div>

                  <div className={`p-3 rounded-xl border ${cardBg}`}>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Active Collisions
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-lg font-mono font-bold ${collisionCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                        {collisionCount}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">pairs</span>
                    </div>
                    <span className="text-[9px] text-slate-500 block mt-0.5">Robot contacts: {robotContacts}</span>
                  </div>
                </div>

                {/* 2. Gripper Force Stat */}
                <div className={`p-3 rounded-xl border ${cardBg}`}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      Gripper Clamping Force
                    </span>
                    <span className="text-sm font-mono font-bold text-amber-500">{gripperForce} N</span>
                  </div>
                  {/* Visual Force Gauge */}
                  <div className="w-full bg-slate-700/30 rounded-full h-2 overflow-hidden mb-2">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-red-500 transition-all duration-75 rounded-full"
                      style={{ width: `${Math.min(100, (gripperForce / 60) * 100)}%` }}
                    />
                  </div>
                  {/* Mini Sparkline */}
                  {forceHistory.length > 0 && (
                    <div className="flex items-end gap-1 h-6 pt-1">
                      {forceHistory.map((val, idx) => (
                        <div
                          key={idx}
                          className="flex-1 bg-amber-500/40 hover:bg-amber-400 rounded-t-sm transition-all"
                          style={{ height: `${Math.max(10, Math.min(100, (val / 60) * 100))}%` }}
                          title={`${val} N`}
                        />
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between text-[9px] font-mono text-slate-400 mt-1">
                    <span>Actuator: Franka Hand</span>
                    <span>Max Rated: 140 N</span>
                  </div>
                </div>

                {/* 3. Detailed Contacts & Collisions */}
                <div className={`p-3 rounded-xl border ${cardBg}`}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className={`w-3.5 h-3.5 ${collisionCount > 0 ? 'text-emerald-500' : 'text-slate-400'}`} />
                      Contact Pairs Breakdown
                    </span>
                    <span className="text-xs font-mono font-semibold">{collisionCount} active</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-1 border-t border-inherit">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-slate-400">Robot-Object Contacts</span>
                      <span className="text-xs font-mono font-semibold text-indigo-400">{robotContacts} active</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] text-slate-400">Environment/Floor</span>
                      <span className="text-xs font-mono font-semibold">{environmentContacts} contacts</span>
                    </div>
                  </div>
                </div>

                {/* 4. Real-time Kinematics & Loop Health */}
                <div className={`p-3 rounded-xl border ${cardBg} space-y-2`}>
                  <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    <span>TCP Spatial Coordinates</span>
                    <span className="font-mono text-indigo-400">{fps} FPS · 500 Hz</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[10px]">
                    <div className="p-2 rounded-lg bg-black/10 border border-inherit">
                      <span className="text-slate-400 block text-[9px]">TCP Pos X/Y/Z</span>
                      <span className="font-bold truncate">
                        {telemetry?.endEffectorPos ? `${telemetry.endEffectorPos.x}, ${telemetry.endEffectorPos.y}, ${telemetry.endEffectorPos.z}` : '0, 0, 0'}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-black/10 border border-inherit">
                      <span className="text-slate-400 block text-[9px]">Linear Vel</span>
                      <span className="font-bold">{telemetry?.endEffectorVel ?? 0} m/s</span>
                    </div>
                    <div className="p-2 rounded-lg bg-black/10 border border-inherit">
                      <span className="text-slate-400 block text-[9px]">Sim Time</span>
                      <span className="font-bold">{telemetry?.simTime ?? 0}s</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: 7-DOF JOINT VELOCITIES */}
            {activeTab === 'joints' && (
              <div className="space-y-2.5 animate-in fade-in duration-150">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <span>Franka Panda Joint Velocities</span>
                  <span className="font-mono text-indigo-400">Max: {maxVel} rad/s</span>
                </div>

                <div className="space-y-2">
                  {jointVelocities.map((vel, idx) => {
                    const absVel = Math.abs(vel);
                    const pct = Math.min(100, (absVel / 2.5) * 100);
                    return (
                      <div key={idx} className={`p-2 rounded-lg border ${cardBg}`}>
                        <div className="flex justify-between text-[10px] font-mono mb-1">
                          <span className="text-slate-400">Joint {idx + 1} (panda_joint{idx + 1})</span>
                          <span className={`font-bold ${absVel > 1.5 ? 'text-amber-400' : 'text-slate-200'}`}>
                            {vel.toFixed(3)} rad/s
                          </span>
                        </div>
                        <div className="w-full bg-slate-700/30 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-75 ${
                              absVel > 1.5 ? 'bg-amber-400' : 'bg-indigo-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: CAD & AI TOOLS */}
            {activeTab === 'tools' && (
              <div className="space-y-2.5 animate-in fade-in duration-150">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <span>Connected Engineering Pipelines</span>
                  <span className="text-emerald-400 font-mono">4 Systems Online</span>
                </div>

                <div className="space-y-2">
                  {TOOL_INTEGRATIONS.map(tool => (
                    <div
                      key={tool.id}
                      className={`p-2.5 rounded-xl border ${cardBg} hover:border-indigo-500/30 transition-all flex flex-col gap-1.5`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5 font-bold">
                          <span>{tool.name}</span>
                          <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
                            {tool.status}
                          </span>
                        </div>
                        {onOpenToolIntegration && (
                          <button
                            onClick={() => onOpenToolIntegration(tool.id as 'blender' | 'openscad' | 'freecad' | 'meshy')}
                            className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500 hover:text-white transition-colors text-[9px] font-semibold"
                          >
                            Launch →
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 leading-snug">{tool.description}</p>
                      <div className="flex gap-1 mt-0.5">
                        {tool.supportedFormats.map(fmt => (
                          <span
                            key={fmt}
                            className="text-[8px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400"
                          >
                            {fmt}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
