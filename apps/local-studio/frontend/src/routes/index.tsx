import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: CanonicalLandingRedirect,
});

function CanonicalLandingRedirect() {
  useEffect(() => {
    // The canonical public landing page is served directly by the Cloudflare Worker at / with edge-injected partials.
    // When navigated to within the SPA router, trigger a full location reload to reach the canonical edge-rendered page.
    if (typeof window !== "undefined") {
      window.location.replace("/");
    }
  }, []);

  return null;
}
