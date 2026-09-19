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
  Flame,
  Gauge,
  Layers,
  Maximize2,
  Minimize2,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Wrench,
  X,
  Zap
} from 'lucide-react';
import React, { useState } from 'react';
import { SimulationProvider } from '../../lib/robotics/simulation/provider';
import { SimulationTelemetry, ToolIntegrationStatus } from '../../lib/robotics/runtime/types';
import { SparklineChart } from './SparklineChart';
import { SimulationStats, useSimulationStats } from './useSimulationStats';

export interface DiagnosticOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  providerRef?: React.RefObject<SimulationProvider | null> | React.MutableRefObject<SimulationProvider | null>;
  telemetry?: SimulationTelemetry | null;
  stats?: SimulationStats;
  isDarkMode: boolean;
  onOpenToolIntegration?: (toolId: 'blender' | 'openscad' | 'freecad' | 'meshy') => void;
  toolCapabilities?: Array<{
    id: string;
    name: string;
    status: 'ready' | 'connected' | 'not_connected' | 'unavailable';
    version?: string;
    lane?: string;
    description: string;
    supportedFormats: string[];
  }>;
}

const DEFAULT_TOOL_INTEGRATIONS: ToolIntegrationStatus[] = [
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

type SparklineMetric = 'fps' | 'collisions' | 'force' | 'velocity';

/**
 * DiagnosticOverlay component that subscribes to the useSimulationStats hook
 * to display a real-time HUD with frame rate, collision counters, kinematics,
 * and trend sparkline charts over the RoboticsWorkspace viewport.
 */
export function DiagnosticOverlay({
  isOpen,
  onClose,
  providerRef,
  telemetry: directTelemetry,
  stats: directStats,
  isDarkMode,
  onOpenToolIntegration,
  toolCapabilities
}: DiagnosticOverlayProps) {
  // Subscribe directly to the simulation stats hook when providerRef is supplied
  const hookStats = useSimulationStats(providerRef);
  const activeStats = directStats || (providerRef ? hookStats : null);

  const [activeTab, setActiveTab] = useState<'trends' | 'telemetry' | 'joints' | 'tools'>('trends');
  const [selectedSparklineMetric, setSelectedSparklineMetric] = useState<SparklineMetric>('fps');
  const [isMinimized, setIsMinimized] = useState(false);

  if (!isOpen) return null;

  const telemetry = activeStats?.telemetry || directTelemetry || null;
  const fps = activeStats?.fps ?? telemetry?.fps ?? 60;
  const collisionCount = activeStats?.collisionCount ?? telemetry?.collisionCount ?? 0;
  const robotContacts = activeStats?.robotContacts ?? telemetry?.robotContacts ?? 0;
  const environmentContacts = activeStats?.environmentContacts ?? telemetry?.environmentContacts ?? 0;
  const gripperForce = activeStats?.gripperForce ?? telemetry?.gripperForce ?? 0;
  const jointVelocities = activeStats?.jointVelocities ?? telemetry?.jointVelocities ?? [0, 0, 0, 0, 0, 0, 0];
  const maxVel = activeStats?.maxJointVelocity ?? telemetry?.maxJointVelocity ?? 0;
  const status = activeStats?.simulationStatus ?? telemetry?.simulationStatus ?? 'running';
  const stepRateHz = activeStats?.stepRateHz ?? telemetry?.stepRateHz ?? 500;
  const realTimeFactor = activeStats?.realTimeFactor ?? telemetry?.realTimeFactor ?? 1.0;

  // Time-series arrays for sparkline chart
  const fpsHistory = activeStats?.fpsHistory ?? [];
  const collisionHistory = activeStats?.collisionHistory ?? [];
  const forceHistory = activeStats?.forceHistory ?? [];
  const velHistory = activeStats?.velHistory ?? [];
  const metrics = activeStats?.metrics ?? {
    avgFps: Math.round(fps),
    minFps: Math.round(fps),
    maxFps: Math.round(fps),
    peakForce: gripperForce,
    peakVelocity: maxVel,
    totalCollisions: collisionCount,
    activeContacts: robotContacts + environmentContacts
  };

  const panelBg = isDarkMode
    ? 'bg-slate-900/90 border-white/10 text-slate-100 shadow-2xl backdrop-blur-2xl'
    : 'bg-white/90 border-slate-200 text-slate-800 shadow-2xl backdrop-blur-2xl';

  const cardBg = isDarkMode ? 'bg-slate-950/60 border-white/5' : 'bg-slate-50/80 border-slate-200/80';
  const badgeBg = isDarkMode
    ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
    : 'bg-indigo-50 text-indigo-600 border-indigo-200';

  const fpsColorClass =
    fps >= 55 ? 'text-emerald-400' : fps >= 30 ? 'text-amber-400' : 'text-rose-400';

  const toolsList = toolCapabilities || DEFAULT_TOOL_INTEGRATIONS;

  return (
    <div
      id="robotics-diagnostic-overlay"
      className={`fixed top-16 right-4 sm:right-6 z-40 w-88 sm:w-96 rounded-2xl border transition-all duration-200 ${panelBg} ${
        isMinimized ? 'h-14 overflow-hidden' : 'max-h-[85vh] flex flex-col'
      }`}
    >
      {/* Header Bar */}
      <div className="p-3.5 border-b border-inherit flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Activity className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold tracking-tight leading-tight">Simulation HUD</h3>
              <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border font-bold ${badgeBg}`}>
                {status.toUpperCase()}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">500 Hz Physics · MuJoCo WASM</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
            title={isMinimized ? 'Expand Diagnostic HUD' : 'Minimize Diagnostic HUD'}
          >
            {isMinimized ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
            title="Close Diagnostics (Shortcut: D)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Quick HUD Metrics Strip (Frame Rate & Collision Counters) */}
          <div className="p-3 border-b border-inherit grid grid-cols-3 gap-2 shrink-0">
            {/* FPS Counter */}
            <div className={`p-2.5 rounded-xl border flex flex-col justify-between ${cardBg}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-slate-400">Frame Rate</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    fps >= 55 ? 'bg-emerald-400 animate-pulse' : fps >= 30 ? 'bg-amber-400' : 'bg-rose-400'
                  }`}
                />
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className={`text-lg font-mono font-bold leading-none ${fpsColorClass}`}>
                  {fps.toFixed(0)}
                </span>
                <span className="text-[9px] font-mono text-slate-400">FPS</span>
              </div>
              <span className="text-[9px] font-mono text-slate-500 mt-1">Target: 60 FPS</span>
            </div>

            {/* Collision Counter */}
            <div className={`p-2.5 rounded-xl border flex flex-col justify-between ${cardBg}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-slate-400">Collisions</span>
                {collisionCount > 0 ? (
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-slate-500" />
                )}
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span
                  className={`text-lg font-mono font-bold leading-none ${
                    collisionCount > 0 ? 'text-rose-400' : 'text-slate-200'
                  }`}
                >
                  {collisionCount}
                </span>
                <span className="text-[9px] font-mono text-slate-400">pairs</span>
              </div>
              <span className="text-[9px] font-mono text-slate-500 mt-1">
                {robotContacts > 0 ? `${robotContacts} robot` : 'Clean contact'}
              </span>
            </div>

            {/* Physics Rate */}
            <div className={`p-2.5 rounded-xl border flex flex-col justify-between ${cardBg}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-slate-400">Physics Hz</span>
                <Zap className="w-2.5 h-2.5 text-amber-400" />
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-lg font-mono font-bold leading-none text-amber-400">
                  {stepRateHz}
                </span>
                <span className="text-[9px] font-mono text-slate-400">Hz</span>
              </div>
              <span className="text-[9px] font-mono text-slate-500 mt-1">
                {(realTimeFactor * 100).toFixed(0)}% RTF
              </span>
            </div>
          </div>

          {/* Navigation Sub-Tabs */}
          <div className="flex items-center px-4 pt-2 border-b border-inherit gap-1 shrink-0">
            <button
              onClick={() => setActiveTab('trends')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 ${
                activeTab === 'trends'
                  ? 'border-indigo-500 text-indigo-400 bg-white/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Trends & Sparklines</span>
            </button>
            <button
              onClick={() => setActiveTab('telemetry')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 ${
                activeTab === 'telemetry'
                  ? 'border-indigo-500 text-indigo-400 bg-white/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Gauge className="w-3.5 h-3.5" />
              <span>Telemetry</span>
            </button>
            <button
              onClick={() => setActiveTab('joints')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 ${
                activeTab === 'joints'
                  ? 'border-indigo-500 text-indigo-400 bg-white/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>7-DOF Joints</span>
            </button>
            <button
              onClick={() => setActiveTab('tools')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 ${
                activeTab === 'tools'
                  ? 'border-indigo-500 text-indigo-400 bg-white/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>CAD Pipeline</span>
            </button>
          </div>

          {/* Tab Contents */}
          <div className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-3">
            {/* 1. Trends & Sparklines Tab */}
            {activeTab === 'trends' && (
              <div className="space-y-3.5">
                {/* Metric Selector Pills */}
                <div className="flex items-center gap-1 p-1 rounded-xl bg-black/20 border border-inherit">
                  <button
                    onClick={() => setSelectedSparklineMetric('fps')}
                    className={`flex-1 py-1 text-[10px] font-semibold rounded-lg transition-all ${
                      selectedSparklineMetric === 'fps'
                        ? 'bg-emerald-500/20 text-emerald-400 shadow-sm border border-emerald-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    FPS Trend
                  </button>
                  <button
                    onClick={() => setSelectedSparklineMetric('collisions')}
                    className={`flex-1 py-1 text-[10px] font-semibold rounded-lg transition-all ${
                      selectedSparklineMetric === 'collisions'
                        ? 'bg-amber-500/20 text-amber-400 shadow-sm border border-amber-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Collisions
                  </button>
                  <button
                    onClick={() => setSelectedSparklineMetric('force')}
                    className={`flex-1 py-1 text-[10px] font-semibold rounded-lg transition-all ${
                      selectedSparklineMetric === 'force'
                        ? 'bg-indigo-500/20 text-indigo-400 shadow-sm border border-indigo-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Grip Force
                  </button>
                  <button
                    onClick={() => setSelectedSparklineMetric('velocity')}
                    className={`flex-1 py-1 text-[10px] font-semibold rounded-lg transition-all ${
                      selectedSparklineMetric === 'velocity'
                        ? 'bg-sky-500/20 text-sky-400 shadow-sm border border-sky-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Velocity
                  </button>
                </div>

                {/* Main Selected Sparkline Hero Card */}
                <div className={`p-3 rounded-xl border ${cardBg}`}>
                  {selectedSparklineMetric === 'fps' && (
                    <SparklineChart
                      data={fpsHistory.length > 0 ? fpsHistory : [58, 59, 60, 60, 59, 60]}
                      theme="emerald"
                      label="Frame Rate Trend (Last 40 Samples)"
                      unit="FPS"
                      targetRefValue={60}
                      targetRefLabel="60 FPS"
                      height={72}
                      minScale={20}
                      maxScale={65}
                    />
                  )}

                  {selectedSparklineMetric === 'collisions' && (
                    <SparklineChart
                      data={collisionHistory.length > 0 ? collisionHistory : [0, 0, 0, 1, 0, 0]}
                      theme="amber"
                      label="Collision & Contact Pair History"
                      unit="pairs"
                      height={72}
                      minScale={0}
                    />
                  )}

                  {selectedSparklineMetric === 'force' && (
                    <SparklineChart
                      data={forceHistory.length > 0 ? forceHistory : [0, 2.5, 6.0, 12.4, 12.5]}
                      theme="indigo"
                      label="Franka Gripper Clamping Force (N)"
                      unit="N"
                      height={72}
                      minScale={0}
                    />
                  )}

                  {selectedSparklineMetric === 'velocity' && (
                    <SparklineChart
                      data={velHistory.length > 0 ? velHistory : [0.1, 0.4, 0.8, 1.2, 0.5]}
                      theme="sky"
                      label="Maximum 7-DOF Joint Velocity"
                      unit="rad/s"
                      height={72}
                      minScale={0}
                    />
                  )}
                </div>

                {/* Aggregate Summary Stats */}
                <div className={`p-3 rounded-xl border ${cardBg} space-y-2`}>
                  <div className="flex justify-between items-center text-[11px] font-mono">
                    <span className="text-slate-400">Average Framerate:</span>
                    <span className="font-bold text-emerald-400">{metrics.avgFps} FPS</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-mono">
                    <span className="text-slate-400">FPS Range (Min/Max):</span>
                    <span className="font-bold text-slate-200">
                      {metrics.minFps} - {metrics.maxFps} FPS
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-mono">
                    <span className="text-slate-400">Peak Clamping Force:</span>
                    <span className="font-bold text-indigo-400">{metrics.peakForce.toFixed(1)} N</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-mono">
                    <span className="text-slate-400">Peak Joint Velocity:</span>
                    <span className="font-bold text-sky-400">{metrics.peakVelocity.toFixed(2)} rad/s</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-mono">
                    <span className="text-slate-400">Contact State:</span>
                    <span className="font-bold text-amber-400">
                      {metrics.activeContacts > 0 ? `${metrics.activeContacts} Active Contacts` : 'Unconstrained Motion'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Telemetry Tab */}
            {activeTab === 'telemetry' && (
              <div className="space-y-3">
                {/* TCP Pose & Kinematic Vector */}
                <div className={`p-3 rounded-xl border ${cardBg} space-y-1.5`}>
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>End-Effector Pose (TCP)</span>
                    <span className="font-mono text-[9px] text-indigo-400">Franka Hand</span>
                  </div>
                  {activeStats?.gizmoStats ? (
                    <div className="font-mono text-[11px] space-y-0.5 text-slate-200">
                      <div>{activeStats.gizmoStats.pos}</div>
                      <div className="text-slate-400">{activeStats.gizmoStats.rot}</div>
                    </div>
                  ) : (
                    <div className="font-mono text-[11px] text-slate-400">
                      X: {telemetry?.endEffectorPos?.x.toFixed(2) ?? '0.45'} Y:{' '}
                      {telemetry?.endEffectorPos?.y.toFixed(2) ?? '0.00'} Z:{' '}
                      {telemetry?.endEffectorPos?.z.toFixed(2) ?? '0.22'}
                    </div>
                  )}
                </div>

                {/* Gripper Actuator Status */}
                <div className={`p-3 rounded-xl border ${cardBg} space-y-2`}>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-medium">Gripper Force:</span>
                    <span className="font-mono font-bold text-indigo-400">{gripperForce.toFixed(2)} N</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full rounded-full transition-all duration-100"
                      style={{ width: `${Math.min(100, (gripperForce / 20) * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-400">
                    <span>Controller: {(activeStats?.gripperCtrl ?? 0.04) > 0.02 ? 'Open (0.04m)' : 'Closed'}</span>
                    <span>Max: 20 N</span>
                  </div>
                </div>

                {/* Contacts & Collisions Details */}
                <div className={`p-3 rounded-xl border ${cardBg} space-y-1.5 text-xs`}>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Robot-Object Contacts:</span>
                    <span className="font-mono font-bold text-slate-200">{robotContacts}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Environment Contacts:</span>
                    <span className="font-mono font-bold text-slate-200">{environmentContacts}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">End-Effector Speed:</span>
                    <span className="font-mono font-bold text-slate-200">
                      {(telemetry?.endEffectorVel ?? 0).toFixed(3)} m/s
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 3. 7-DOF Joint Dynamics Tab */}
            {activeTab === 'joints' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium px-1">
                  <span>Joint Actuator</span>
                  <span>Velocity (rad/s)</span>
                </div>
                {jointVelocities.map((vel, idx) => {
                  const absVel = Math.abs(vel);
                  const maxLimit = 2.175; // Franka Panda joint velocity limit
                  const percent = Math.min(100, (absVel / maxLimit) * 100);

                  return (
                    <div key={idx} className={`p-2 rounded-xl border ${cardBg} space-y-1 text-xs`}>
                      <div className="flex justify-between items-center font-mono text-[11px]">
                        <span className="text-slate-300">panda_joint{idx + 1}</span>
                        <span className={absVel > 1.5 ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                          {vel.toFixed(3)}
                        </span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-1 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-75 ${
                            absVel > 1.5 ? 'bg-rose-500' : absVel > 0.8 ? 'bg-amber-400' : 'bg-indigo-500'
                          }"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 4. CAD & AI Pipeline Tab */}
            {activeTab === 'tools' && (
              <div className="space-y-2.5">
                <div className="text-[10px] text-slate-400 font-medium px-1">
                  Connected CAD & Modeling Engines:
                </div>
                {toolsList.map(tool => {
                  const statusColors = {
                    ready: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                    connected: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
                    not_connected: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
                    unavailable: 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  };

                  return (
                    <div
                      key={tool.id}
                      className={`p-3 rounded-xl border flex flex-col justify-between transition-all hover:border-indigo-500/40 ${cardBg}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-200">{tool.name}</span>
                          <span className={`text-[9px] font-mono px-1 py-0.2 rounded border font-bold uppercase ${statusColors[tool.status as keyof typeof statusColors] || statusColors.ready}`}>
                            {tool.status}
                          </span>
                        </div>
                        {onOpenToolIntegration && (
                          <button
                            onClick={() => onOpenToolIntegration(tool.id as any)}
                            className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 underline"
                          >
                            Launch Workspace
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 leading-snug">{tool.description}</p>
                      <div className="flex gap-1 mt-2">
                        {tool.supportedFormats.map(fmt => (
                          <span
                            key={fmt}
                            className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-black/20 text-slate-400 border border-white/5"
                          >
                            {fmt}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
