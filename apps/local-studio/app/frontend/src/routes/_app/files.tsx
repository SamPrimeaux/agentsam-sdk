import { useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FilesStage } from "@/components/workbench/files";
import { useWorkStore } from "@/lib/work/store";
import type { SideTab } from "@/lib/work/types";

export const Route = createFileRoute("/_app/files")({
  component: FilesPage,
});

function FilesPage() {
  const sideTabs = useWorkStore((s) => s.sideTabs);
  const openSideTab = useWorkStore((s) => s.openSideTab);
  const activeProjectId = useWorkStore((s) => s.activeProjectId);
  const projects = useWorkStore((s) => s.projects);
  const project = projects.find((p) => p.id === activeProjectId) ?? projects[0]!;

  useEffect(() => {
    if (!useWorkStore.getState().sideTabs.some((t) => t.kind === "files")) {
      openSideTab("files", { ephemeral: false, fileId: project.files[0]?.id ?? null });
    }
  }, [openSideTab, project.files]);

  const tab = useMemo((): SideTab => {
    const existing = sideTabs.find((t) => t.kind === "files");
    if (existing) return existing;
    return {
      id: "files-page",
      kind: "files",
      title: "Files",
      ephemeral: false,
      messages: [],
      parentTrailId: null,
      keptTrailId: null,
      url: "",
      srcdoc: null,
      fileId: project.files[0]?.id ?? null,
      history: [],
      historyIndex: -1,
      reportToLead: false,
    };
  }, [sideTabs, project.files]);

  return (
    <div className="h-full min-h-0">
      <FilesStage tab={tab} />
    </div>
  );
}
