import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Download, FileCode, Folder, Globe, List, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { languageFromPath, uid } from "@/lib/utils";
import { downloadText } from "@/lib/work/bundle";
import { buildWorkspacePreview } from "@/lib/work/workspace-preview";
import { useActiveProject, useWorkStore } from "@/lib/work/store";
import type { Artifact, SideTab } from "@inneranimalmedia/agentsam-local-shared";
import { WorkspaceSaveQueue, type SaveStatus } from "@inneranimalmedia/agentsam-ide/workspace";
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
  const project = useActiveProject();
  const upsertFile = useWorkStore((s) => s.upsertFile);
  const deleteFile = useWorkStore((s) => s.deleteFile);
  const selectFile = useWorkStore((s) => s.selectFile);
  const openSideTab = useWorkStore((s) => s.openSideTab);
  const setBrowserSrcdoc = useWorkStore((s) => s.setBrowserSrcdoc);
  const isFilesystem = project.kind === "filesystem";
  const selected = project.files.find((f) => f.id === tab.fileId) ?? project.files[0] ?? null;
  const [creating, setCreating] = useState(false);
  const [path, setPath] = useState("src/untitled.ts");
  const [mobileList, setMobileList] = useState(!selected);
  const [openDirs, setOpenDirs] = useState<Set<string>>(() => new Set());
  const [mounted, setMounted] = useState(false);
  const [fsError, setFsError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveStatus>("saved");
  const [versions, setVersions] = useState<Record<string, string>>({});
  const selectedPathRef = useRef<string | null>(selected?.path ?? null);
  selectedPathRef.current = selected?.path ?? null;
  const saveQueue = useMemo(() => new WorkspaceSaveQueue({
    debounceMs: 700,
    write: async (filePath, content, expectedVersion, overwrite) => {
      if (!project.runtimeBaseUrl) return { ok: false as const, error: 'filesystem_runtime_unavailable' };
      const { RuntimeFilesystemAdapter } = await import("@/lib/work/workspace-fs");
      const adapter = new RuntimeFilesystemAdapter(project.runtimeBaseUrl, project.runtimeCapability);
      return adapter.write(filePath, content, expectedVersion, overwrite);
    },
    onStatus: (filePath, status, reason) => {
      if (selectedPathRef.current !== filePath) return;
      setSaveState(status);
      if (status === 'conflict') setConflict(reason || 'File changed on disk. Reload or overwrite intentionally.');
      if (status === 'error') setFsError(reason || 'Could not save the file.');
      if (status === 'saved') { setConflict(null); setFsError(null); }
    },
    onCommitted: (filePath, content, result, superseded) => {
      setVersions(previous => ({ ...previous, [filePath]: result.version }));
      if (superseded) return; // Never restore a stale snapshot over newer typing.
      const current = useWorkStore.getState().projects.find(p => p.id === project.id)?.files.find(f => f.path === filePath);
      if (current?.content !== content) return;
      upsertFile(project.id, { ...current, updatedAt: result.mtime || Date.now(), origin: 'editor' });
    },
  }), [project.id, project.runtimeBaseUrl, project.runtimeCapability, upsertFile]);

  useEffect(() => () => { void saveQueue.flushAll(); }, [saveQueue]);
  useEffect(() => {
    if (!isFilesystem || !selected) return;
    const status = saveQueue.status(selected.path);
    setSaveState(status);
    setConflict(status === 'conflict' ? 'File changed on disk. Reload or overwrite intentionally.' : null);
  }, [selected?.path, isFilesystem, saveQueue]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isFilesystem || !project.runtimeBaseUrl) return;
    let cancelled = false;
    (async () => {
      const { RuntimeFilesystemAdapter } = await import("@/lib/work/workspace-fs");
      const adapter = new RuntimeFilesystemAdapter(
        project.runtimeBaseUrl!,
        project.runtimeCapability,
      );
      const listed = await adapter.list(".", true);
      const source = listed;
      if (cancelled) return;
      if (!source.ok) {
        setFsError(`${source.error}. Run: agentsam start-local`);
        return;
      }
      setFsError(null);
      const stubs = (source.entries as Array<{ path: string; kind: string; mtime?: number }>)
        .filter((e) => e.kind === "file")
        .slice(0, 800)
        .map((e) => ({
          id: `fs:${e.path}`,
          path: e.path,
          language: languageFromPath(e.path),
          content: "",
          updatedAt: e.mtime || Date.now(),
          kind: "code" as const,
          origin: "editor" as const,
        }));
      useWorkStore.getState().patchProject(project.id, (p) => ({ ...p, files: stubs }));
    })().catch((err) => {
      if (!cancelled) setFsError(err instanceof Error ? err.message : String(err));
    });
    return () => {
      cancelled = true;
    };
  }, [isFilesystem, project.id, project.runtimeBaseUrl, project.runtimeCapability, project.workspaceRoot]);

  useEffect(() => {
    if (!isFilesystem || !selected || !project.runtimeBaseUrl) return;
    if (selected.content) return;
    let cancelled = false;
    (async () => {
      const { RuntimeFilesystemAdapter } = await import("@/lib/work/workspace-fs");
      const adapter = new RuntimeFilesystemAdapter(
        project.runtimeBaseUrl!,
        project.runtimeCapability,
      );
      const doc = await adapter.read(selected.path);
      if (cancelled) return;
      if (!doc.ok) {
        setFsError(doc.error);
        return;
      }
      setVersions((v) => ({ ...v, [selected.path]: doc.version }));
      saveQueue.acceptDiskVersion(selected.path, doc.version);
      // Late initial read must not overwrite keystrokes already entered in Monaco.
      if (saveQueue.status(selected.path) !== 'saved') return;
      upsertFile(project.id, {
        ...selected,
        content: doc.content,
        updatedAt: doc.mtime || Date.now(),
        origin: "editor",
      });
      setSaveState("saved");
      setConflict(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [isFilesystem, selected?.id, selected?.path, project.runtimeBaseUrl, project.runtimeCapability]);

  // External change detection: re-read version; never silent-overwrite on save.
  useEffect(() => {
    if (!isFilesystem || !selected || !project.runtimeBaseUrl || !project.runtimeCapability) return;
    let cancelled = false;
    const check = async () => {
      const known = versions[selected.path];
      if (!known) return;
      const { RuntimeFilesystemAdapter } = await import("@/lib/work/workspace-fs");
      const adapter = new RuntimeFilesystemAdapter(
        project.runtimeBaseUrl!,
        project.runtimeCapability,
      );
      const doc = await adapter.read(selected.path);
      if (cancelled || !doc.ok) return;
      if (doc.version !== known) {
        if (saveQueue.status(selected.path) !== 'saved') {
          setSaveState("conflict");
          setConflict("Disk changed while this buffer was dirty. Reload or overwrite intentionally.");
        } else {
          setVersions((v) => ({ ...v, [selected.path]: doc.version }));
          saveQueue.acceptDiskVersion(selected.path, doc.version);
          upsertFile(project.id, {
            ...selected,
            content: doc.content,
            updatedAt: doc.mtime || Date.now(),
            origin: "editor",
          });
          setSaveState("saved");
          setConflict(null);
        }
      }
    };
    const onFocus = () => {
      void check();
    };
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => {
      void check();
    }, 2500);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [
    isFilesystem,
    selected?.path,
    selected?.id,
    versions,
    saveState,
    project.runtimeBaseUrl,
    project.runtimeCapability,
    project.id,
  ]);

  const tree = useMemo(() => buildTree(project.files), [project.files]);

  function previewHtml(file: Artifact) {
    const id = openSideTab("browser", {
      title: file.path,
      ephemeral: false,
    });
    setBrowserSrcdoc(id, buildWorkspacePreview(file, project.files), file.path);
    // Remain in the lead conversation: the existing side pane owns this preview.
  }

  async function saveFilesystem(file: Artifact, value: string, overwrite = false) {
    if (!project.runtimeBaseUrl) return;
    if (!overwrite && saveQueue.status(file.path) === 'saved' && file.content === value) return;
    saveQueue.edit(file.path, value);
    await saveQueue.flush(file.path, overwrite);
  }

  function onEditorChange(value: string) {
    if (!selected) return;
    if (isFilesystem) {
      upsertFile(project.id, {
        ...selected,
        content: value,
        updatedAt: Date.now(),
        origin: "editor",
      });
      saveQueue.edit(selected.path, value);
      return;
    }
    upsertFile(project.id, {
      ...selected,
      content: value,
      updatedAt: Date.now(),
      origin: "editor",
    });
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
          <p className="flex-1 truncate px-1 text-xs text-muted-foreground">
            {isFilesystem ? "Filesystem" : "Files · Scratch"}
          </p>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="New file" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
          </Button>
        </div>
        {fsError ? <p className="px-2 py-2 text-[11px] text-red-400">{fsError}</p> : null}
        <div className="scrollbar-thin flex-1 overflow-y-auto p-1">
          {tree.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              {isFilesystem
                ? "Connect a local runtime (agentsam start-local) to list host files."
                : "Captured files land here when AgentSam or a co-worker writes code."}
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
                {isFilesystem ? ` · ${saveState}` : ""}
              </span>
              {conflict ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      if (!project.runtimeBaseUrl || !selected) return;
                      const { RuntimeFilesystemAdapter } = await import("@/lib/work/workspace-fs");
                      const adapter = new RuntimeFilesystemAdapter(
                        project.runtimeBaseUrl,
                        project.runtimeCapability,
                      );
                      const doc = await adapter.read(selected.path);
                      if (doc.ok) {
                        setVersions((v) => ({ ...v, [selected.path]: doc.version }));
                        saveQueue.discardDraft(selected.path, doc.version);
                        upsertFile(project.id, { ...selected, content: doc.content, updatedAt: doc.mtime });
                        setConflict(null);
                        setSaveState("saved");
                      }
                    }}
                  >
                    Reload disk
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => void saveFilesystem(selected, selected.content, true)}
                  >
                    Overwrite
                  </Button>
                </>
              ) : null}
              {selected.language === "html" || selected.path.endsWith(".html") ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Preview rendered page"
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
                  if (isFilesystem && project.runtimeBaseUrl) {
                    void (async () => {
                      const { RuntimeFilesystemAdapter } = await import("@/lib/work/workspace-fs");
                      const adapter = new RuntimeFilesystemAdapter(
                        project.runtimeBaseUrl!,
                        project.runtimeCapability,
                      );
                      await adapter.remove(selected.path, versions[selected.path]);
                      deleteFile(project.id, selected.id);
                      setMobileList(true);
                    })();
                    return;
                  }
                  deleteFile(project.id, selected.id);
                  setMobileList(true);
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            {conflict ? <p className="border-b border-border px-3 py-1.5 text-[11px] text-amber-300">{conflict}</p> : null}
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
                  <MonacoPane file={selected} workspaceId={project.id} onChange={onEditorChange}
                    onSave={(text) => isFilesystem ? saveFilesystem(selected, text) : undefined} />
                </Suspense>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <FileCode className="mb-3 size-8 text-stone" />
            <h2 className="text-base font-medium">No file open</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground text-pretty">
              {isFilesystem
                ? "Select a host file, or create one on the authorized workspace root."
                : "Ask the lead agent or a co-worker to write something, or add a file of your own."}
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
          <DialogDescription>
            {isFilesystem
              ? "Creates a real file on the authorized host workspace."
              : "Stored on this Scratch project and opened in Monaco."}
          </DialogDescription>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const next = path.trim().replace(/^\/+/, "");
              if (!next) return;
              if (isFilesystem && project.runtimeBaseUrl) {
                void (async () => {
                  const { RuntimeFilesystemAdapter } = await import("@/lib/work/workspace-fs");
                  const adapter = new RuntimeFilesystemAdapter(
                    project.runtimeBaseUrl!,
                    project.runtimeCapability,
                  );
                  const created = await adapter.create(next, "");
                  if (!created.ok) {
                    setFsError(created.error);
                    return;
                  }
                  const file = {
                    id: `fs:${next}`,
                    path: next,
                    language: languageFromPath(next),
                    content: "",
                    updatedAt: Date.now(),
                    kind: next.endsWith(".html") ? ("preview" as const) : ("code" as const),
                    origin: "editor" as const,
                  };
                  setVersions((v) => ({ ...v, [next]: created.version }));
                  saveQueue.acceptDiskVersion(next, created.version);
                  upsertFile(project.id, file);
                  selectFile(file.id);
                  setCreating(false);
                  setMobileList(false);
                })();
                return;
              }
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
