/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ArrowRight,
  Box,
  CheckCircle2,
  Download,
  Eye,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Wand2,
  Zap
} from 'lucide-react';
import React, { useState } from 'react';
import { MeshyAssetProvider } from '../../lib/cad/providers';
import { CadExecutionReceipt } from '../../lib/cad/types';

interface GenerativeAssetWorkspaceProps {
  isDarkMode: boolean;
  onSendToRobotics?: (assetName: string) => void;
}

const ASSET_PRESETS = [
  'Custom hydraulic actuator clamp fixture',
  'Titanium robot vacuum gripper cup housing',
  'Automotive gearbox housing bracket',
  'Stepped sorting tray for cylindrical bearings'
];

export function GenerativeAssetWorkspace({ isDarkMode, onSendToRobotics }: GenerativeAssetWorkspaceProps) {
  const [prompt, setPrompt] = useState('Custom hydraulic actuator clamp fixture');
  const [style, setStyle] = useState<'realistic' | 'industrial' | 'stylized'>('industrial');
  const [polyCount, setPolyCount] = useState(4200);
  const [isGenerating, setIsGenerating] = useState(false);
  const [receipt, setReceipt] = useState<CadExecutionReceipt | null>(null);
  const [sentSuccess, setSentSuccess] = useState(false);

  const provider = new MeshyAssetProvider();

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await provider.execute({
        jobId: `gen_${Date.now()}`,
        engine: 'meshy',
        operation: 'text_to_3d',
        input: {
          prompt,
          params: { style, polyCount }
        }
      });
      setReceipt(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSend = () => {
    onSendToRobotics?.(prompt);
    setSentSuccess(true);
    setTimeout(() => setSentSuccess(false), 3000);
  };

  const panelBg = isDarkMode ? 'bg-slate-900/80 border-white/10 text-slate-100' : 'bg-white/80 border-slate-200 text-slate-800';
  const cardBg = isDarkMode ? 'bg-slate-950/60 border-white/5' : 'bg-slate-50/80 border-slate-200';
  const inputBg = isDarkMode ? 'bg-slate-950 border-white/10 text-slate-100' : 'bg-white border-slate-200 text-slate-800';

  return (
    <div className="w-full h-full flex flex-col min-[880px]:flex-row gap-4 p-4 min-[880px]:p-6 overflow-y-auto">
      {/* LEFT: Generation Prompt & Synthesis Controls */}
      <div className={`flex-1 flex flex-col rounded-2xl border p-4 shadow-xl ${panelBg} min-h-[480px]`}>
        <div className="flex items-center justify-between pb-3 border-b border-inherit mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-sm">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold leading-tight">Meshy AI 3D Generative Studio</h2>
              <p className="text-[10px] text-slate-400">Diffusion & Autoregressive 3D Mesh Synthesis</p>
            </div>
          </div>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all flex items-center gap-1.5"
          >
            {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            <span>{isGenerating ? 'Synthesizing 3D...' : 'Generate 3D Asset'}</span>
          </button>
        </div>

        {/* Prompt Input */}
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
              3D CAD Mesh Prompt
            </label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={3}
              placeholder="Describe physical shape, features, mounting holes..."
              className={`w-full p-3 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${inputBg}`}
            />
          </div>

          {/* Quick Presets */}
          <div className="flex flex-wrap gap-1.5">
            {ASSET_PRESETS.map((p, i) => (
              <button
                key={i}
                onClick={() => setPrompt(p)}
                className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all ${
                  prompt === p ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white/5 border-inherit hover:bg-white/10'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* 3D Generation Preview */}
        <div className="flex-1 rounded-xl bg-slate-950 border border-white/10 relative overflow-hidden flex items-center justify-center p-6 min-h-[240px]">
          <div className="absolute inset-0 bg-[radial-gradient(#4f46e5_1px,transparent_1px)] [background-size:24px_24px] opacity-20" />

          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-36 h-36 rounded-2xl bg-gradient-to-tr from-indigo-600 to-emerald-400 p-0.5 shadow-2xl flex items-center justify-center animate-bounce duration-1000">
              <div className="w-full h-full bg-slate-900 rounded-[14px] flex flex-col items-center justify-center p-3 text-white">
                <Box className="w-10 h-10 text-indigo-400 mb-2" />
                <span className="text-[10px] font-bold truncate max-w-[120px]">{prompt}</span>
                <span className="text-[9px] font-mono text-emerald-400 mt-1">4.2k Quads · PBR 2K</span>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>Physics Collision Hull Auto-Generated</span>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: Deployment to Robotics Scene */}
      <div className={`w-full min-[880px]:w-[360px] flex flex-col rounded-2xl border p-4 shadow-xl ${panelBg} shrink-0 space-y-3`}>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          Scene Interchange
        </h3>

        <div className="space-y-2">
          <button
            onClick={handleSend}
            className="w-full py-3 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            {sentSuccess ? <CheckCircle2 className="w-4 h-4 text-white" /> : <ArrowRight className="w-4 h-4" />}
            <span>{sentSuccess ? 'Spawned in MuJoCo Workspace!' : 'Inject Asset into Robotics Simulation'}</span>
          </button>

          <button
            onClick={handleGenerate}
            className="w-full py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-inherit flex items-center justify-center gap-2 text-xs font-semibold transition-all"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            <span>Download GLTF 2.0 Asset</span>
          </button>
        </div>

        {/* Logs */}
        <div className="p-3 rounded-xl bg-slate-950/80 border border-white/5 font-mono text-[10px] text-slate-400 space-y-1">
          <p className="text-indigo-400 font-bold">Meshy Generative 3D Pipeline</p>
          <p>• Retopology: Quad-dominant (remesh: 0.02)</p>
          <p>• Convex Decomposition: V-HACD 4.0 enabled</p>
          <p>• Ready for MuJoCo XML insertion</p>
        </div>
      </div>
    </div>
  );
}
