/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ActiveRunWidget: Live agent execution step tracker, thought streaming, and tool calls.
 */

import React, { useState } from 'react';
import { PlayCircle, PauseCircle, StopCircle, RefreshCw, Terminal, CheckCircle2, ChevronRight } from 'lucide-react';
import { WidgetFrame } from './WidgetFrame';

export interface ActiveRunWidgetProps {
  currentGoal?: string;
  activeTool?: string;
  stepIndex?: number;
  totalSteps?: number;
  className?: string;
}

export const ActiveRunWidget: React.FC<ActiveRunWidgetProps> = ({
  currentGoal = "Synthesize 3-City Weather Comparison with Open-Meteo",
  activeTool = "fetchLiveWeatherData({ lat: 40.71, lon: -74.00 })",
  stepIndex = 3,
  totalSteps = 4,
  className = ''
}) => {
  const [isRunning, setIsRunning] = useState(true);
  const [logExpanded, setLogExpanded] = useState(false);

  return (
    <WidgetFrame
      id="active-run"
      title="Active Run Inspector"
      category="agent/runtime"
      subtitle={`Step ${stepIndex}/${totalSteps}`}
      version="1.1.0"
      icon={<PlayCircle className="w-4 h-4 text-emerald-400" />}
      actions={
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`p-1 rounded-md transition-colors ${
              isRunning ? 'text-amber-300 hover:bg-white/10' : 'text-emerald-300 hover:bg-white/10'
            }`}
            title={isRunning ? "Pause agent run" : "Resume agent run"}
          >
            {isRunning ? <PauseCircle className="w-3.5 h-3.5" /> : <PlayCircle className="w-3.5 h-3.5" />}
          </button>
        </div>
      }
      className={className}
    >
      <div className="flex flex-col h-full justify-between gap-3">
        {/* Run Header & Goal */}
        <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
          <div className="flex items-center justify-between text-[11px] text-white/50 mb-1">
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              {isRunning ? 'Planning & Ingestion Phase' : 'Execution Suspended'}
            </span>
            <span className="font-mono text-[10px] text-white/40">RUN-8942</span>
          </div>
          <div className="text-xs font-medium text-white truncate leading-relaxed">
            {currentGoal}
          </div>
        </div>

        {/* Live Step Stepper */}
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { label: 'Parse Intent', done: true },
            { label: 'Resolve Geo', done: true },
            { label: 'Open-Meteo', active: true },
            { label: 'Orchestrate', pending: true },
          ].map((st, i) => (
            <div
              key={i}
              className={`p-2 rounded-lg text-center border transition-all ${
                st.done
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                  : st.active
                  ? 'bg-sky-500/15 border-sky-400/40 text-sky-200'
                  : 'bg-white/5 border-white/5 text-white/40'
              }`}
            >
              <div className="text-[9px] font-mono uppercase tracking-wider mb-0.5">
                {st.done ? 'Done' : st.active ? 'Active' : 'Queued'}
              </div>
              <div className="text-[11px] font-medium truncate">{st.label}</div>
            </div>
          ))}
        </div>

        {/* Current Tool Call snippet */}
        <div className="p-2 rounded-xl bg-black/30 border border-white/5 font-mono text-[11px]">
          <div className="flex items-center justify-between text-white/40 text-[10px] mb-1">
            <span className="flex items-center gap-1">
              <Terminal className="w-3 h-3 text-sky-400" /> ACTIVE TOOL CALL
            </span>
            <span className="text-emerald-400">HTTP 200 OK</span>
          </div>
          <div className="text-sky-300 truncate">
            {activeTool}
          </div>
        </div>
      </div>
    </WidgetFrame>
  );
};
