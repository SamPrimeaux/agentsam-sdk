import { Box, Cloud, FileCode, FileText, Globe, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { shortTime, uid } from "@/lib/utils";
import { useActiveProject, useWorkStore } from "@/lib/work/store";
import { buildWorkspacePreview } from "@/lib/work/workspace-preview";
import type { Artifact, SideTab } from "@inneranimalmedia/agentsam-local-shared";
import { ArtifactDocumentEditor, isEditableDocument } from "./document-editor";
import { RuntimeFilesystemAdapter } from "@/lib/work/workspace-fs";
import "./document-editor.css";
import { cn } from "@/lib/utils";

function kindOf(file: Artifact) {
  if (file.kind) return file.kind;
  if (file.path.endsWith(".html")) return "preview";
  if (file.path.includes(".agentsam/deploys")) return "deploy";
  return "code";
}

export function ArtifactsStage({tab}: {tab?:SideTab}) {
  const navigate = useNavigate();
  const project = useActiveProject();
  const selectFile = useWorkStore((s) => s.selectFile);
  const deleteFile = useWorkStore((s) => s.deleteFile);
  const openSideTab = useWorkStore((s) => s.openSideTab);
  const files = [...(project?.files ?? [])].sort((a, b) => b.updatedAt - a.updatedAt);
  const [documentId, setDocumentId] = useState<string | null>(tab?.fileId ?? null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const chatId = useWorkStore(s=>s.activeChatId);
  const upsertFile = useWorkStore(s=>s.upsertFile);
  const selectedDocument = files.find(file => file.id === documentId);
  useEffect(() => {if (tab?.fileId) setDocumentId(tab.fileId);}, [tab?.fileId]);

  async function createDocument(sourceContent?:string, sourceTitle?:string) {
    if (!project || creating) return;
    setCreating(true);setCreateError(null);
    const id = uid();
    const path = 'document-' + id.replace(/[^a-z0-9_-]/gi,'').slice(0,18) + '.agentdoc.html';
    const title = sourceTitle ? sourceTitle.replace(/\.[^.]+$/, '') + ' · Document' : 'Untitled document';
    const content = sourceContent || '<h1>Untitled document</h1><p></p>';
    try {
      if (project.kind === 'filesystem') {
        if (!project.runtimeBaseUrl || !project.runtimeCapability)
          throw new Error('Connect the authorized file source to create this document.');
        const adapter = new RuntimeFilesystemAdapter(project.runtimeBaseUrl,project.runtimeCapability);
        const result = await adapter.create(path,content);
        if (!result.ok) throw new Error('Could not create a document in this project.');
      }
      upsertFile(project.id,{ id, path, title, language:'html', content,
        updatedAt:Date.now(),kind:'code',origin:'editor',chatId:chatId || undefined });
      setDocumentId(id);
    } catch(error) {
      setCreateError(error instanceof Error ? error.message : 'Could not create document.');
    } finally {setCreating(false);}
  }
  const supportsDocumentPreview = (file:Artifact) => isEditableDocument(file.path) || /\.(md|markdown|txt)$/.test(file.path);
  if (project && selectedDocument && supportsDocumentPreview(selectedDocument)) {
    return <ArtifactDocumentEditor file={selectedDocument} project={project} chatId={chatId}
      onClose={()=>setDocumentId(null)} onEditCopy={(content,title)=>createDocument(content,title)}/>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Outputs</h2>
          {project ? <Button type="button" size="sm" variant="outline" disabled={creating}
            aria-label="Create document" onClick={()=>void createDocument()}>
            <Plus className="size-4" /> Document
          </Button> : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Open a saved document, file, preview, or deployment.
        </p>
        {createError ? <p role="alert" className="mt-2 text-xs text-destructive">{createError}</p> : null}
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
        {files.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <Box className="mb-3 size-8 text-stone" />
            <h3 className="text-sm font-medium">Nothing captured yet</h3>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Code from chats, HTML previews, and ship receipts land here.
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
                      if (supportsDocumentPreview(file)) { setDocumentId(file.id); return; }
                      if (kind === "preview") {
                        openSideTab("browser", {
                          title: file.path,
                          srcdoc: buildWorkspacePreview(file, project?.files ?? []),
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
                      useWorkStore.getState().openSideTab("files", { ephemeral: false });
                    }}
                  >
                    {supportsDocumentPreview(file) ? (
                      <FileText className="size-3.5 shrink-0 text-stone" />
                    ) : kind === "deploy" ? (
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
                    onClick={() => { if (project) deleteFile(project.id, file.id); }}
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
