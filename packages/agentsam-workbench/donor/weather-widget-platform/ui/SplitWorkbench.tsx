/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SplitWorkbench: Dual-pane canvas pairing the live Weather Dashboard Agent
 * with real-time workbench utility and agent runtime widgets.
 */

import React, { useState } from 'react';
import {
  Columns,
  CloudSun,
  Cpu,
  Timer,
  ShieldAlert,
  Coins,
  Sliders,
  ChevronRight
} from 'lucide-react';
import {
  CountdownWidget,
  ActiveRunWidget,
  TokenCostWidget,
  ApprovalsWidget,
  QuickControlsWidget,
  GlanceMetricsWidget,
  WeatherAgentWidget
} from '@inneranimalmedia/agentsam-workbench/widgets';
import { QuickControlsState } from '@inneranimalmedia/agentsam-contracts/widgets';
import { useTheme } from '@inneranimalmedia/agentsam-themes';

export interface SplitWorkbenchProps {
  controls: QuickControlsState;
  onControlsChange: (updated: Partial<QuickControlsState>) => void;
  initialWeatherQuery?: string;
}

export const SplitWorkbench: React.FC<SplitWorkbenchProps> = ({
  controls,
  onControlsChange,
  initialWeatherQuery = "Compare weather in Boston, New York and Seattle last month"
}) => {
  const { activeTheme } = useTheme();
  const [activeCompanionTab, setActiveCompanionTab] = useState<'runtime' | 'utility' | 'telemetry'>('runtime');

  return (
    <div className="w-full max-w-[1500px] mx-auto px-4 sm:px-6 py-6 pb-24">
      {/* 2-Column Split Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column: Weather Dashboard Agent (Full Interactive Widget) */}
        <div className="xl:col-span-7 space-y-4">
          <div className="flex items-center justify-between text-xs text-white/60 px-1">
            <span className="flex items-center gap-1.5 font-medium text-white">
              <CloudSun className="w-4 h-4 text-sky-300" />
              Primary Agent Canvas: Weather Intelligence
            </span>
            <span className="font-mono text-[10px] text-white/40">PORT 3000 · OPEN-METEO SYNC</span>
          </div>

          <WeatherAgentWidget initialQuery={initialWeatherQuery} />
        </div>

        {/* Right Column: Companion Runtime & Utility Stack */}
        <div className="xl:col-span-5 space-y-4">
          {/* Tab selector for companion widgets */}
          <div
            className="p-2 rounded-2xl border flex items-center justify-between"
            style={{
              background: activeTheme.glass.cardFill,
              backdropFilter: 'blur(36px)',
              borderColor: activeTheme.glass.cardBorder
            }}
          >
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveCompanionTab('runtime')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  activeCompanionTab === 'runtime'
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Runtime & Safety
              </button>
              <button
                onClick={() => setActiveCompanionTab('utility')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  activeCompanionTab === 'utility'
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Utilities & Focus
              </button>
              <button
                onClick={() => setActiveCompanionTab('telemetry')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  activeCompanionTab === 'telemetry'
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Telemetry
              </button>
            </div>

            <div className="text-[10px] font-mono text-white/40 pr-2 hidden sm:block">
              Workbench Dock
            </div>
          </div>

          {/* Active Tab Content */}
          {activeCompanionTab === 'runtime' && (
            <div className="space-y-4">
              <ActiveRunWidget />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TokenCostWidget />
                <ApprovalsWidget />
              </div>
            </div>
          )}

          {activeCompanionTab === 'utility' && (
            <div className="space-y-4">
              <CountdownWidget />
              <QuickControlsWidget controls={controls} onChange={onControlsChange} />
            </div>
          )}

          {activeCompanionTab === 'telemetry' && (
            <div className="space-y-4">
              <GlanceMetricsWidget />
              <CountdownWidget initialSeconds={900} initialLabel="Telemetry Window" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
