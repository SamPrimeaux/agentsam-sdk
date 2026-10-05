/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * GlanceQueuesWidget: Inbound queue depth, priority lanes, and dead-letter count.
 */

import React from 'react';
import { Layers, AlertTriangle, ArrowRight } from 'lucide-react';
import { WidgetFrame } from './WidgetFrame';

export const GlanceQueuesWidget: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <WidgetFrame
      id="queues"
      title="Queue Depth"
      category="glance"
      subtitle="Worker Lanes"
      version="1.0.0"
      icon={<Layers className="w-4 h-4 text-purple-400" />}
      className={className}
    >
      <div className="flex flex-col h-full justify-between gap-3">
        {/* Metric summary */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5">
          <div>
            <div className="text-[11px] text-white/50">Total Queue Depth</div>
            <div className="text-2xl font-mono tabular-nums font-semibold text-white mt-0.5">14 tasks</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-white/50">Processing Rate</div>
            <div className="text-sm font-mono tabular-nums text-emerald-300 font-medium mt-0.5">92 / min</div>
          </div>
        </div>

        {/* Priority Lanes Breakdown */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-rose-300 font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> High Priority
            </span>
            <span className="font-mono tabular-nums text-white">2 tasks</span>
          </div>
          <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
            <div className="bg-rose-400 h-full rounded-full" style={{ width: '15%' }} />
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-sky-300 font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" /> Normal Priority
            </span>
            <span className="font-mono tabular-nums text-white">12 tasks</span>
          </div>
          <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
            <div className="bg-sky-400 h-full rounded-full" style={{ width: '85%' }} />
          </div>
        </div>

        {/* Dead Letter Status */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-black/20 text-[11px] border border-white/5">
          <div className="flex items-center gap-1.5 text-white/60">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Dead-letter Backlog:</span>
          </div>
          <span className="font-mono tabular-nums text-emerald-300 font-medium">0 failed</span>
        </div>
      </div>
    </WidgetFrame>
  );
};
