/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * QueueStatusWidget: Agent pipeline worker concurrency and subtask distribution.
 */

import React from 'react';
import { Network, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { WidgetFrame } from './WidgetFrame';

export const QueueStatusWidget: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <WidgetFrame
      id="queue-status"
      title="Agent Queue Status"
      category="agent/runtime"
      subtitle="Worker Concurrency"
      version="1.0.0"
      icon={<Network className="w-4 h-4 text-sky-400" />}
      className={className}
    >
      <div className="flex flex-col h-full justify-between gap-3">
        {/* Status gauges */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
            <div className="text-[10px] text-white/40 uppercase font-mono">Running</div>
            <div className="text-xl font-mono tabular-nums text-emerald-300 font-semibold mt-0.5">3</div>
            <div className="text-[9px] text-white/30 mt-0.5">Workers</div>
          </div>
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
            <div className="text-[10px] text-white/40 uppercase font-mono">Pending</div>
            <div className="text-xl font-mono tabular-nums text-amber-300 font-semibold mt-0.5">5</div>
            <div className="text-[9px] text-white/30 mt-0.5">In backlog</div>
          </div>
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
            <div className="text-[10px] text-white/40 uppercase font-mono">Retries</div>
            <div className="text-xl font-mono tabular-nums text-white/50 font-semibold mt-0.5">0</div>
            <div className="text-[9px] text-white/30 mt-0.5">Failed</div>
          </div>
        </div>

        {/* Worker Pool Visualizer */}
        <div className="space-y-1.5 p-2 rounded-xl bg-black/20 border border-white/5">
          <div className="flex items-center justify-between text-[10px] text-white/40 font-mono">
            <span>CONCURRENCY POOL (3/6 SLOTS)</span>
            <span className="text-emerald-400">50% LOAD</span>
          </div>
          <div className="grid grid-cols-6 gap-1 h-3">
            <div className="rounded-sm bg-emerald-400" title="Worker 1: Active" />
            <div className="rounded-sm bg-emerald-400" title="Worker 2: Active" />
            <div className="rounded-sm bg-emerald-400" title="Worker 3: Active" />
            <div className="rounded-sm bg-white/10" title="Worker 4: Idle" />
            <div className="rounded-sm bg-white/10" title="Worker 5: Idle" />
            <div className="rounded-sm bg-white/10" title="Worker 6: Idle" />
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-white/40 pt-1 border-t border-white/5">
          <span>Backpressure: Minimal</span>
          <span className="text-sky-300 font-mono">Auto-Scaling OK</span>
        </div>
      </div>
    </WidgetFrame>
  );
};
