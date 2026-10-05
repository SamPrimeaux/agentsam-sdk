/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from "react";
import { DashboardWidget } from "../services/orchestrator";
import { cn } from "../lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KPICardProps {
  widget: DashboardWidget;
}

export const KPICard: React.FC<KPICardProps> = ({ widget }) => {
  const trend = widget.trend || 0;
  const isPositive = trend > 0;
  const isNegative = trend < 0;

  const trendColor = isPositive ? "text-emerald-300" : isNegative ? "text-sky-300" : "text-white/50";

  return (
    <div className="backdrop-blur-[64px] bg-black/30 rounded-[60px] text-white text-[15px] flex flex-col h-full justify-between tracking-[.52px] leading-[130%] mx-auto max-h-[700px] max-w-[600px] p-[50px] relative text-center w-full z-[1] transition-all duration-500">
      <div>
        <h3 className="text-[13px] font-semibold text-white/60 mb-2">{widget.title}</h3>
        <div className="flex items-baseline justify-center gap-2 mt-4">
          <span className="text-5xl md:text-6xl font-medium text-white tracking-tighter">
            {typeof widget.value === 'number'
              ? widget.value.toLocaleString('en-US', { maximumFractionDigits: 2 })
              : (widget.value !== undefined ? widget.value : "--")}
          </span>
          {widget.unit && <span className="text-2xl text-white/60 font-light">{widget.unit}</span>}
        </div>
      </div>

      {widget.trend !== undefined && (
        <div className="flex items-center justify-center mt-6">
            <div className={cn("flex items-center text-sm font-medium", trendColor)}>
                {isPositive ? <TrendingUp className="w-4 h-4 mr-2" /> : isNegative ? <TrendingDown className="w-4 h-4 mr-2" /> : <Minus className="w-4 h-4 mr-2" />}
                <span>{Math.abs(trend)}%</span>
            </div>
            <span className="text-white/50 text-xs ml-3 font-medium tracking-wide">change</span>
        </div>
      )}

      {widget.description && (
        <p className="text-xs text-white/60 mt-6 pt-4 border-t border-white/10 leading-relaxed font-medium">{widget.description}</p>
      )}
    </div>
  );
};
