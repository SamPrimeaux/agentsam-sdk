/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * WeatherAgentWidget: Weather dashboard agent packaged as a workbench widget,
 * preserving the pristine glassmorphic design and Open-Meteo live data integration.
 */

import React, { useState, useEffect } from 'react';
import { CloudSun, Search, ArrowRight, Wind, Droplets, Sun, CloudRain, Thermometer, MapPin, Loader2, Sparkles } from 'lucide-react';
import { WidgetFrame } from './WidgetFrame';
import { generateDashboardConfig, DashboardResponse } from '../../../services/orchestrator';
import { WeatherCard } from '../../../components/WeatherCard';
import { DynamicChart } from '../../../components/DynamicChart';
import { KPICard } from '../../../components/KPICard';

export interface WeatherAgentWidgetProps {
  initialQuery?: string;
  className?: string;
  onAtmosphereChange?: (gradient: string) => void;
}

const PRESET_QUERIES = [
  "New York current weather and hourly forecast",
  "Compare weather in London and Paris",
  "Tokyo 7-day temperature trends",
  "San Francisco wind speed and humidity today"
];

export const WeatherAgentWidget: React.FC<WeatherAgentWidgetProps> = ({
  initialQuery = "What is the current weather in New York?",
  className = '',
  onAtmosphereChange
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [isLoading, setIsLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const executeSearch = async (targetQuery: string) => {
    if (!targetQuery.trim() || isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      const result = await generateDashboardConfig(targetQuery);
      setDashboardData(result);
    } catch (err: any) {
      setError(err?.message || "Failed to fetch live weather data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Run initial search on mount
    executeSearch(initialQuery);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(query);
  };

  return (
    <WidgetFrame
      id="weather-dashboard-agent"
      title="Weather Dashboard Agent"
      category="weather"
      subtitle={dashboardData?.resolvedCity || "Live Forecast"}
      version="2.0.0"
      icon={<CloudSun className="w-4 h-4 text-sky-300" />}
      onRefresh={() => executeSearch(query)}
      className={className}
    >
      <div className="flex flex-col gap-4 min-h-[300px]">
        {/* Search & Query Bar */}
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <div className="absolute left-3.5 top-3 flex items-center pointer-events-none text-white/50">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-sky-300" /> : <Search className="w-4 h-4" />}
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isLoading}
            placeholder="Ask weather agent (e.g. 'Seattle rain this week', 'Paris vs Rome')..."
            className="w-full pl-10 pr-12 py-2.5 rounded-xl bg-black/30 border border-white/10 text-white text-xs placeholder-white/40 focus:outline-none focus:border-sky-400 transition-colors shadow-inner"
          />
          <button
            type="submit"
            disabled={!query.trim() || isLoading}
            className="absolute right-1.5 top-1.5 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        {/* Preset query tags */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] no-scrollbar">
          <span className="text-white/40 text-[10px] shrink-0 font-mono">Presets:</span>
          {PRESET_QUERIES.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => {
                setQuery(preset);
                executeSearch(preset);
              }}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-white/70 hover:text-white whitespace-nowrap transition-colors shrink-0"
            >
              {preset.split(' ')[0]} {preset.includes('Compare') ? 'vs Paris' : 'Weather'}
            </button>
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 text-center">
            {error}
          </div>
        )}

        {/* Loading Spinner */}
        {isLoading && !dashboardData && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-white/60">
            <Loader2 className="w-8 h-8 animate-spin text-sky-300" />
            <span className="text-xs font-medium">Synthesizing live weather data...</span>
          </div>
        )}

        {/* Dashboard Results (preserves clean styles from demo) */}
        {dashboardData && !error && (
          <div className={`space-y-4 transition-opacity duration-300 ${isLoading ? 'opacity-40' : 'opacity-100'}`}>
            {/* Analysis Narrative Insight */}
            {dashboardData.analysis && (
              <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                <p className="text-xs text-white/90 leading-relaxed font-medium">
                  {dashboardData.analysis}
                </p>
              </div>
            )}

            {/* Resolved Date / Location Banner */}
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-black/20 text-xs text-white/70">
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-sky-400" />
                <span className="font-semibold text-white">{dashboardData.resolvedCity || "Resolved Region"}</span>
              </div>
              {dashboardData.resolvedDate && (
                <span className="font-mono text-[11px] text-white/50">{dashboardData.resolvedDate}</span>
              )}
            </div>

            {/* Weather Card Component (Google Maps + KPIs) */}
            <div className="w-full">
              <WeatherCard
                city={dashboardData.resolvedCity || "Forecast Location"}
                widgets={dashboardData.widgets}
                analysis={dashboardData.analysis}
              />
            </div>

            {/* Render any charts generated by orchestrator */}
            {dashboardData.widgets
              .filter((w) => w.type !== "kpi" && w.type !== "weather")
              .map((widget, i) => (
                <div key={widget.id || i} className="h-[280px] w-full">
                  <DynamicChart widget={widget} />
                </div>
              ))}
          </div>
        )}
      </div>
    </WidgetFrame>
  );
};
