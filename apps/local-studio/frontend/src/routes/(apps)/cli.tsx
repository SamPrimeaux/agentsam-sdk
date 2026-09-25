import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useWorkStore } from "@/lib/work/store";

/**
 * /cli is retired as a product destination. Redirect into the shared CLI drawer.
 */
export const Route = createFileRoute("/(apps)/cli")({
  component: CliRedirect,
});

function CliRedirect() {
  useEffect(() => {
    useWorkStore.getState().setTerminalOpen(true);
  }, []);
  return <Navigate to="/agentsam" replace />;
}
