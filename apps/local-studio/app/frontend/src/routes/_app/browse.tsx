import { useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BrowserStage } from "@/components/workbench/browser";
import { useWorkStore } from "@/lib/work/store";
import type { SideTab } from "@/lib/work/types";

export const Route = createFileRoute("/_app/browse")({
  component: BrowsePage,
});

function BrowsePage() {
  const sideTabs = useWorkStore((s) => s.sideTabs);
  const openSideTab = useWorkStore((s) => s.openSideTab);

  useEffect(() => {
    if (!useWorkStore.getState().sideTabs.some((t) => t.kind === "browser")) {
      openSideTab("browser", { ephemeral: false });
    }
  }, [openSideTab]);

  const tab = useMemo((): SideTab => {
    const existing = sideTabs.find((t) => t.kind === "browser");
    if (existing) return existing;
    return {
      id: "browse-page",
      kind: "browser",
      title: "Browser",
      ephemeral: false,
      messages: [],
      parentTrailId: null,
      keptTrailId: null,
      url: "",
      srcdoc: null,
      fileId: null,
      history: [],
      historyIndex: -1,
      reportToLead: false,
    };
  }, [sideTabs]);

  return (
    <div className="h-full min-h-0">
      <BrowserStage tab={tab} />
    </div>
  );
}
