import { Box, Cloud, FileCode, Globe, Trash2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { shortTime } from "@/lib/utils";
import { useActiveProject, useWorkStore } from "@/lib/work/store";
import type { Artifact } from "@/lib/work/types";
import { cn } from "@/lib/utils";

function kindOf(file: Artifact) {
  if (file.kind) return file.kind;
  if (file.path.endsWith(".html")) return "preview";
  if (file.path.includes(".agentsam/deploys")) return "deploy";
  return "code";
}

export function ArtifactsStage() {
  const navigate = useNavigate();
  const project = useActiveProject();
  const selectFile = useWorkStore((s) => s.selectFile);
  const deleteFile = useWorkStore((s) => s.deleteFile);
  const openSideTab = useWorkStore((s) => s.openSideTab);
  const files = [...project.files].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium">Artifacts</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Files, previews, and deploys captured on this project.
        </p>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
        {files.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <Box className="mb-3 size-8 text-stone" />
            <h3 className="text-sm font-medium">Nothing captured yet</h3>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Code from trails, HTML previews, and ship receipts land here.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {files.map((file) => {
              const kind = kindOf(file);
              return (
                <li
                  key={file.id}
                  className="group flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-muted/60"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => {
                      if (kind === "preview") {
                        openSideTab("browser", {
                          title: file.path,
                          srcdoc: file.content,
                          ephemeral: false,
                        });
                        void navigate({ to: "/browse" });
                        return;
                      }
                      if (kind === "deploy" && file.url) {
                        openSideTab("browser", {
                          url: file.url,
                          title: file.title ?? "Deploy",
                          ephemeral: false,
                        });
                        void navigate({ to: "/browse" });
                        return;
                      }
                      selectFile(file.id);
                      void navigate({ to: "/files" });
                    }}
                  >
                    {kind === "deploy" ? (
                      <Cloud className="size-3.5 shrink-0 text-stone" />
                    ) : kind === "preview" ? (
                      <Globe className="size-3.5 shrink-0 text-stone" />
                    ) : (
                      <FileCode className="size-3.5 shrink-0 text-stone" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{file.title ?? file.path}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {kind} · {shortTime(file.updatedAt)}
                      </span>
                    </span>
                  </button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className={cn("opacity-0 group-hover:opacity-100 max-md:opacity-100")}
                    aria-label={`Delete ${file.path}`}
                    onClick={() => deleteFile(project.id, file.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
