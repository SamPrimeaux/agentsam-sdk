/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from "react";
import { Wind, Droplets, Sun, CloudRain, Thermometer, Eye, Gauge, Snowflake } from "lucide-react";
import { motion } from "motion/react";
import { DashboardWidget } from "../services/orchestrator";

function getIcon(title: string) {
  const t = title.toLowerCase();
  if (t.includes("wind") || t.includes("gust")) return <Wind className="w-3 h-3" />;
  if (t.includes("humid")) return <Droplets className="w-3 h-3" />;
  if (t.includes("uv")) return <Sun className="w-3 h-3" />;
  if (t.includes("rain") || t.includes("precip") || t.includes("shower")) return <CloudRain className="w-3 h-3" />;
  if (t.includes("snow") || t.includes("frost")) return <Snowflake className="w-3 h-3" />;
  if (t.includes("visibility")) return <Eye className="w-3 h-3" />;
  if (t.includes("pressure")) return <Gauge className="w-3 h-3" />;
  return <Thermometer className="w-3 h-3" />;
}

function fmt(v: string | number | undefined | null, dec = 0) {
  if (v === undefined || v === null) return "—";
  if (typeof v === "number") {
    if (isNaN(v)) return "—";
    // If it's a very large number, or very small, just stringify it
    // if the user requests 0 decimals, use Math.round to avoid things like 10.000001 becoming 10
    return v.toFixed(dec);
  }
  return String(v);
}

interface Props {
  city: string | null;
  widgets: DashboardWidget[];
  analysis: string;
}

export const WeatherCard: React.FC<Props> = ({ city, widgets, analysis }) => {
  const kpis = widgets.filter(w => w.type === "kpi");
  const main = kpis[0];
  const subs = kpis.slice(1, 5);

  return (
    <div className="w-full max-w-[600px] mx-auto flex flex-col sm:flex-row gap-3">
      {/* Left: weather content */}
      <div
        className="w-full sm:w-[50%] p-5 min-w-0 rounded-[24px]"
        style={{ background: "rgba(0,0,0,0.18)", backdropFilter: "blur(48px)", WebkitBackdropFilter: "blur(48px)" }}
      >
        {/* Header: city then temp stacked */}
        <div className="mb-5">
          <h2 className="text-white/90 text-[15px] font-medium leading-tight truncate mb-2">{city || "—"}</h2>
          {main && main.value !== undefined && main.value !== null && (
            <div className="flex items-start">
              <span className="text-white text-[64px] font-thin leading-none tracking-tighter">
                {fmt(main.value, 0)}
              </span>
              {main.unit && (
                <span className="text-white/40 text-[15px] mt-2 ml-0.5">{main.unit}</span>
              )}
            </div>
          )}
        </div>

        {/* 2×2 sub-metric grid */}
        {subs.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {subs.map((w, i) => (
              <motion.div
                key={w.id || `sub-${i}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 + 0.2 }}
                className="rounded-[14px] px-4 py-3.5"
                style={{ background: "rgba(0,0,0,0.15)" }}
              >
                <div className="flex items-center gap-1.5 text-white/35 text-[11px] mb-2.5">
                  {getIcon(w.title)}
                  <span className="truncate">{w.title}</span>
                </div>
                <p className="text-white text-[22px] font-light leading-none">
                  {w.value !== undefined && w.value !== null ? fmt(w.value, 0) : "—"}
                  {w.unit && w.value !== undefined && w.value !== null && (
                    <span className="text-white/40 text-[13px] ml-1">{w.unit}</span>
                  )}
                </p>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Right: Google Maps */}
      <div className="w-full sm:w-[50%] h-[200px] sm:h-auto shrink-0 rounded-[24px] overflow-hidden" style={{ backdropFilter: "blur(48px)", WebkitBackdropFilter: "blur(48px)" }}>
        <iframe
          title={`Map of ${city}`}
          src={`https://maps.google.com/maps?q=${encodeURIComponent(city || "weather")}&output=embed&z=12`}
          className="w-full h-full border-0"
          loading="lazy"
          allowFullScreen
        />
      </div>
    </div>
  );
};
