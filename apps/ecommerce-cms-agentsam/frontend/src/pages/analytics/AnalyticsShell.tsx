import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { RangePicker } from "@inneranimalmedia/analytics-ui";
import type { AnalyticsOutletContext } from "../../App";
import type { RangeKey } from "../../lib/types";

const TITLES: Record<string, string> = {
  overview: "Overview",
  finance: "Finance",
  health: "Health",
  security: "Security",
};

export default function AnalyticsShell() {
  const [range, setRange] = useState<RangeKey>("30d");
  const location = useLocation();
  const segment = location.pathname.split("/").pop() || "overview";

  useEffect(() => {
    const title = TITLES[segment] || "Analytics";
    document.title = `${title} — Ecommerce Analytics`;
  }, [segment]);

  return (
    <div className="embed embed--light-shell" style={{ minHeight: "100%" }}>
      <div className="embed-bar embed-bar--range-only">
        <nav aria-label="Analytics views" style={{display:"flex",gap:"0.75rem",flexWrap:"wrap"}}>
          {Object.entries(TITLES).map(([key,label])=><NavLink key={key} to={"/analytics/"+key} className={({isActive})=>isActive?"btn active":"btn"}>{label}</NavLink>)}
        </nav>
        <RangePicker value={range} onChange={setRange} />
      </div>
      <div className="page">
        <Outlet context={{ range, setRange } satisfies AnalyticsOutletContext} />
      </div>
    </div>
  );
}
