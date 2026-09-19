/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';

export type SparklineTheme = 'emerald' | 'amber' | 'indigo' | 'sky' | 'rose';

interface SparklineChartProps {
  data: number[];
  width?: number | string;
  height?: number;
  theme?: SparklineTheme;
  label?: string;
  unit?: string;
  targetRefValue?: number;
  targetRefLabel?: string;
  showMinMax?: boolean;
  showCurrentBadge?: boolean;
  minScale?: number;
  maxScale?: number;
  className?: string;
}

const THEME_CONFIGS: Record<
  SparklineTheme,
  {
    stroke: string;
    fillGradientStart: string;
    fillGradientStop: string;
    glow: string;
    badgeBg: string;
    badgeText: string;
  }
> = {
  emerald: {
    stroke: '#10b981',
    fillGradientStart: 'rgba(16, 185, 129, 0.35)',
    fillGradientStop: 'rgba(16, 185, 129, 0.0)',
    glow: 'rgba(16, 185, 129, 0.4)',
    badgeBg: 'bg-emerald-500/10 border-emerald-500/20',
    badgeText: 'text-emerald-400'
  },
  amber: {
    stroke: '#f59e0b',
    fillGradientStart: 'rgba(245, 158, 11, 0.35)',
    fillGradientStop: 'rgba(245, 158, 11, 0.0)',
    glow: 'rgba(245, 158, 11, 0.4)',
    badgeBg: 'bg-amber-500/10 border-amber-500/20',
    badgeText: 'text-amber-400'
  },
  indigo: {
    stroke: '#6366f1',
    fillGradientStart: 'rgba(99, 102, 241, 0.35)',
    fillGradientStop: 'rgba(99, 102, 241, 0.0)',
    glow: 'rgba(99, 102, 241, 0.4)',
    badgeBg: 'bg-indigo-500/10 border-indigo-500/20',
    badgeText: 'text-indigo-400'
  },
  sky: {
    stroke: '#0ea5e9',
    fillGradientStart: 'rgba(14, 165, 233, 0.35)',
    fillGradientStop: 'rgba(14, 165, 233, 0.0)',
    glow: 'rgba(14, 165, 233, 0.4)',
    badgeBg: 'bg-sky-500/10 border-sky-500/20',
    badgeText: 'text-sky-400'
  },
  rose: {
    stroke: '#f43f5e',
    fillGradientStart: 'rgba(244, 63, 94, 0.35)',
    fillGradientStop: 'rgba(244, 63, 94, 0.0)',
    glow: 'rgba(244, 63, 94, 0.4)',
    badgeBg: 'bg-rose-500/10 border-rose-500/20',
    badgeText: 'text-rose-400'
  }
};

export function SparklineChart({
  data,
  width = '100%',
  height = 56,
  theme = 'emerald',
  label,
  unit = '',
  targetRefValue,
  targetRefLabel,
  showMinMax = true,
  showCurrentBadge = true,
  minScale,
  maxScale,
  className = ''
}: SparklineChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const colors = THEME_CONFIGS[theme];
  const uniqueId = useMemo(() => `sparkline-grad-${theme}-${Math.random().toString(36).substr(2, 6)}`, [theme]);

  const sanitizedData = useMemo(() => {
    if (!data || data.length === 0) return [0, 0];
    if (data.length === 1) return [data[0], data[0]];
    return data;
  }, [data]);

  const currentValue = sanitizedData[sanitizedData.length - 1] ?? 0;

  const { points, linePath, areaPath, minVal, maxVal, targetY, coordinates } = useMemo(() => {
    const vals = sanitizedData;
    const computedMin = minScale !== undefined ? minScale : Math.min(...vals);
    let computedMax = maxScale !== undefined ? maxScale : Math.max(...vals);

    if (computedMax === computedMin) {
      computedMax = computedMin + 1;
    }

    const range = computedMax - computedMin;
    const svgWidth = 240;
    const svgHeight = height;
    const paddingX = 4;
    const paddingTop = 6;
    const paddingBottom = 6;
    const usableHeight = svgHeight - paddingTop - paddingBottom;
    const usableWidth = svgWidth - paddingX * 2;

    const coords = vals.map((v, i) => {
      const x = paddingX + (i / (vals.length - 1)) * usableWidth;
      const normalizedY = (v - computedMin) / range;
      const y = paddingTop + (1 - normalizedY) * usableHeight;
      return { x, y, value: v };
    });

    const pathD = coords.reduce((acc, pt, i) => {
      if (i === 0) return `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
      // Cubic bezier curve smoothing
      const prev = coords[i - 1];
      const cx1 = (prev.x + (pt.x - prev.x) / 2).toFixed(1);
      const cy1 = prev.y.toFixed(1);
      const cx2 = cx1;
      const cy2 = pt.y.toFixed(1);
      return `${acc} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }, '');

    const firstX = coords[0].x.toFixed(1);
    const lastX = coords[coords.length - 1].x.toFixed(1);
    const bottomY = (svgHeight - paddingBottom).toFixed(1);
    const areaD = `${pathD} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;

    let calculatedTargetY: number | null = null;
    if (targetRefValue !== undefined) {
      const norm = (targetRefValue - computedMin) / range;
      calculatedTargetY = paddingTop + (1 - Math.max(0, Math.min(1, norm))) * usableHeight;
    }

    return {
      points: coords,
      linePath: pathD,
      areaPath: areaD,
      minVal: computedMin,
      maxVal: computedMax,
      targetY: calculatedTargetY,
      coordinates: coords
    };
  }, [sanitizedData, height, minScale, maxScale, targetRefValue]);

  const activePoint = hoverIndex !== null && coordinates[hoverIndex] ? coordinates[hoverIndex] : null;

  return (
    <div className={`relative flex flex-col gap-1 select-none ${className}`}>
      {/* Header with Title and Current Value Indicator */}
      {(label || showCurrentBadge) && (
        <div className="flex items-center justify-between text-[10px] font-mono leading-none">
          {label && <span className="text-slate-400 font-semibold tracking-wider uppercase">{label}</span>}
          {showCurrentBadge && (
            <div
              className={`px-1.5 py-0.5 rounded border text-[10px] font-bold tracking-tight transition-colors flex items-center gap-1 ${colors.badgeBg} ${colors.badgeText}`}
            >
              <span>
                {(activePoint ? activePoint.value : currentValue).toFixed(
                  Number.isInteger(currentValue) && unit !== 'm/s' ? 0 : 1
                )}
              </span>
              {unit && <span className="opacity-75">{unit}</span>}
            </div>
          )}
        </div>
      )}

      {/* SVG Canvas for Sparkline Area and Line */}
      <div className="relative w-full overflow-hidden rounded bg-slate-950/40 border border-white/5 py-0.5">
        <svg
          viewBox={`0 0 240 ${height}`}
          className="w-full overflow-visible transition-all duration-150"
          style={{ height: `${height}px` }}
          preserveAspectRatio="none"
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id={uniqueId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.fillGradientStart} />
              <stop offset="100%" stopColor={colors.fillGradientStop} />
            </linearGradient>
            <filter id={`glow-${uniqueId}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor={colors.glow} />
            </filter>
          </defs>

          {/* Target Reference Value Guide Line */}
          {targetY !== null && (
            <g opacity={0.6}>
              <line
                x1="4"
                y1={targetY}
                x2="236"
                y2={targetY}
                stroke="#64748b"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              {targetRefLabel && (
                <text x="6" y={Math.max(10, targetY - 2)} fill="#94a3b8" fontSize="8" fontFamily="monospace">
                  {targetRefLabel}
                </text>
              )}
            </g>
          )}

          {/* Area Gradient Fill */}
          <path d={areaPath} fill={`url(#${uniqueId})`} />

          {/* Main Trajectory Stroke Line */}
          <path
            d={linePath}
            fill="none"
            stroke={colors.stroke}
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#glow-${uniqueId})`}
          />

          {/* Active Hover / Current Value Pulsing Dot */}
          {coordinates.length > 0 && (
            <circle
              cx={(activePoint || coordinates[coordinates.length - 1]).x}
              cy={(activePoint || coordinates[coordinates.length - 1]).y}
              r="2.5"
              fill={colors.stroke}
              className="animate-pulse"
              stroke="#0f172a"
              strokeWidth="1"
            />
          )}

          {/* Interactive Mouse Move Target Columns for Scrubber */}
          {coordinates.map((pt, idx) => {
            const colWidth = 240 / coordinates.length;
            return (
              <rect
                key={idx}
                x={pt.x - colWidth / 2}
                y="0"
                width={colWidth}
                height={height}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoverIndex(idx)}
              />
            );
          })}
        </svg>

        {/* Min / Max Range Markers */}
        {showMinMax && (
          <div className="absolute bottom-0.5 inset-x-1.5 flex justify-between text-[8px] font-mono text-slate-500 pointer-events-none opacity-60">
            <span>
              {minVal.toFixed(0)}
              {unit}
            </span>
            <span>
              {maxVal.toFixed(0)}
              {unit}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
