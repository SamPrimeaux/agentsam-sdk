import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ChevronRight, Download, FileCode, Folder, Globe, List, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { languageFromPath, uid } from "@/lib/utils";
import { downloadText } from "@/lib/work/bundle";
import { useActiveProject, useWorkStore } from "@/lib/work/store";
import type { Artifact, SideTab } from "@/lib/work/types";
import { cn } from "@/lib/utils";

const MonacoPane = lazy(() =>
  import("@/components/workbench/monaco-pane").then((m) => ({ default: m.MonacoPane })),
);

type TreeNode =
  | { type: "dir"; name: string; path: string; children: TreeNode[] }
  | { type: "file"; name: string; file: Artifact };

function buildTree(files: Artifact[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirs = new Map<string, TreeNode & { type: "dir" }>();

  const ensureDir = (parts: string[]) => {
    let list = root;
    let path = "";
    for (const part of parts) {
      path = path ? `${path}/${part}` : part;
      let node = dirs.get(path);
      if (!node) {
        node = { type: "dir", name: part, path, children: [] };
        dirs.set(path, node);
        list.push(node);
      }
      list = node.children;
    }
    return list;
  };

  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const parts = file.path.split("/").filter(Boolean);
    const name = parts.pop() ?? file.path;
    const list = parts.length ? ensureDir(parts) : root;
    list.push({ type: "file", name, file });
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) if (n.type === "dir") sortNodes(n.children);
  };
  sortNodes(root);
  return root;
}

function TreeRows({
  nodes,
  depth,
  selectedId,
  openDirs,
  onToggle,
  onSelect,
}: {
  nodes: TreeNode[];
  depth: number;
  selectedId: string | null;
  openDirs: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.type === "dir") {
          const open = openDirs.has(node.path);
          return (
            <div key={node.path}>
              <button
                type="button"
                className="flex min-h-10 w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/60"
                style={{ paddingLeft: 8 + depth * 12 }}
                onClick={() => onToggle(node.path)}
              >
                <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
                <Folder className="size-3.5 shrink-0 text-stone" />
                <span className="truncate">{node.name}</span>
              </button>
              {open ? (
                <TreeRows
                  nodes={node.children}
                  depth={depth + 1}
                  selectedId={selectedId}
                  openDirs={openDirs}
                  onToggle={onToggle}
                  onSelect={onSelect}
                />
              ) : null}
            </div>
          );
        }
        return (
          <button
            key={node.file.id}
            type="button"
            onClick={() => onSelect(node.file.id)}
            className={cn(
              "flex min-h-10 w-full items-center gap-2 rounded-md py-1.5 text-left text-xs",
              selectedId === node.file.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60",
            )}
            style={{ paddingLeft: 8 + depth * 12 + 16 }}
          >
            <FileCode className="size-3.5 shrink-0" />
            <span className="truncate">{node.name}</span>
          </button>
        );
      })}
    </>
  );
}

export function FilesStage({ tab }: { tab: SideTab }) {
  const navigate = useNavigate();
  const project = useActiveProject();
  const upsertFile = useWorkStore((s) => s.upsertFile);
  const deleteFile = useWorkStore((s) => s.deleteFile);
  const selectFile = useWorkStore((s) => s.selectFile);
  const openSideTab = useWorkStore((s) => s.openSideTab);
  const setBrowserSrcdoc = useWorkStore((s) => s.setBrowserSrcdoc);
  const selected = project.files.find((f) => f.id === tab.fileId) ?? project.files[0] ?? null;
  const [creating, setCreating] = useState(false);
  const [path, setPath] = useState("src/untitled.ts");
  const [mobileList, setMobileList] = useState(!selected);
  const [openDirs, setOpenDirs] = useState<Set<string>>(() => new Set(["src", "public", "functions", ".github"]));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const tree = useMemo(() => buildTree(project.files), [project.files]);

  function previewHtml(file: Artifact) {
    const id = openSideTab("browser", {
      title: file.path,
      ephemeral: false,
    });
    setBrowserSrcdoc(id, file.content, file.path);
    void navigate({ to: "/browse" });
  }

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <div
        className={cn(
          "flex min-h-0 flex-col border-border bg-sidebar md:w-56 md:shrink-0 md:border-r",
          mobileList ? "flex-1" : "hidden md:flex",
        )}
      >
        <div className="flex items-center gap-1 border-b border-border px-2 py-2">
          <p className="flex-1 truncate px-1 text-xs text-muted-foreground">Files</p>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="New file" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
          </Button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-1">
          {tree.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              Captured files land here when AgentSam or a co-worker writes code.
            </p>
          ) : (
            <TreeRows
              nodes={tree}
              depth={0}
              selectedId={selected?.id ?? null}
              openDirs={openDirs}
              onToggle={(dir) =>
                setOpenDirs((prev) => {
                  const next = new Set(prev);
                  if (next.has(dir)) next.delete(dir);
                  else next.add(dir);
                  return next;
                })
              }
              onSelect={(id) => {
                selectFile(id);
                setMobileList(false);
              }}
            />
          )}
        </div>
      </div>

      <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", mobileList && "hidden md:flex")}>
        {selected ? (
          <>
            <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="md:hidden"
                aria-label="Back to file list"
                onClick={() => setMobileList(true)}
              >
                <List className="size-4" />
              </Button>
              <span className="min-w-0 flex-1 truncate px-1 font-mono text-xs text-muted-foreground">
                {selected.path}
              </span>
              {selected.language === "html" || selected.path.endsWith(".html") ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Preview in browser"
                  onClick={() => previewHtml(selected)}
                >
                  <Globe className="size-4" />
                </Button>
              ) : null}
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Download"
                onClick={() => downloadText(selected.content, selected.path.split("/").pop() || selected.path)}
              >
                <Download className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Delete file"
                onClick={() => {
                  deleteFile(project.id, selected.id);
                  setMobileList(true);
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              {!mounted ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Opening Monaco
                </div>
              ) : (
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      Opening Monaco
                    </div>
                  }
                >
                  <MonacoPane
                    file={selected}
                    onChange={(value) =>
                      upsertFile(project.id, {
                        ...selected,
                        content: value,
                        updatedAt: Date.now(),
                        origin: "editor",
                      })
                    }
                  />
                </Suspense>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <FileCode className="mb-3 size-8 text-stone" />
            <h2 className="text-base font-medium">No file open</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground text-pretty">
              Ask the lead agent or a co-worker to write something, or add a file of your own.
            </p>
            <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => setCreating(true)}>
              New file
            </Button>
          </div>
        )}
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogTitle>New file</DialogTitle>
          <DialogDescription>Stored on this project and opened in Monaco.</DialogDescription>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const next = path.trim().replace(/^\/+/, "");
              if (!next) return;
              const file = {
                id: uid(),
                path: next,
                language: languageFromPath(next),
                content: "",
                updatedAt: Date.now(),
                kind: next.endsWith(".html") ? ("preview" as const) : ("code" as const),
                origin: "editor" as const,
              };
              upsertFile(project.id, file);
              const saved = useWorkStore
                .getState()
                .projects.find((p) => p.id === project.id)
                ?.files.find((f) => f.path === next);
              if (saved) {
                selectFile(saved.id);
                setMobileList(false);
              }
              setCreating(false);
            }}
          >
            <Input value={path} onChange={(e) => setPath(e.target.value)} autoFocus />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
