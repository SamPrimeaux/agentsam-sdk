/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Box,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
  Move,
  Maximize2,
  Ruler,
  Sliders
} from 'lucide-react';
import React, { useState } from 'react';

interface ModelWorkspaceProps {
  isDarkMode: boolean;
}

interface AssemblyPart {
  id: string;
  name: string;
  category: 'robot' | 'end_effector' | 'fixture' | 'target' | 'sensor';
  visible: boolean;
  material: string;
  massKg: number;
}

export function ModelWorkspace({ isDarkMode }: ModelWorkspaceProps) {
  const [explodedView, setExplodedView] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [parts, setParts] = useState<AssemblyPart[]>([
    { id: '1', name: 'Franka Base Pedestal', category: 'robot', visible: true, material: 'Cast Iron A48', massKg: 14.5 },
    { id: '2', name: 'Franka Arm 7-DOF Kinematic Chain', category: 'robot', visible: true, material: 'Anodized 6061-T6 Aluminum', massKg: 18.0 },
    { id: '3', name: 'Panda Hand Gripper Body', category: 'end_effector', visible: true, material: 'Polymer / Aluminum', massKg: 0.8 },
    { id: '4', name: 'Parametric Finger Pads (OpenSCAD)', category: 'end_effector', visible: true, material: 'Silicone 50A / TPU', massKg: 0.12 },
    { id: '5', name: 'Optic Vision Sensor Bracket', category: 'sensor', visible: true, material: 'PETG Carbon', massKg: 0.08 },
    { id: '6', name: 'Sort & Stack Inspection Tray', category: 'fixture', visible: true, material: 'High-Density Polyethylene', massKg: 1.2 },
    { id: '7', name: 'RGB Manipulation Cubes (x20)', category: 'target', visible: true, material: 'Hardwood / Acrylic', massKg: 0.05 }
  ]);

  const toggleVisibility = (id: string) => {
    setParts(parts.map(p => p.id === id ? { ...p, visible: !p.visible } : p));
  };

  const panelBg = isDarkMode ? 'bg-slate-900/80 border-white/10 text-slate-100' : 'bg-white/80 border-slate-200 text-slate-800';
  const cardBg = isDarkMode ? 'bg-slate-950/60 border-white/5' : 'bg-slate-50/80 border-slate-200';

  return (
    <div className="w-full h-full flex flex-col min-[880px]:flex-row gap-4 p-4 min-[880px]:p-6 overflow-y-auto">
      {/* 3D Viewport Visualizer */}
      <div className={`flex-1 flex flex-col rounded-2xl border p-4 shadow-xl ${panelBg} min-h-[480px]`}>
        <div className="flex items-center justify-between pb-3 border-b border-inherit mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-sm">
              <Box className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold leading-tight">3D Spatial Assembly Studio</h2>
              <p className="text-[10px] text-slate-400">BIM & Multi-Body Kinematic Structure</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setExplodedView(!explodedView)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                explodedView ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white/5 border-inherit'
              }`}
            >
              Exploded View
            </button>
            <button
              onClick={() => setWireframe(!wireframe)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                wireframe ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white/5 border-inherit'
              }`}
            >
              Wireframe
            </button>
          </div>
        </div>

        {/* 3D Visualizer Canvas */}
        <div className="flex-1 rounded-xl bg-slate-950 border border-white/10 relative overflow-hidden flex items-center justify-center p-6 min-h-[320px]">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:2rem_2rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30" />

          {/* Graphical Assembly Representation */}
          <div className={`relative z-10 flex flex-col items-center transition-all duration-500 ${explodedView ? 'space-y-6 scale-90' : 'space-y-1'}`}>
            {/* End Effector */}
            <div className={`p-2.5 rounded-xl border border-emerald-400/40 bg-emerald-500/10 text-emerald-400 font-mono text-xs flex items-center gap-2 shadow-lg transition-all ${wireframe ? 'border-dashed' : ''}`}>
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Panda Hand + OpenSCAD Custom Grippers</span>
            </div>

            {/* Arm Joints */}
            <div className={`p-4 rounded-2xl border border-indigo-400/40 bg-indigo-500/10 text-indigo-300 font-mono text-xs flex items-center gap-3 shadow-xl transition-all ${wireframe ? 'border-dashed' : ''}`}>
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
              <span>7-DOF Franka Robotic Arm (Links 1-7)</span>
            </div>

            {/* Base & Table */}
            <div className={`p-3 rounded-xl border border-slate-500/40 bg-slate-800/40 text-slate-300 font-mono text-xs flex items-center gap-2 shadow-md transition-all ${wireframe ? 'border-dashed' : ''}`}>
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span>Heavy Rigidity Base Plate & Workcell Table</span>
            </div>
          </div>
        </div>
      </div>

      {/* Assembly Part Tree Hierarchy */}
      <div className={`w-full min-[880px]:w-[360px] flex flex-col rounded-2xl border p-4 shadow-xl ${panelBg} shrink-0`}>
        <div className="flex items-center justify-between pb-3 border-b border-inherit mb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Assembly Components</h3>
          </div>
          <span className="text-[10px] font-mono text-slate-400">{parts.length} bodies</span>
        </div>

        <div className="space-y-1.5 flex-1 overflow-y-auto custom-scrollbar">
          {parts.map(part => (
            <div
              key={part.id}
              className={`p-2.5 rounded-xl border flex items-center justify-between transition-all ${
                part.visible ? cardBg : 'opacity-40 border-dashed'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => toggleVisibility(part.id)}
                  className="p-1 rounded text-slate-400 hover:text-slate-200"
                >
                  {part.visible ? <Eye className="w-3.5 h-3.5 text-indigo-400" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <div className="truncate">
                  <h4 className="text-xs font-semibold truncate leading-tight">{part.name}</h4>
                  <p className="text-[9px] text-slate-400 font-mono">{part.material} · {part.massKg} kg</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
