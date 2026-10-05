/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TokenCostWidget: Real-time token consumption breakdown and estimated USD compute cost.
 */

import React from 'react';
import { Coins, TrendingUp, Sparkles } from 'lucide-react';
import { WidgetFrame } from './WidgetFrame';

export const TokenCostWidget: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <WidgetFrame
      id="token-cost-glance"
      title="Token & Cost Glance"
      category="agent/runtime"
      subtitle="Usage & Spend"
      version="1.0.0"
      icon={<Coins className="w-4 h-4 text-amber-400" />}
      className={className}
    >
      <div className="flex flex-col h-full justify-between gap-3">
        {/* Cost banner */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-amber-500/10 to-emerald-500/10 border border-amber-500/20">
          <div>
            <div className="text-[11px] text-white/50">Session Cost</div>
            <div className="text-2xl font-mono tabular-nums font-semibold text-white mt-0.5">$0.0042</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-white/50">Model Profile</div>
            <div className="text-xs font-mono text-amber-300 font-medium mt-0.5">Gemini Flash Lite</div>
          </div>
        </div>

        {/* Token breakdown grid */}
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="p-2 rounded-xl bg-white/5 border border-white/5">
            <div className="text-[10px] text-white/40 uppercase font-mono">Prompt</div>
            <div className="text-sm font-mono tabular-nums text-white font-medium mt-0.5">3,420</div>
          </div>
          <div className="p-2 rounded-xl bg-white/5 border border-white/5">
            <div className="text-[10px] text-white/40 uppercase font-mono">Output</div>
            <div className="text-sm font-mono tabular-nums text-emerald-300 font-medium mt-0.5">890</div>
          </div>
          <div className="p-2 rounded-xl bg-white/5 border border-white/5">
            <div className="text-[10px] text-white/40 uppercase font-mono">Cached</div>
            <div className="text-sm font-mono tabular-nums text-sky-300 font-medium mt-0.5">1,200</div>
          </div>
        </div>

        {/* Rate efficiency glance */}
        <div className="flex items-center justify-between text-[11px] text-white/45 pt-1 border-t border-white/5">
          <span>Efficiency: ~0.0001$/call</span>
          <span className="text-emerald-300 font-mono">Within Budget</span>
        </div>
      </div>
    </WidgetFrame>
  );
};
