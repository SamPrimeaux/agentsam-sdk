/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * GlanceMetricsWidget: Real-time operational telemetry and sparkline metrics.
 */

import React from 'react';
import { Activity, ArrowUpRight, Cpu, HardDrive, Zap } from 'lucide-react';
import { WidgetFrame } from './WidgetFrame';

export const GlanceMetricsWidget: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <WidgetFrame
      id="metrics"
      title="Operational Metrics"
      category="glance"
      subtitle="P95 Telemetry"
      version="1.0.0"
      icon={<Activity className="w-4 h-4 text-emerald-400" />}
      className={className}
    >
      <div className="flex flex-col h-full justify-between gap-3">
        {/* Metric Grid */}
        <div className="grid grid-cols-2 gap-2">
          {/* Throughput */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/5">
            <div className="flex items-center justify-between text-[11px] text-white/50 mb-1">
              <span>Throughput</span>
              <span className="text-emerald-300 font-mono text-[10px]">Nominal</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-mono tabular-nums font-semibold text-white">482</span>
              <span className="text-[11px] text-white/40">req/s</span>
            </div>
          </div>

          {/* Latency P95 */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/5">
            <div className="flex items-center justify-between text-[11px] text-white/50 mb-1">
              <span>Latency P95</span>
              <span className="text-sky-300 font-mono text-[10px]">Optimal</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-mono tabular-nums font-semibold text-white">34.2</span>
              <span className="text-[11px] text-white/40">ms</span>
            </div>
          </div>

          {/* Memory RSS */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/5">
            <div className="flex items-center justify-between text-[11px] text-white/50 mb-1">
              <span>Memory RSS</span>
              <HardDrive className="w-3 h-3 text-white/30" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-mono tabular-nums font-semibold text-white">142</span>
              <span className="text-[11px] text-white/40">MB</span>
            </div>
          </div>

          {/* Event Loop Lag */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/5">
            <div className="flex items-center justify-between text-[11px] text-white/50 mb-1">
              <span>Loop Lag</span>
              <Cpu className="w-3 h-3 text-white/30" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-mono tabular-nums font-semibold text-white">1.18</span>
              <span className="text-[11px] text-white/40">ms</span>
            </div>
          </div>
        </div>

        {/* Live Sparkline Representation */}
        <div className="p-2.5 rounded-xl bg-black/20 border border-white/5">
          <div className="flex items-center justify-between text-[10px] text-white/40 mb-1.5 font-mono">
            <span>60s INGRESS TIMELINE</span>
            <span className="text-emerald-400">0.01% error</span>
          </div>
          <div className="h-9 flex items-end gap-1 px-1">
            {[45, 62, 58, 70, 78, 65, 82, 90, 85, 76, 88, 92, 95, 84, 91, 89, 96, 94].map((val, idx) => (
              <div
                key={idx}
                className="flex-1 bg-gradient-to-t from-sky-500/30 to-sky-300 rounded-t-sm transition-all"
                style={{ height: `${val}%` }}
                title={`${val}% utilization`}
              />
            ))}
          </div>
        </div>
      </div>
    </WidgetFrame>
  );
};
