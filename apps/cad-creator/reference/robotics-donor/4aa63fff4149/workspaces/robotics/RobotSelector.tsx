/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bot, Compass } from 'lucide-react';
import React from 'react';

interface RobotSelectorProps {
  gizmoStats: { pos: string; rot: string } | null;
  isDarkMode: boolean;
  robotName?: string;
  dof?: number;
}

export function RobotSelector({
  gizmoStats,
  isDarkMode,
  robotName = 'Franka Panda',
  dof = 7
}: RobotSelectorProps) {
  const panelStyle = isDarkMode
    ? 'bg-slate-900/80 border-white/10 text-slate-100 shadow-slate-900/40'
    : 'bg-white/80 border-slate-200 text-slate-800 shadow-slate-200/50';
  const labelStyle = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const valueStyle = isDarkMode ? 'text-slate-200' : 'text-slate-700';

  return (
    <div className="absolute top-20 left-4 min-[660px]:left-8 z-20 flex flex-col gap-2.5 pointer-events-none">
      <div className={`glass-panel px-5 py-3 rounded-2xl min-w-[200px] shadow-xl pointer-events-auto border ${panelStyle}`}>
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-xl bg-indigo-600 text-white shadow-md">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight leading-none">{robotName}</h1>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{dof}-DOF Arm · Analytical IK</p>
          </div>
        </div>
      </div>

      {gizmoStats && (
        <div className={`glass-card px-4 py-2.5 rounded-xl flex flex-col gap-1 shadow-sm pointer-events-auto border ${isDarkMode ? 'bg-slate-900/60 border-white/5' : 'bg-white/70 border-slate-200/80'}`}>
          <div className="font-mono text-[9px] space-y-0.5">
            <p className="flex justify-between gap-3">
              <span className={labelStyle}>TCP POS:</span>
              <span className={`${valueStyle} font-semibold`}>{gizmoStats.pos}</span>
            </p>
            <p className="flex justify-between gap-3">
              <span className={labelStyle}>TCP ROT:</span>
              <span className={`${valueStyle} font-semibold`}>{gizmoStats.rot}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
