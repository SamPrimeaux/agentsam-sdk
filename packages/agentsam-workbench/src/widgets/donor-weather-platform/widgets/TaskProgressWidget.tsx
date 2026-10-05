/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * TaskProgressWidget: Multi-stage agent task execution stepper with milestone progress and ETA.
 */

import React from 'react';
import { GitCommit, Clock, CheckCircle2, CircleDashed } from 'lucide-react';
import { WidgetFrame } from './WidgetFrame';

export const TaskProgressWidget: React.FC<{ className?: string }> = ({ className = '' }) => {
  const STEPS = [
    { id: '1', name: 'Query Intent Classification', status: 'completed', duration: '120ms' },
    { id: '2', name: 'Open-Meteo Geo & Parameter Alignment', status: 'completed', duration: '340ms' },
    { id: '3', name: 'Live Multi-Endpoint Data Ingestion', status: 'completed', duration: '680ms' },
    { id: '4', name: 'Dynamic Recharts & KPI Orchestration', status: 'in_progress', duration: 'Active' },
    { id: '5', name: 'Workbench Cache & UI Hydration', status: 'pending', duration: '~80ms' },
  ];

  return (
    <WidgetFrame
      id="task-progress"
      title="Workflow Progress"
      category="agent/runtime"
      subtitle="4/5 Stages"
      version="1.0.0"
      icon={<GitCommit className="w-4 h-4 text-sky-400" />}
      className={className}
    >
      <div className="flex flex-col h-full justify-between gap-3">
        {/* Progress summary */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-white/80 font-medium">Weather Orchestration Pipeline</span>
            <span className="font-mono tabular-nums text-sky-300 font-semibold">80%</span>
          </div>
          <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
            <div className="bg-sky-400 h-full rounded-full transition-all duration-500" style={{ width: '80%' }} />
          </div>
        </div>

        {/* Workflow Pipeline Stepper */}
        <div className="space-y-2 flex-1 overflow-y-auto max-h-[170px]">
          {STEPS.map((st, i) => (
            <div
              key={st.id}
              className="flex items-center justify-between p-2 rounded-xl bg-white/5 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                {st.status === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : st.status === 'in_progress' ? (
                  <CircleDashed className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-white/20 shrink-0" />
                )}
                <span className={`truncate ${st.status === 'in_progress' ? 'text-sky-200 font-medium' : st.status === 'completed' ? 'text-white/80' : 'text-white/40'}`}>
                  {st.name}
                </span>
              </div>
              <span className="font-mono text-[10px] text-white/40 tabular-nums shrink-0 ml-2">
                {st.duration}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between text-[10px] text-white/40 font-mono pt-1 border-t border-white/5">
          <span>ETA: ~1.2s</span>
          <span className="text-emerald-400">LATENCY OPTIMAL</span>
        </div>
      </div>
    </WidgetFrame>
  );
};
