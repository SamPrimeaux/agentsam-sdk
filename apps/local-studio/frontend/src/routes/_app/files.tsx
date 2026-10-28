import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useWorkStore } from "@/lib/work/store";

/** Compatibility route: Files is an IDE side-stage, never a second full-page editor. */
export const Route = createFileRoute("/_app/files")({ component: OpenFilesInAgentSam });

function OpenFilesInAgentSam() {
  const navigate = useNavigate();
  const openSideTab = useWorkStore((s) => s.openSideTab);
  useEffect(() => {
    openSideTab("files", { ephemeral: false, title: "Files" });
    void navigate({ to: "/admin/agentsam", replace: true });
  }, [navigate, openSideTab]);
  return null;
}
