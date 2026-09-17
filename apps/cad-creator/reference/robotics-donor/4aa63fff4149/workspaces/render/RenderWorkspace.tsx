/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Camera,
  Download,
  Eye,
  Layers,
  Palette,
  Play,
  RotateCcw,
  Sparkles,
  Sun,
  SunMedium,
  Video
} from 'lucide-react';
import React, { useState } from 'react';
import { BlenderProvider } from '../../lib/cad/providers';
import { CadExecutionReceipt } from '../../lib/cad/types';

interface RenderWorkspaceProps {
  isDarkMode: boolean;
  onSendToRobotics?: (sceneName: string) => void;
}

const LIGHTING_PRESETS = [
  { id: 'three_point', name: 'Studio Three-Point', desc: 'Key, Fill, and Rim lights for clean engineering presentation.' },
  { id: 'softbox', name: 'High-Key Softbox', desc: 'Diffused industrial lighting with minimal harsh shadows.' },
  { id: 'cyberpunk', name: 'Cyberpunk Rim', desc: 'High-contrast cyan & purple edge lighting for robotics.' },
  { id: 'daylight', name: 'Factory Daylight', desc: '5600K industrial skylight with ambient floor bounce.' }
];

const MATERIAL_PRESETS = [
  { id: 'anodized_black', name: 'Anodized Black Aluminum', rough: 0.25, metal: 0.95, color: '#1e293b' },
  { id: 'brushed_titanium', name: 'Brushed Titanium Ti-6Al-4V', rough: 0.35, metal: 0.98, color: '#94a3b8' },
  { id: 'carbon_fiber', name: 'Toray 3K Carbon Fiber', rough: 0.45, metal: 0.2, color: '#0f172a' },
  { id: 'safety_orange', name: 'Industrial Safety Orange Powdercoat', rough: 0.3, metal: 0.1, color: '#ea580c' }
];

export function RenderWorkspace({ isDarkMode, onSendToRobotics }: RenderWorkspaceProps) {
  const [selectedLight, setSelectedLight] = useState('three_point');
  const [selectedMaterial, setSelectedMaterial] = useState('anodized_black');
  const [samples, setSamples] = useState(128);
  const [denoiser, setDenoiser] = useState(true);
  const [isRendering, setIsRendering] = useState(false);
  const [receipt, setReceipt] = useState<CadExecutionReceipt | null>(null);

  const provider = new BlenderProvider();

  const handleRender = async () => {
    setIsRendering(true);
    try {
      const res = await provider.execute({
        jobId: `render_${Date.now()}`,
        engine: 'blender',
        operation: 'render_preview',
        input: {
          sceneData: {
            lighting: selectedLight,
            material: selectedMaterial,
            samples,
            denoiser
          }
        }
      });
      setReceipt(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRendering(false);
    }
  };

  const panelBg = isDarkMode ? 'bg-slate-900/80 border-white/10 text-slate-100' : 'bg-white/80 border-slate-200 text-slate-800';
  const cardBg = isDarkMode ? 'bg-slate-950/60 border-white/5' : 'bg-slate-50/80 border-slate-200';

  const currentMat = MATERIAL_PRESETS.find(m => m.id === selectedMaterial)!;

  return (
    <div className="w-full h-full flex flex-col min-[880px]:flex-row gap-4 p-4 min-[880px]:p-6 overflow-y-auto">
      {/* LEFT: Blender 3D Stage & Raytrace Visualizer */}
      <div className={`flex-1 flex flex-col rounded-2xl border p-4 shadow-xl ${panelBg} min-h-[480px]`}>
        <div className="flex items-center justify-between pb-3 border-b border-inherit mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-sm">
              <SunMedium className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold leading-tight">Blender 4.2 Photoreal Studio</h2>
              <p className="text-[10px] text-slate-400">Cycles & EEVEE-Next PBR Rendering Engine</p>
            </div>
          </div>
          <button
            onClick={handleRender}
            disabled={isRendering}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all flex items-center gap-1.5"
          >
            <Play className={`w-3.5 h-3.5 ${isRendering ? 'animate-spin' : ''}`} />
            <span>{isRendering ? 'Baking Passes...' : 'Render Preview'}</span>
          </button>
        </div>

        {/* Photorealistic Render Preview Canvas */}
        <div className="flex-1 rounded-xl bg-slate-950 border border-white/10 relative overflow-hidden flex items-center justify-center p-6 min-h-[320px]">
          {/* Studio floor shadow gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-slate-950 to-slate-900" />
          
          {/* Simulated Raytraced Franka Panda Arm / CAD Assembly in Studio Lighting */}
          <div className="relative z-10 flex flex-col items-center">
            <div
              className="w-48 h-48 rounded-3xl shadow-[0_25px_60px_-15px_rgba(79,70,229,0.3)] border border-white/30 flex items-center justify-center transition-all duration-500"
              style={{
                backgroundColor: currentMat.color,
                boxShadow: `0 20px 50px -10px ${currentMat.color}80, 0 0 40px ${selectedLight === 'cyberpunk' ? '#06b6d440' : '#4f46e520'}`
              }}
            >
              <div className="p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-center text-white">
                <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-tr from-indigo-500 to-emerald-400 flex items-center justify-center mb-2 shadow-lg">
                  <Camera className="w-6 h-6 text-white" />
                </div>
                <h4 className="text-xs font-bold tracking-tight">{currentMat.name}</h4>
                <p className="text-[9px] font-mono text-slate-300 mt-0.5">Roughness: {currentMat.rough} · Metal: {currentMat.metal}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 px-3 py-1 rounded-full bg-black/60 border border-white/10 text-[10px] font-mono text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Cycles Engine · {samples} Samples · OptiX AI Denoising</span>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: Material & Lighting Inspector Controls */}
      <div className={`w-full min-[880px]:w-[380px] flex flex-col rounded-2xl border p-4 shadow-xl ${panelBg} shrink-0 space-y-4`}>
        {/* Lighting Setups */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
            <Sun className="w-3.5 h-3.5 text-amber-500" />
            Studio Lighting Environment
          </h3>
          <div className="space-y-1.5">
            {LIGHTING_PRESETS.map(light => (
              <button
                key={light.id}
                onClick={() => setSelectedLight(light.id)}
                className={`w-full p-2 rounded-xl border text-left text-xs transition-all ${
                  selectedLight === light.id
                    ? isDarkMode
                      ? 'bg-indigo-600/20 border-indigo-500 text-white font-bold'
                      : 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold'
                    : cardBg
                }`}
              >
                <div className="flex justify-between items-center">
                  <span>{light.name}</span>
                  {selectedLight === light.id && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                </div>
                <p className="text-[10px] text-slate-400 font-normal leading-tight mt-0.5">{light.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* PBR Material Library */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-indigo-400" />
            PBR Principled BSDF Materials
          </h3>
          <div className="space-y-1.5">
            {MATERIAL_PRESETS.map(mat => (
              <button
                key={mat.id}
                onClick={() => setSelectedMaterial(mat.id)}
                className={`w-full p-2 rounded-xl border text-left text-xs transition-all flex items-center gap-2.5 ${
                  selectedMaterial === mat.id
                    ? isDarkMode
                      ? 'bg-indigo-600/20 border-indigo-500 text-white font-bold'
                      : 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold'
                    : cardBg
                }`}
              >
                <div className="w-5 h-5 rounded-lg border border-white/20 shrink-0" style={{ backgroundColor: mat.color }} />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-semibold">{mat.name}</div>
                  <div className="text-[9px] text-slate-400 font-mono">Rough: {mat.rough} · Metal: {mat.metal}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Export Pipeline */}
        <div className="pt-2 border-t border-inherit space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
            <button
              onClick={handleRender}
              className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-inherit flex items-center justify-center gap-1.5 transition-all"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              <span>Export GLTF 2.0</span>
            </button>
            <button
              onClick={handleRender}
              className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-inherit flex items-center justify-center gap-1.5 transition-all"
            >
              <Video className="w-3.5 h-3.5 text-emerald-400" />
              <span>Turntable MP4</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
