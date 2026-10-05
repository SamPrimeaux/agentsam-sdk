/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend
} from "recharts";
import { DashboardWidget } from "../services/orchestrator";

interface DynamicChartProps {
  widget: DashboardWidget;
}

// OEM-inspired neutrals + Google Weather blues
const COLORS = ["#0B57D0", "#1e88e5", "#2a9d8f", "#f4a261", "#e9c46a", "#264653"];

// Helper to format keys cleanly (e.g. "wind_speed_10m" -> "Wind Speed 10m")
export function formatKeyName(key: string): string {
  if (!key) return "";
  return key
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatChartDate(value: any, showTime: boolean): string {
  if (typeof value === 'string') {
    // Also support checking for values that are just ISO dates like YYYY-MM-DD
    const isDateString = value.includes('-') && (value.includes(':') || value.match(/^\d{4}-\d{2}-\d{2}$/));
    if (isDateString) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        const day = date.getUTCDate().toString().padStart(2, '0');
        // e.g., "Feb" -> "Feb"
        const monthStr = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
        const year = date.getUTCFullYear().toString().slice(-2);
        
        let formatted = `${day}-${monthStr}-${year}`;
        
        if (showTime && value.includes(':')) {
          const timeStr = date.toLocaleString('en-US', { hour: 'numeric', hour12: true, timeZone: 'UTC' });
          formatted = `${formatted}, ${timeStr}`;
        }
        
        return formatted;
      }
    }
  }
  return String(value);
}

export const DynamicChart: React.FC<DynamicChartProps> = ({ widget }) => {
  const data = widget.customData;

  if (!data) return <div className="text-rose-400 p-4 bg-rose-500/10 rounded-[32px]">No data available for {widget.title}</div>;

  const xAxisKey = widget.xAxisKey || "time";

  // Helper to ensure dataKeys are present, preventing empty charts
  const activeDataKeys = React.useMemo(() => {
    if (widget.dataKeys && widget.dataKeys.length > 0) return widget.dataKeys;
    // Fallback for weather
    if (widget.dataSource === "weather") return ["temperature"];
    return ["value"]; // Generic fallback
  }, [widget.dataKeys, widget.dataSource]);

  // Analyze raw data time span to determine how to format axis and align pivoted data
  const timeInfo = React.useMemo(() => {
    if (!Array.isArray(data) || data.length < 2) return { isHourly: false, daysSpan: 0 };
    
    let dates = data
      .map(row => {
        const val = row[xAxisKey];
        return typeof val === 'string' ? new Date(val).getTime() : NaN;
      })
      .filter(time => !isNaN(time));
      
    if (dates.length >= 2) {
      // Sort and remove near-duplicates (within same hour) to prevent multiple cities from skewing the average diff
      const sortedDates = [...dates].sort((a, b) => a - b);
      const uniqueSortedDates = [sortedDates[0]];
      for (let i = 1; i < sortedDates.length; i++) {
        if (sortedDates[i] - uniqueSortedDates[uniqueSortedDates.length - 1] >= 3500000) {
          uniqueSortedDates.push(sortedDates[i]);
        }
      }
      
      if (uniqueSortedDates.length >= 2) {
        const timeSpan = uniqueSortedDates[uniqueSortedDates.length - 1] - uniqueSortedDates[0];
        const daysSpan = timeSpan / (1000 * 60 * 60 * 24);
        
        let totalDiff = 0;
        for (let i = 1; i < uniqueSortedDates.length; i++) {
          totalDiff += uniqueSortedDates[i] - uniqueSortedDates[i-1];
        }
        const avgDiff = totalDiff / (uniqueSortedDates.length - 1);
        
        // If average difference between unique data points is less than ~20 hours, it's hourly data
        const isHourly = avgDiff < 72000000;
        return { isHourly, daysSpan };
      }
    }
    return { isHourly: false, daysSpan: 0 };
  }, [data, xAxisKey]);

  // Pivot data if seriesKey is provided
  const { chartData, renderKeys } = React.useMemo(() => {
    if (!data || !Array.isArray(data)) return { chartData: [], renderKeys: activeDataKeys };

    if (widget.seriesKey && activeDataKeys.length > 0) {
      const seriesKey = widget.seriesKey;
      const valueKey = activeDataKeys[0]; // when grouping, we usually plot one metric (like temperature_2m) across multiple cities
      const uniqueSeries = Array.from(new Set(data.map(d => d[seriesKey]).filter(Boolean)));
      
      const pivoted = data.reduce((acc, row) => {
        // Normalize date strings to prevent staggered x-axis points
        let rawX = row[xAxisKey];
        let normalizedX = rawX;
        if (typeof rawX === 'string' && rawX.includes('-') && (rawX.includes('T') || rawX.includes(':'))) {
          const d = new Date(rawX);
          if (!isNaN(d.getTime())) {
            if (!timeInfo.isHourly) {
              // Daily data: strictly group by YYYY-MM-DD to align all cities to the exact same day
              normalizedX = d.toISOString().split('T')[0];
            } else {
              // Hourly data: round to nearest hour to align cities
              d.setMinutes(0, 0, 0);
              normalizedX = d.toISOString();
            }
          }
        }

        let existing = acc.find((item: any) => item[xAxisKey] === normalizedX);
        if (!existing) {
          existing = { [xAxisKey]: normalizedX };
          acc.push(existing);
        }
        const seriesName = row[seriesKey];
        if (seriesName) {
          existing[seriesName] = row[valueKey];
        }
        return acc;
      }, [] as any[]);
      
      return { chartData: pivoted, renderKeys: uniqueSeries as string[] };
    }
    
    return { chartData: data, renderKeys: activeDataKeys };
  }, [data, widget.seriesKey, xAxisKey, activeDataKeys, timeInfo.isHourly]);

  const showAxisTime = timeInfo.isHourly && timeInfo.daysSpan <= 3;
  const showTooltipTime = timeInfo.isHourly;

  const isDenseData = Array.isArray(chartData) && chartData.length >= 14;

  const renderChart = () => {
    switch (widget.type) {
      case "line":
        return (
          <ResponsiveContainer width="100%" height="100%" minHeight={250}>
            <LineChart data={chartData as any[]} margin={{ bottom: 15 }}>
              {/* No grid lines, minimal */}
              <CartesianGrid strokeDasharray="3 3" opacity={0} vertical={false} />
              <XAxis 
                dataKey={xAxisKey} 
                stroke="transparent" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                dy={10}
                fontFamily="Inter, sans-serif"
                tickFormatter={(val) => formatChartDate(val, showAxisTime)}
                tick={isDenseData ? false : { fill: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: 500 }}
              />
              <YAxis 
                stroke="transparent" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                tickFormatter={(value) => `${value}`} 
                dx={-10}
                fontFamily="Inter, sans-serif"
                tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: 500 }}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: "#f1fcff", border: "1px solid rgba(45,212,191,0.4)", borderRadius: "12px", color: "#0f172a", padding: "12px", boxShadow: "0 20px 25px -5px rgba(15,23,42,0.15), 0 10px 10px -5px rgba(15,23,42,0.08)" }}
                itemStyle={{ color: "#0f172a", fontSize: 12, fontWeight: 500 }}
                labelStyle={{ color: "#0369a1", marginBottom: "8px", fontSize: 10, letterSpacing: "0.05em" }}
                cursor={{ stroke: "rgba(15,23,42,0.12)", strokeWidth: 1 }}
                formatter={(value: any, name: any) => [
                  typeof value === 'number' ? Number(value.toFixed(1)) : value, 
                  typeof name === 'string' ? formatKeyName(name) : name
                ]}
                labelFormatter={(label) => formatChartDate(label, showTooltipTime)}
              />
              {renderKeys.map((key, index) => (
                <Line
                  connectNulls
                  name={formatKeyName(key)}
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6, stroke: "#0a0a0a", strokeWidth: 2, fill: COLORS[index % COLORS.length] }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );
      case "bar":
        return (
          <ResponsiveContainer width="100%" height="100%" minHeight={250}>
            <BarChart data={chartData as any[]} barGap={8} margin={{ bottom: 15 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0} vertical={false} />
              <XAxis 
                dataKey={xAxisKey} 
                stroke="transparent" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                dy={10}
                tickFormatter={(val) => formatChartDate(val, showAxisTime)}
                tick={isDenseData ? false : { fill: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: 500 }}
              />
              <YAxis 
                stroke="transparent" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                dx={-10}
                tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: 500 }}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: "#f1fcff", border: "1px solid rgba(45,212,191,0.4)", borderRadius: "12px", color: "#0f172a", padding: "12px" }}
                cursor={{ fill: "rgba(15,23,42,0.03)", radius: 8 }}
                itemStyle={{ color: "#0f172a", fontSize: 12 }}
                labelStyle={{ color: "#0369a1", marginBottom: "8px", fontSize: 10, textTransform: "none" }}
                formatter={(value: any, name: any) => [
                  typeof value === 'number' ? Number(value.toFixed(1)) : value, 
                  typeof name === 'string' ? formatKeyName(name) : name
                ]}
                labelFormatter={(label) => formatChartDate(label, showTooltipTime)}
              />
              {renderKeys.map((key, index) => (
                <Bar 
                  name={formatKeyName(key)}
                  key={key} 
                  dataKey={key} 
                  fill={COLORS[index % COLORS.length]} 
                  radius={[4, 4, 4, 4]} 
                  barSize={32}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );
      case "area":
        return (
          <ResponsiveContainer width="100%" height="100%" minHeight={250}>
            <AreaChart data={chartData as any[]} margin={{ bottom: 15 }}>
              <defs>
                {renderKeys.map((key, index) => (
                  <linearGradient key={`gradient-${key}`} id={`color-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.4}/>
                    <stop offset="95%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0}/>
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0} vertical={false} />
              <XAxis 
                dataKey={xAxisKey} 
                stroke="transparent" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                dy={10}
                tickFormatter={(val) => formatChartDate(val, showAxisTime)}
                tick={isDenseData ? false : { fill: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: 500 }}
              />
              <YAxis 
                stroke="transparent" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                dx={-10}
                tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: 500 }}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: "#f1fcff", border: "1px solid rgba(45,212,191,0.4)", borderRadius: "12px", color: "#0f172a", padding: "12px" }}
                itemStyle={{ color: "#0f172a", fontSize: 12 }}
                labelStyle={{ color: "#0369a1", marginBottom: "8px", fontSize: 10, textTransform: "none" }}
                formatter={(value: any, name: any) => [
                  typeof value === 'number' ? Number(value.toFixed(1)) : value, 
                  typeof name === 'string' ? formatKeyName(name) : name
                ]}
                labelFormatter={(label) => formatChartDate(label, showTooltipTime)}
              />
              {renderKeys.map((key, index) => (
                <Area
                  connectNulls
                  name={formatKeyName(key)}
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={3}
                  fillOpacity={1}
                  fill={`url(#color-${key})`}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        );
      case "scatter":
        return (
          <ResponsiveContainer width="100%" height="100%" minHeight={250}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0} />
              <XAxis 
                type="number" 
                dataKey={widget.xLabel} 
                name={formatKeyName(widget.xLabel || "")} 
                stroke="transparent" 
                fontSize={10}
                tickLine={false}
                axisLine={false}
                dy={10}
                domain={['auto', 'auto']}
                tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: 500 }}
                label={{ value: widget.xLabel, position: 'bottom', offset: 0, fill: "rgba(255,255,255,0.55)", fontSize: 10, style: { textTransform: "none", letterSpacing: "0.05em" } }}
              />
              <YAxis 
                type="number" 
                dataKey={widget.yLabel} 
                name={formatKeyName(widget.yLabel || "")} 
                stroke="transparent" 
                fontSize={10}
                tickLine={false}
                axisLine={false}
                dx={-10}
                domain={['auto', 'auto']}
                tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: 500 }}
                label={{ value: widget.yLabel, angle: -90, position: 'insideLeft', fill: "rgba(255,255,255,0.55)", fontSize: 10, style: { textTransform: "none", letterSpacing: "0.05em" } }}
              />
              <Tooltip 
                cursor={{ strokeDasharray: "3 3" }} 
                contentStyle={{ backgroundColor: "#f1fcff", border: "1px solid rgba(45,212,191,0.4)", borderRadius: "12px", color: "#0f172a", padding: "12px" }}
                itemStyle={{ color: "#0f172a", fontSize: 12 }}
                labelStyle={{ color: "#0369a1", marginBottom: "8px", fontSize: 10, textTransform: "none" }}
                formatter={(value: any, name: any) => [
                  typeof value === 'number' ? Number(value.toFixed(1)) : value, 
                  typeof name === 'string' ? formatKeyName(name) : name
                ]}
                labelFormatter={(label) => formatChartDate(label, showTooltipTime)}
              />
              <Scatter 
                name={widget.title} 
                data={chartData as any[]} 
                fill={COLORS[0]}
                shape="circle"
              >
                  {
                    (chartData as any[]).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                    ))
                  }
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        );
      case "pie":
        return (
          <ResponsiveContainer width="100%" height="100%" minHeight={250}>
            <PieChart>
              <Pie
                data={chartData as any[]}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey={renderKeys[0]}
                nameKey={xAxisKey}
                stroke="none"
                cornerRadius={4}
              >
                {(chartData as any[]).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: "#f1fcff", border: "1px solid rgba(45,212,191,0.4)", borderRadius: "12px", color: "#0f172a", padding: "12px" }}
                itemStyle={{ color: "#0f172a", fontSize: 12 }}
                formatter={(value: any, name: any) => [
                  typeof value === 'number' ? Number(value.toFixed(1)) : value, 
                  typeof name === 'string' ? formatKeyName(name) : name
                ]}
                labelFormatter={(label) => formatChartDate(label, showTooltipTime)}
              />
            </PieChart>
          </ResponsiveContainer>
        );
      case "composed":
        return (
          <ResponsiveContainer width="100%" height="100%" minHeight={250}>
            <ComposedChart data={chartData as any[]} margin={{ bottom: 15 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0} vertical={false} />
              <XAxis 
                dataKey={xAxisKey} 
                stroke="transparent" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                dy={10}
                tickFormatter={(val) => formatChartDate(val, showAxisTime)}
                tick={isDenseData ? false : { fill: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: 500 }}
              />
              <YAxis 
                stroke="transparent" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                dx={-10}
                tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: 500 }}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: "#f1fcff", border: "1px solid rgba(45,212,191,0.4)", borderRadius: "12px", color: "#0f172a", padding: "12px", boxShadow: "0 20px 25px -5px rgba(15,23,42,0.15), 0 10px 10px -5px rgba(15,23,42,0.08)" }}
                itemStyle={{ color: "#0f172a", fontSize: 12, fontWeight: 500 }}
                labelStyle={{ color: "#0369a1", marginBottom: "8px", fontSize: 10, letterSpacing: "0.05em" }}
                cursor={{ fill: "rgba(15,23,42,0.03)", radius: 8 }}
                formatter={(value: any, name: any) => [
                  typeof value === 'number' ? Number(value.toFixed(1)) : value, 
                  typeof name === 'string' ? formatKeyName(name) : name
                ]}
                labelFormatter={(label) => formatChartDate(label, showTooltipTime)}
              />
              {renderKeys.length > 0 && (
                <Bar 
                  name={formatKeyName(renderKeys[0])}
                  dataKey={renderKeys[0]} 
                  fill={COLORS[0]} 
                  radius={[4, 4, 4, 4]} 
                  barSize={32}
                />
              )}
              {renderKeys.length > 1 && (
                <Line
                  connectNulls
                  name={formatKeyName(renderKeys[1])}
                  type="monotone"
                  dataKey={renderKeys[1]}
                  stroke={COLORS[1]}
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6, stroke: "#0a0a0a", strokeWidth: 2, fill: COLORS[1] }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        );
      case "radar":
        return (
          <ResponsiveContainer width="100%" height="100%" minHeight={250}>
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData as any[]}>
              <PolarGrid stroke="rgba(255,255,255,0.15)" />
              <PolarAngleAxis 
                dataKey={xAxisKey} 
                tick={isDenseData ? false : { fill: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: 500 }} 
              />
              <PolarRadiusAxis 
                angle={30} 
                domain={['auto', 'auto']} 
                tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} 
                axisLine={false}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: "#f1fcff", border: "1px solid rgba(45,212,191,0.4)", borderRadius: "12px", color: "#0f172a", padding: "12px" }}
                itemStyle={{ color: "#0f172a", fontSize: 12, fontWeight: 500 }}
                formatter={(value: any, name: any) => [
                  typeof value === 'number' ? Number(value.toFixed(1)) : value, 
                  typeof name === 'string' ? formatKeyName(name) : name
                ]}
                labelFormatter={(label) => formatChartDate(label, showTooltipTime)}
              />
              {renderKeys.map((key, index) => (
                <Radar
                  key={key}
                  name={formatKeyName(key)}
                  dataKey={key}
                  stroke={COLORS[index % COLORS.length]}
                  fill={COLORS[index % COLORS.length]}
                  fillOpacity={0.4}
                />
              ))}
            </RadarChart>
          </ResponsiveContainer>
        );
      default:
        return <div className="text-zinc-500 text-sm">Unsupported chart type: {widget.type}</div>;
    }
  };

  const primaryColor = COLORS[0];

  return (
    <div className="bg-black/15 backdrop-blur-[48px] rounded-[20px] text-white text-[13px] flex flex-col h-full tracking-[.2px] leading-[130%] mx-auto max-h-[700px] max-w-[600px] p-5 relative text-left w-full z-[1] transition-all duration-500">
      <div className="mb-4">
        <h3 className="text-[13px] font-semibold text-white tracking-wide">
          {widget.title}
        </h3>
        {widget.description && (
          <p className="text-[11px] text-white/50 mt-1 leading-relaxed font-medium">
            {widget.description}
          </p>
        )}
      </div>
      <div className="flex-1 min-h-0 w-full">
        {renderChart()}
      </div>
    </div>
  );
};
