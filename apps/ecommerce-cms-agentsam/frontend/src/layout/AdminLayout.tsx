import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";

declare global {
  interface Window {
    renderShell: (path: string, content: string, options?: { fullBleed?: boolean }) => void;
    hydrateShellNav: (user: unknown, path: string) => void;
    __shellUser?: unknown;
    startEcommerceInspector?: () => void;
  }
}

// The app-owned shell is mounted once before React starts. React owns only the
// content mount, so there is no second viewport-sized root or portal lifecycle.
export default function AdminLayout() {
  const location = useLocation();

  useEffect(() => {
    document.body.classList.remove("admin-nav-open");
    if (window.__shellUser) {
      window.hydrateShellNav(window.__shellUser, "/admin" + location.pathname);
    }
  }, [location.pathname]);

  return <Outlet />;
}
