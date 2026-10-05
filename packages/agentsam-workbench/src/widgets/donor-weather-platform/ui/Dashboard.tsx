/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search, Loader2, ArrowRight, CalendarDays } from "lucide-react";
import { generateDashboardConfig, DashboardResponse, DashboardWidget } from "../services/orchestrator";
import { WeatherCard } from "./WeatherCard";
import { DynamicChart } from "./DynamicChart";
import { KPICard } from "./KPICard";

const SUGGESTIONS = [
  "Compare weather in Boston, New York and Seattle last month",
  "What was the windiest day in Kansas City this year?",
  "How much rain did Los Angeles get last month?",
];

function formatDateFocus(dateStr: string): string {
  if (!dateStr) return "";
  // Check if it looks like a standard YYYY-MM-DD or similar date we can parse
  // If it's a range or natural language (like "Feb 20-27, 2026"), leave it as is
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    try {
      const date = new Date(dateStr);
      // Ensure we don't get timezone shifts by using UTC methods if it's strictly a date
      const day = date.getUTCDate();
      const monthStr = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
      const year = date.getUTCFullYear();
      return `${day} ${monthStr}, ${year}`;
    } catch (e) {
      return dateStr;
    }
  }
  return dateStr;
}

export function getGradient(q: string): string {
  const s = q.toLowerCase();
  if (s.includes("rain") || s.includes("drizzle") || s.includes("shower"))
    return "from-slate-600 via-slate-500 to-blue-400";
  if (s.includes("snow") || s.includes("frost") || s.includes("blizzard"))
    return "from-blue-200 via-slate-100 to-white";
  if (s.includes("storm") || s.includes("thunder"))
    return "from-slate-800 via-slate-700 to-slate-500";
  if (s.includes("fog") || s.includes("mist"))
    return "from-slate-400 via-slate-300 to-slate-200";
  if (s.includes("sun") || s.includes("clear") || s.includes("warm") || s.includes("hot"))
    return "from-amber-400 via-sky-400 to-sky-200";
  if (s.includes("cold") || s.includes("freez"))
    return "from-blue-700 via-blue-500 to-blue-300";
  return "from-sky-400 via-sky-300 to-emerald-200";
}

interface DashboardProps {
  externalQuery?: string;
  onAtmosphereChange?: (gradient: string) => void;
  onOpenWidgetsSurface?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  externalQuery,
  onAtmosphereChange,
  onOpenWidgetsSurface
}) => {
  const [query, setQuery] = useState(externalQuery || "");
  const [isLoading, setIsLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeQuery, setActiveQuery] = useState(externalQuery || "");
  const [suggestionIndex, setSuggestionIndex] = useState(0);

  // Trigger search if externalQuery changes and isn't empty
  useEffect(() => {
    if (externalQuery && externalQuery !== activeQuery) {
      setQuery(externalQuery);
      handleSearch(externalQuery);
    }
  }, [externalQuery]);

  const isLanding = !dashboardData && !isLoading && !error;

  // Animate the suggestions only on the landing page and when query is empty
  useEffect(() => {
    if (!isLanding || query.length > 0) return;

    const interval = setInterval(() => {
      setSuggestionIndex((prev) => (prev + 1) % SUGGESTIONS.length);
    }, 4000); // Change suggestion every 4 seconds

    return () => clearInterval(interval);
  }, [isLanding, query]);

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const landingTextareaRef = React.useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const adjustHeight = (ref: React.RefObject<HTMLTextAreaElement | null>) => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      const newHeight = ref.current.scrollHeight;
      // Add a tiny buffer to prevent clipping in some browsers
      ref.current.style.height = `${newHeight + 1}px`;
    }
  };

  React.useLayoutEffect(() => {
    adjustHeight(textareaRef);
  }, [query, isLanding, dashboardData, isLoading, error, activeQuery]);

  React.useLayoutEffect(() => {
    adjustHeight(landingTextareaRef);
  }, [query, isLanding, dashboardData, isLoading, error, activeQuery]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.blur();
      handleSearch(query);
    }
  };

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setIsLoading(true);
    setError(null);

    // Start timing the total search latency
    console.time("Total Search Latency");

    // Clear the old dashboard data so we transition back to the main loading spinner
    setDashboardData(null);
    setActiveQuery(searchQuery);

    // Scroll back to the top smoothly when a new search starts
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }

    try {
      const result = await generateDashboardConfig(searchQuery);
      setDashboardData(result);

      // Stop the timer and print the result
      console.timeEnd("Total Search Latency");

      // Ensure we hit the absolute top after the new data renders and layout shifts
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 100);
    } catch (err: any) {
      console.timeEnd("Total Search Latency");
      setError(err.message || "Something went wrong.");
      setDashboardData(null); // Clear on error
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    handleSearch(query);
  };

  const gradient = getGradient(activeQuery);

  // Sync atmosphere change up
  useEffect(() => {
    onAtmosphereChange?.(gradient);
  }, [gradient, onAtmosphereChange]);

  const hasWeatherCard = dashboardData?.widgets.some(w => w.type === "weather") ?? false;

  const renderWidget = (widget: DashboardWidget, i: number) => {
    if (widget.type === "kpi" && hasWeatherCard) return null;

    return (
      <motion.div
        key={widget.id || `widget-${i}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: i * 0.08 + 0.35 }}
        className={widget.type === "kpi" || widget.type === "weather" ? "w-full max-w-[600px] mx-auto" : "h-[320px] "}
      >
        {widget.type === "kpi" ? (
          <KPICard widget={widget} />
        ) : widget.type === "weather" ? (
          <WeatherCard
            city={dashboardData?.resolvedCity || null}
            widgets={dashboardData?.widgets || []}
            analysis={dashboardData?.analysis || ""}
          />
        ) : (
          <DynamicChart widget={widget} />
        )}
      </motion.div>
    );
  };

  return (
    <div className={`fixed inset-0 bg-gradient-to-br transition-colors duration-[1200ms] ${gradient}`}>
      {/* Soft overlay */}
      <div className="absolute inset-0 bg-black/10 pointer-events-none" />

      {/* Header */}
      <div className="absolute top-0 left-0 w-full p-4 sm:p-6 z-40 flex items-center justify-between pointer-events-none">
        <button
          onClick={() => {
            setDashboardData(null);
            setQuery("");
            setActiveQuery("");
            setError(null);
          }}
          className="text-white/80 hover:text-white font-semibold text-xs tracking-widest uppercase transition-colors pointer-events-auto"
        >
          Weather Dashboard Agent
        </button>

        {onOpenWidgetsSurface && (
          <button
            onClick={onOpenWidgetsSurface}
            className="pointer-events-auto px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium flex items-center gap-1.5 backdrop-blur-md border border-white/10 transition-colors shadow-sm"
          >
            <span>/widgets Surface</span>
            <span className="text-[10px] text-white/50 font-mono">18</span>
          </button>
        )}
      </div>

      {/* Scrollable content */}
      <div className="absolute inset-0 overflow-y-auto" ref={scrollContainerRef}>
        <div className="flex flex-col items-center px-4 pt-16 pb-8">

          <AnimatePresence mode="wait">
            {/* Landing state */}
            {isLanding && (
              <motion.div
                key="landing"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15, transition: { duration: 0.3 } }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                className="flex flex-col items-center justify-center min-h-[65vh] w-full max-w-[800px] mx-auto space-y-8"
              >
                <h1 className="text-white text-[32px] md:text-[42px] font-medium tracking-wide text-center leading-tight px-4 drop-shadow-sm">
                Ask me about the weather and I'll fetch the data and build a custom dashboard
                </h1>

                <div className="w-full p-6">
                  {/* Search input */}
                  <form onSubmit={onSubmit} className="relative w-full max-w-[600px] mx-auto">
                    {/* Animated Placeholder Layer */}
                    {!query && !isLoading && (
                      <div className="absolute inset-0 z-20 pointer-events-none flex items-center pl-6 pr-12 overflow-hidden h-full">
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={suggestionIndex}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.5 }}
                            className="text-white/40 text-base truncate whitespace-nowrap"
                          >
                            {SUGGESTIONS[suggestionIndex]}
                          </motion.div>
                        </AnimatePresence>
                      </div>
                    )}

                    <textarea
                      ref={landingTextareaRef}
                      rows={1}
                      className="w-full pl-6 pr-12 py-4 rounded-[28px] text-white text-lg font-medium focus:outline-none transition-all resize-none overflow-hidden block leading-relaxed relative z-10 placeholder-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.12)]"
                      style={{
                        background: "rgba(0,0,0,0.2)",
                        backdropFilter: "blur(20px)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        minHeight: '64px'
                      }}
                      placeholder=""
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      onKeyDown={onKeyDown}
                      disabled={isLoading}
                    />
                    <button
                      type="submit"
                      disabled={!query.trim() || isLoading}
                      className="absolute bottom-2 right-2 p-2 rounded-full text-white/70 hover:text-white transition-all disabled:opacity-20 flex items-center justify-center z-20"
                      style={{ background: "transparent" }}
                    >
                      <ArrowRight className="w-6 h-6" />
                    </button>
                  </form>

                  <div className="mt-6 text-center">
                    <a
                      href="https://open-meteo.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/40 hover:text-white/60 text-[11px] font-medium tracking-wide transition-colors"
                    >
                      Weather data by Open-Meteo.com
                    </a>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Main App State */}
            {!isLanding && (
              <motion.div
                key="main"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="w-full flex flex-col items-center"
              >
                {/* Loading States */}
                {isLoading && !dashboardData && (
                  <div className="mt-24">
                    <Loader2 className="w-16 h-16 text-white/25 animate-spin" />
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div
                    className="max-w-[600px] w-full rounded-[18px] px-5 py-4 text-center"
                    style={{ background: "rgba(255,80,80,0.08)" }}
                  >
                    <p className="text-red-400/70 text-sm font-light">{error}</p>
                  </div>
                )}

                {/* Main content */}
                <AnimatePresence mode="wait">
                  {dashboardData && !error && (
                    <motion.div
                      key="card"
                      initial={{ opacity: 0, y: 24, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.55, type: "spring", stiffness: 72, damping: 16 }}
                      className="w-full space-y-4"
                    >
                      {/* Insight above */}
                      {dashboardData.analysis && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.2 }}
                          className={`text-white/90 text-[16px] font-medium text-center leading-relaxed px-3 max-w-[600px] mx-auto transition-opacity duration-300 drop-shadow-sm ${isLoading ? 'opacity-40' : 'opacity-100'}`}
                        >
                          {dashboardData.analysis}
                        </motion.p>
                      )}

                      {/* Date Widget */}
                      {dashboardData.resolvedDate && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 }}
                          className={`w-full max-w-[600px] mx-auto px-5 py-3.5 rounded-[20px] flex items-center justify-between transition-opacity duration-300 ${isLoading ? 'opacity-40' : 'opacity-100'}`}
                          style={{ background: "rgba(0,0,0,0.18)", backdropFilter: "blur(48px)", WebkitBackdropFilter: "blur(48px)" }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                              <CalendarDays className="w-4 h-4 text-white/80" />
                            </div>
                            <span className="text-white/60 text-[13px] font-medium tracking-wide">Date Focus</span>
                          </div>
                          <span className="text-white/90 text-[15px] font-medium tracking-wide">
                            {formatDateFocus(dashboardData.resolvedDate)}
                          </span>
                        </motion.div>
                      )}

                      {dashboardData.widgets.length > 0 && (
                        <div className={`space-y-3 transition-opacity duration-300 ${isLoading ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                          {dashboardData.widgets.map((widget, i) => {
                            const element = renderWidget(widget, i);
                            // Ensure we have a unique key even if element is null or widget.id is missing
                            return element ? React.cloneElement(element as React.ReactElement, { key: widget.id || `widget-${i}` }) : null;
                          })}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Search bar pinned underneath results */}
                <div className={`w-full max-w-[600px] mt-8 mb-4 space-y-4 transition-opacity duration-300 ${isLoading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                {/* Search input */}
                <form onSubmit={onSubmit} className="relative mb-4">
                  <div className="absolute top-3.5 left-0 pl-4 flex items-center pointer-events-none">
                    {isLoading
                      ? <Loader2 className="h-3.5 w-3.5 text-black/50 animate-spin" />
                      : <Search className="h-3.5 w-3.5 text-black/50" />
                    }
                  </div>
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    className="w-full pl-10 pr-11 py-3.5 rounded-[24px] text-black text-sm placeholder-black/40 focus:outline-none transition-all resize-none overflow-hidden block leading-relaxed"
                    style={{
                      background: "rgba(255,255,255,0.3)",
                      border: "1px solid rgba(255,255,255,0.09)",
                      backdropFilter: "blur(40px)",
                      WebkitBackdropFilter: "blur(40px)",
                      minHeight: '48px'
                    }}
                    placeholder="Ask a follow-up question…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={onKeyDown}
                    disabled={isLoading}
                  />
                  <button
                    type="submit"
                    disabled={!query.trim() || isLoading}
                    className="absolute bottom-1.5 right-1.5 p-2 rounded-full text-white/70 hover:text-white transition-all disabled:opacity-20 flex items-center justify-center"
                    style={{ background: "rgba(255,255,255,0.10)" }}
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </form>

                <div className="text-center pt-1">
                  <a
                    href="https://open-meteo.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-black/30 hover:text-black/50 text-[11px] font-medium tracking-wide transition-colors"
                  >
                    Weather data by Open-Meteo.com
                  </a>
                </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </div>
  );
};
