import { createFileRoute } from "@tanstack/react-router";
import { TerminalPane } from "@/components/workbench/terminal";

/**
 * Full-page placement for the same underlying terminal session used by the
 * drawer and side panel.
 */
export const Route = createFileRoute("/(apps)/cli")({
  component: TerminalWorkspacePage,
});

export function TerminalWorkspacePage() {
  return (
    <div className="h-full min-h-0 bg-background">
      <TerminalPane variant="page" />
    </div>
  );
}
