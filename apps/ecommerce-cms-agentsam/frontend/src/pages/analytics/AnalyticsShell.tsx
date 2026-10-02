import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { RangePicker } from "@inneranimalmedia/commerce-analytics";
import type { AnalyticsOutletContext } from "../../App";
import type { RangeKey } from "../../lib/types";

const TITLES: Record<string, string> = {
  overview: "Overview",
  finance: "Finance",
  health: "Health",
};

export default function AnalyticsShell() {
  const [range, setRange] = useState<RangeKey>("30d");
  const location = useLocation();
  const segment = location.pathname.split("/").pop() || "overview";

  useEffect(() => {
    const title = TITLES[segment] || "Analytics";
    document.title = `${title} — Fuel & Free Time Admin`;
  }, [segment]);

  return (
    <div className="embed embed--light-shell" style={{ minHeight: "100%" }}>
      <div className="embed-bar embed-bar--range-only">
        <RangePicker value={range} onChange={setRange} />
      </div>
      <div className="page">
        <Outlet context={{ range, setRange } satisfies AnalyticsOutletContext} />
      </div>
    </div>
  );
}
