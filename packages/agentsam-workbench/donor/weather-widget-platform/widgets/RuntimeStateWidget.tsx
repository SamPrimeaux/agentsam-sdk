/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * RuntimeStateWidget: Cluster health, sandbox container status, and node environment.
 */

import React from 'react';
import { Server, ShieldCheck, Box, Network, CheckCircle2 } from 'lucide-react';
import { WidgetFrame } from './WidgetFrame';

export const RuntimeStateWidget: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <WidgetFrame
      id="runtime-state"
      title="Runtime State"
      category="glance"
      subtitle="Cluster Health"
      version="1.0.0"
      icon={<Server className="w-4 h-4 text-emerald-400" />}
      className={className}
    >
      <div className="flex flex-col h-full justify-between gap-3">
        {/* Status Badge */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="text-xs font-semibold text-emerald-200">Cluster Nominal</div>
              <div className="text-[10px] text-emerald-300/70">All node agents synchronized</div>
            </div>
          </div>
          <span className="text-[11px] font-mono text-emerald-300">99.99%</span>
        </div>

        {/* Specs List */}
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between py-1 border-b border-white/5">
            <span className="text-white/50 flex items-center gap-1.5">
              <Box className="w-3.5 h-3.5 text-white/40" /> Active Sandboxes
            </span>
            <span className="font-mono tabular-nums text-white">4 instances</span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-white/5">
            <span className="text-white/50 flex items-center gap-1.5">
              <Network className="w-3.5 h-3.5 text-white/40" /> Gateway Latency
            </span>
            <span className="font-mono tabular-nums text-emerald-300">8.4 ms</span>
          </div>

          <div className="flex items-center justify-between py-1">
            <span className="text-white/50 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-white/40" /> Environment
            </span>
            <span className="font-mono text-white/80">Vite 6 · Node 22</span>
          </div>
        </div>

        <div className="text-[10px] font-mono text-white/40 text-center">
          UPTIME: 14d 6h 32m · REVISION #2026.10
        </div>
      </div>
    </WidgetFrame>
  );
};
