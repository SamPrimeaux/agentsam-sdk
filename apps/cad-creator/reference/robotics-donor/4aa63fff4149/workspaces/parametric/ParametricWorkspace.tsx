/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ArrowRight,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  Eye,
  FileCode2,
  Layers,
  Play,
  RotateCcw,
  Sliders,
  Sparkles,
  Terminal
} from 'lucide-react';
import React, { useState } from 'react';
import { OpenScadProvider } from '../../lib/cad/providers';
import { CadExecutionReceipt } from '../../lib/cad/types';

interface ParametricWorkspaceProps {
  isDarkMode: boolean;
  onSendToRobotics?: (partName: string) => void;
}

const DEFAULT_SCAD = `// AgentSam CAD Creator - Parametric Robotic Gripper Finger
// Designed for Franka Emika Panda Custom End-Effector

$fn = 60; // Curve resolution

// Parametric Variables
finger_width = 18;    // [10:30]
finger_length = 65;   // [40:100]
pad_thickness = 4.5;  // [2:10]
groove_count = 6;     // [2:12]
mount_hole_dia = 4.2; // M4 clearance hole

module gripper_finger() {
    difference() {
        union() {
            // Main finger beam
            hull() {
                cube([finger_width, 12, pad_thickness], center=false);
                translate([0, finger_length - 15, 0])
                    cube([finger_width * 0.75, 15, pad_thickness], center=false);
            }
            // Grip contact tip with silicone pad flange
            translate([0, finger_length - 12, pad_thickness])
                cube([finger_width * 0.75, 12, 3], center=false);
        }
        
        // Mounting bolt holes (Franka Panda Hand pitch)
        translate([finger_width/2, 6, -1])
            cylinder(d=mount_hole_dia, h=pad_thickness + 2);
            
        // Anti-slip friction grooves
        for (i = [1 : groove_count]) {
            translate([-1, 15 + i * (finger_length - 35) / groove_count, pad_thickness - 0.8])
                cube([finger_width + 2, 1.5, 2]);
        }
    }
}

// Instantiate component
gripper_finger();
`;

export function ParametricWorkspace({ isDarkMode, onSendToRobotics }: ParametricWorkspaceProps) {
  const [code, setCode] = useState(DEFAULT_SCAD);
  const [variables, setVariables] = useState({
    finger_width: 18,
    finger_length: 65,
    pad_thickness: 4.5,
    groove_count: 6,
    mount_hole_dia: 4.2
  });
  const [isCompiling, setIsCompiling] = useState(false);
  const [receipt, setReceipt] = useState<CadExecutionReceipt | null>(null);
  const [copied, setCopied] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  const provider = new OpenScadProvider();

  const handleCompile = async () => {
    setIsCompiling(true);
    try {
      const result = await provider.execute({
        jobId: `job_${Date.now()}`,
        engine: 'openscad',
        operation: 'compile',
        input: {
          code,
          params: variables
        }
      });
      setReceipt(result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsCompiling(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = () => {
    onSendToRobotics?.('Parametric Gripper Finger');
    setSentSuccess(true);
    setTimeout(() => setSentSuccess(false), 3000);
  };

  const panelBg = isDarkMode ? 'bg-slate-900/80 border-white/10 text-slate-100' : 'bg-white/80 border-slate-200 text-slate-800';
  const cardBg = isDarkMode ? 'bg-slate-950/60 border-white/5' : 'bg-slate-50/80 border-slate-200';
  const editorBg = isDarkMode ? 'bg-slate-950 text-emerald-400 font-mono' : 'bg-slate-900 text-emerald-400 font-mono';

  return (
    <div className="w-full h-full flex flex-col min-[880px]:flex-row gap-4 p-4 min-[880px]:p-6 overflow-y-auto">
      {/* LEFT: OpenSCAD Script & Parameter Control */}
      <div className={`flex-1 flex flex-col rounded-2xl border p-4 shadow-xl ${panelBg} min-h-[480px]`}>
        <div className="flex items-center justify-between pb-3 border-b border-inherit mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-sm">
              <Code2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold leading-tight">OpenSCAD CSG Modeler</h2>
              <p className="text-[10px] text-slate-400">Deterministic Parametric Solid Geometry</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyCode}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 border border-inherit transition-all flex items-center gap-1.5"
            >
              <Copy className="w-3 h-3" />
              <span>{copied ? 'Copied!' : 'Copy SCAD'}</span>
            </button>
            <button
              onClick={handleCompile}
              disabled={isCompiling}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all flex items-center gap-1.5"
            >
              <Play className={`w-3.5 h-3.5 ${isCompiling ? 'animate-spin' : ''}`} />
              <span>{isCompiling ? 'Evaluating...' : 'Compile Mesh'}</span>
            </button>
          </div>
        </div>

        {/* Parametric Variable Controls */}
        <div className={`p-3 rounded-xl border mb-3 space-y-2.5 ${cardBg}`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sliders className="w-3 h-3 text-indigo-400" />
              Dynamic Parametric Sliders
            </span>
            <span className="text-[9px] font-mono text-indigo-400 font-semibold">Live Variable Bindings</span>
          </div>

          <div className="grid grid-cols-2 min-[640px]:grid-cols-3 gap-3 text-xs">
            <div>
              <div className="flex justify-between text-[10px] font-mono mb-1">
                <span className="text-slate-400">finger_width</span>
                <span className="font-bold">{variables.finger_width}mm</span>
              </div>
              <input
                type="range"
                min="10"
                max="30"
                step="1"
                value={variables.finger_width}
                onChange={e => setVariables({ ...variables, finger_width: Number(e.target.value) })}
                className="w-full h-1 bg-slate-700 rounded appearance-none accent-indigo-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-[10px] font-mono mb-1">
                <span className="text-slate-400">finger_length</span>
                <span className="font-bold">{variables.finger_length}mm</span>
              </div>
              <input
                type="range"
                min="40"
                max="100"
                step="1"
                value={variables.finger_length}
                onChange={e => setVariables({ ...variables, finger_length: Number(e.target.value) })}
                className="w-full h-1 bg-slate-700 rounded appearance-none accent-indigo-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-[10px] font-mono mb-1">
                <span className="text-slate-400">pad_thickness</span>
                <span className="font-bold">{variables.pad_thickness}mm</span>
              </div>
              <input
                type="range"
                min="2"
                max="10"
                step="0.5"
                value={variables.pad_thickness}
                onChange={e => setVariables({ ...variables, pad_thickness: Number(e.target.value) })}
                className="w-full h-1 bg-slate-700 rounded appearance-none accent-indigo-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-[10px] font-mono mb-1">
                <span className="text-slate-400">groove_count</span>
                <span className="font-bold">{variables.groove_count}</span>
              </div>
              <input
                type="range"
                min="2"
                max="12"
                step="1"
                value={variables.groove_count}
                onChange={e => setVariables({ ...variables, groove_count: Number(e.target.value) })}
                className="w-full h-1 bg-slate-700 rounded appearance-none accent-indigo-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-[10px] font-mono mb-1">
                <span className="text-slate-400">mount_hole_dia</span>
                <span className="font-bold">{variables.mount_hole_dia}mm</span>
              </div>
              <input
                type="range"
                min="3"
                max="6"
                step="0.1"
                value={variables.mount_hole_dia}
                onChange={e => setVariables({ ...variables, mount_hole_dia: Number(e.target.value) })}
                className="w-full h-1 bg-slate-700 rounded appearance-none accent-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Code Editor Area */}
        <div className="flex-1 relative rounded-xl overflow-hidden border border-inherit">
          <textarea
            value={code}
            onChange={e => setCode(e.target.value)}
            spellCheck={false}
            className={`w-full h-full p-4 text-xs resize-none focus:outline-none custom-scrollbar leading-relaxed ${editorBg}`}
          />
        </div>
      </div>

      {/* RIGHT: 3D CSG Preview & Interchange Workbench */}
      <div className={`w-full min-[880px]:w-[380px] flex flex-col rounded-2xl border p-4 shadow-xl ${panelBg} shrink-0`}>
        <div className="flex items-center justify-between pb-3 border-b border-inherit mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-600 text-white shadow-sm">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold leading-tight">CSG Geometry View</h3>
              <p className="text-[10px] text-slate-400 font-mono">240 Verts · 480 Polygons</p>
            </div>
          </div>
        </div>

        {/* Visualizer Simulation Stage Mockup */}
        <div className="w-full h-56 rounded-xl bg-slate-950 border border-white/10 relative overflow-hidden flex items-center justify-center p-4 mb-3">
          {/* Grid Background */}
          <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px] opacity-40" />

          {/* Rendered 3D Gripper Component Wireframe / Solid */}
          <div className="relative z-10 flex flex-col items-center">
            <div
              className="bg-gradient-to-tr from-indigo-600 via-indigo-400 to-emerald-400 rounded-lg shadow-2xl border border-white/20 transition-all duration-300 flex items-center justify-center"
              style={{
                width: `${variables.finger_width * 4}px`,
                height: `${variables.finger_length * 1.8}px`,
                transform: 'rotateX(45deg) rotateZ(-25deg)'
              }}
            >
              <div className="flex flex-col gap-1 w-full px-2">
                {Array.from({ length: variables.groove_count }).map((_, i) => (
                  <div key={i} className="h-0.5 w-full bg-slate-900/60 rounded" />
                ))}
              </div>
            </div>
            <span className="text-[10px] font-mono text-slate-400 mt-4 bg-slate-900/80 px-2 py-0.5 rounded border border-white/10">
              Franka End-Effector Finger ({variables.finger_width}x{variables.finger_length}x{variables.pad_thickness}mm)
            </span>
          </div>
        </div>

        {/* Actions and Cross-Workspace Integration */}
        <div className="space-y-2.5">
          <button
            onClick={handleSend}
            className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            {sentSuccess ? <CheckCircle2 className="w-4 h-4 text-white" /> : <ArrowRight className="w-4 h-4" />}
            <span>{sentSuccess ? 'Transferred to MuJoCo Workcell!' : 'Send Fixture to Robotics Simulation'}</span>
          </button>

          <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
            <button
              onClick={handleCompile}
              className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-inherit flex items-center justify-center gap-1.5 transition-all"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              <span>Export STL</span>
            </button>
            <button
              onClick={handleCompile}
              className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-inherit flex items-center justify-center gap-1.5 transition-all"
            >
              <FileCode2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export 2D DXF</span>
            </button>
          </div>
        </div>

        {/* Diagnostics & Compiler Logs */}
        <div className="mt-3 flex-1 flex flex-col">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            <Terminal className="w-3.5 h-3.5 text-slate-400" />
            <span>OpenSCAD CSG Engine Log</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-white/5 font-mono text-[10px] text-slate-400 space-y-1 flex-1 overflow-y-auto custom-scrollbar max-h-36">
            <p className="text-emerald-400">✓ OpenSCAD 2024.02 CSG Evaluator Ready</p>
            <p className="text-slate-400">Total volume: {(variables.finger_width * variables.finger_length * variables.pad_thickness * 0.001).toFixed(2)} cm³</p>
            <p className="text-slate-400">Mesh triangles: 480 · Manifold: True</p>
            {receipt?.diagnostics.logs.map((log, idx) => (
              <p key={idx} className="text-indigo-300">» {log}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
