import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { Navigate, Route, Routes, useOutletContext, useParams } from "react-router-dom";
import AdminLayout from "./layout/AdminLayout";
import type { RangeKey } from "./lib/types";

const AnalyticsShell = lazy(() => import("./pages/analytics/AnalyticsShell"));
const OverviewPage = lazy(() => import("./pages/analytics/OverviewPage"));
const FinancePage = lazy(() => import("./pages/analytics/FinancePage"));
const HealthPage = lazy(() => import("./pages/analytics/HealthPage"));
const AccountPage = lazy(() => import("./pages/account/AccountPage"));
const ProductStudioPage = lazy(() => import("./pages/products/ProductStudioPage"));
const ArtworkHelpPage = lazy(() => import("./pages/products/ArtworkHelpPage"));

export type AnalyticsOutletContext = {
  range: RangeKey;
  setRange: (r: RangeKey) => void;
};

function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ minHeight: "35vh", display: "grid", placeItems: "center", padding: "2rem" }}
    >
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to="analytics/overview" replace />} />
          <Route path="analytics" element={<AnalyticsShell />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<AnalyticsRoute page={OverviewPage} title="Overview" />} />
            <Route path="finance" element={<AnalyticsRoute page={FinancePage} title="Finance" />} />
            <Route path="health" element={<AnalyticsRoute page={HealthPage} title="Health" />} />
          </Route>
          <Route path="account" element={<AccountRoute />} />
          <Route path="products/create" element={<ProductStudioRoute />} />
          <Route path="products/create/:productId" element={<ProductStudioRoute />} />
          <Route path="products/help/artwork" element={<ArtworkHelpPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/analytics/overview" replace />} />
      </Routes>
    </Suspense>
  );
}

function AccountRoute() {
  useEffect(() => {
    document.title = "Account — Fuel & Free Time Admin";
  }, []);
  return <AccountPage />;
}

function ProductStudioRoute() {
  const { productId } = useParams();
  useEffect(() => {
    document.title = "Create & Explore Designs — Fuel & Free Time Admin";
  }, []);
  return <ProductStudioPage key={productId || "catalog"} />;
}

function AnalyticsRoute({
  page: Page,
  title,
}: {
  page: ComponentType<{ range: RangeKey; tenant?: string }>;
  title: string;
}) {
  const { range } = useOutletContext<AnalyticsOutletContext>();
  useEffect(() => {
    document.title = `${title} — Fuel & Free Time Admin`;
  }, [title]);
  return <Page range={range} tenant="all" />;
}
