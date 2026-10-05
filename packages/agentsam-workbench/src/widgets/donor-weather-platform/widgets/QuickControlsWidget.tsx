/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * QuickControlsWidget: Studio & runtime toggles for dev server, telemetry, audio, and atmosphere.
 */

import React from 'react';
import { Sliders, Zap, Server, Activity, ShieldCheck, Volume2, Palette } from 'lucide-react';
import { WidgetFrame } from './WidgetFrame';
import { QuickControlsState } from '@inneranimalmedia/agentsam-contracts/widgets';

export interface QuickControlsWidgetProps {
  controls: QuickControlsState;
  onChange: (updated: Partial<QuickControlsState>) => void;
  className?: string;
}

export const QuickControlsWidget: React.FC<QuickControlsWidgetProps> = ({
  controls,
  onChange,
  className = ''
}) => {
  const THEMES: Array<{ id: QuickControlsState['atmosphericTheme']; label: string; bg: string }> = [
    { id: 'weather-auto', label: 'Weather Auto', bg: 'bg-gradient-to-r from-sky-400 to-emerald-200' },
    { id: 'azure-sky', label: 'Azure Sky', bg: 'bg-gradient-to-r from-sky-500 to-blue-300' },
    { id: 'deep-slate', label: 'Deep Slate', bg: 'bg-gradient-to-r from-slate-900 to-slate-700' },
    { id: 'twilight', label: 'Twilight', bg: 'bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-800' },
    { id: 'aurora', label: 'Aurora', bg: 'bg-gradient-to-r from-teal-900 via-emerald-800 to-sky-900' },
    { id: 'emerald', label: 'Emerald', bg: 'bg-gradient-to-r from-emerald-700 to-teal-400' },
  ];

  return (
    <WidgetFrame
      id="quick-controls"
      title="Quick Controls"
      category="utility"
      subtitle="Runtime Switches"
      version="1.1.0"
      icon={<Sliders className="w-4 h-4" />}
      className={className}
    >
      <div className="flex flex-col gap-3.5 h-full justify-between">
        {/* Toggle Grid */}
        <div className="space-y-2.5">
          {/* Turbo Run */}
          <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
            <div className="flex items-center gap-2.5">
              <div className={`p-1.5 rounded-lg ${controls.turboRun ? 'bg-amber-400/20 text-amber-300' : 'bg-white/5 text-white/40'}`}>
                <Zap className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-medium text-white">Turbo Execution</div>
                <div className="text-[10px] text-white/40">Aggressive token streaming & cache</div>
              </div>
            </div>
            <button
              onClick={() => onChange({ turboRun: !controls.turboRun })}
              className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                controls.turboRun ? 'bg-amber-400' : 'bg-white/20'
              }`}
            >
              <div className={`w-4 h-4 rounded-full bg-slate-900 transition-transform ${
                controls.turboRun ? 'translate-x-4' : 'translate-x-0'
              }`} />
            </button>
          </div>

          {/* Dev Server Mode */}
          <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
            <div className="flex items-center gap-2.5">
              <div className={`p-1.5 rounded-lg ${controls.devServer ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/5 text-white/40'}`}>
                <Server className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-medium text-white">Dev Server Proxy</div>
                <div className="text-[10px] text-white/40">Port 3000 local worker bridge</div>
              </div>
            </div>
            <button
              onClick={() => onChange({ devServer: !controls.devServer })}
              className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                controls.devServer ? 'bg-emerald-400' : 'bg-white/20'
              }`}
            >
              <div className={`w-4 h-4 rounded-full bg-slate-900 transition-transform ${
                controls.devServer ? 'translate-x-4' : 'translate-x-0'
              }`} />
            </button>
          </div>

          {/* Telemetry Stream */}
          <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
            <div className="flex items-center gap-2.5">
              <div className={`p-1.5 rounded-lg ${controls.telemetryStream ? 'bg-sky-400/20 text-sky-300' : 'bg-white/5 text-white/40'}`}>
                <Activity className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-medium text-white">Live Telemetry</div>
                <div className="text-[10px] text-white/40">Real-time p95 event broadcast</div>
              </div>
            </div>
            <button
              onClick={() => onChange({ telemetryStream: !controls.telemetryStream })}
              className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                controls.telemetryStream ? 'bg-sky-400' : 'bg-white/20'
              }`}
            >
              <div className={`w-4 h-4 rounded-full bg-slate-900 transition-transform ${
                controls.telemetryStream ? 'translate-x-4' : 'translate-x-0'
              }`} />
            </button>
          </div>

          {/* Audio Chimes */}
          <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
            <div className="flex items-center gap-2.5">
              <div className={`p-1.5 rounded-lg ${controls.audioChimes ? 'bg-purple-400/20 text-purple-300' : 'bg-white/5 text-white/40'}`}>
                <Volume2 className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-medium text-white">Audio Chimes</div>
                <div className="text-[10px] text-white/40">Synthesized audio cues</div>
              </div>
            </div>
            <button
              onClick={() => onChange({ audioChimes: !controls.audioChimes })}
              className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                controls.audioChimes ? 'bg-purple-400' : 'bg-white/20'
              }`}
            >
              <div className={`w-4 h-4 rounded-full bg-slate-900 transition-transform ${
                controls.audioChimes ? 'translate-x-4' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </div>

        {/* Atmosphere Theme Selector */}
        <div className="pt-2 border-t border-white/5">
          <div className="flex items-center gap-1.5 text-xs text-white/60 mb-2">
            <Palette className="w-3.5 h-3.5" />
            <span>Atmospheric Gradient Canvas</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                onClick={() => onChange({ atmosphericTheme: theme.id })}
                className={`px-2 py-1.5 rounded-lg text-[10px] font-medium text-left truncate border transition-all ${
                  controls.atmosphericTheme === theme.id
                    ? 'border-white/50 text-white bg-white/15 shadow-sm'
                    : 'border-white/5 text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className={`w-2.5 h-2.5 rounded-full inline-block mr-1.5 ${theme.bg}`} />
                {theme.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </WidgetFrame>
  );
};
