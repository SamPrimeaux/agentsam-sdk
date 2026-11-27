import { useMemo, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, FileCode, Globe, Play } from "lucide-react";
import { useState } from "react";
import { cn, languageFromPath } from "@/lib/utils";
import { extractArtifacts } from "@/lib/work/files";
import { buildWorkspacePreview } from "@/lib/work/workspace-preview";
import type { Artifact } from "@inneranimalmedia/agentsam-local-shared";
import { useWorkStore } from "@/lib/work/store";
import { Button } from "@/components/ui/button";
import { InlineSvgPreview } from "@inneranimalmedia/agentsam-workbench/agent";
import { ImageLightbox } from "@/components/workbench/image-lightbox";
import { Composer } from "@/components/workbench/composer";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      aria-label={copied ? "Copied" : "Copy"}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

const SHELL_LANGS = new Set(["bash", "sh", "zsh", "shell", "cli", "console"]);

function CodeBlock({
  language,
  text,
  artifactHint,
}: {
  language: string;
  text: string;
  artifactHint?: Artifact;
}) {
  const selectFile = useWorkStore((s) => s.selectFile);
  const upsertFile = useWorkStore((s) => s.upsertFile);
  const enqueueCommand = useWorkStore((s) => s.enqueueCommand);
  const artifacts = useMemo(() => extractArtifacts("```" + language + "\n" + text + "\n```"), [language, text]);
  const artifact = artifactHint ?? artifacts[0];
  const [showLongCode, setShowLongCode] = useState(false);
  const isLongCode = text.split("\n").length > 24;
  const displayCode = !isLongCode || showLongCode;
  const runnable = SHELL_LANGS.has((language.split(/\s+/)[0] ?? "").toLowerCase());

  return (
    <div className="overflow-hidden rounded-2xl bg-card">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          {artifact?.path ?? language ?? "code"}
        </span>
        <span className="ml-auto flex items-center">
          {runnable ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Run in CLI"
              onClick={() => {
                for (const line of text.split("\n")) {
                  const cmd = line.replace(/^\s*\$\s?/, "").trim();
                  if (cmd && !cmd.startsWith("#")) enqueueCommand(cmd);
                }
                useWorkStore.getState().setTerminalOpen(true);
              }}
            >
              <Play className="size-3.5" />
            </Button>
          ) : null}
          {artifact ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Open in files"
              onClick={() => {
                const file = {
                  ...artifact,
                  language: artifact.language || languageFromPath(artifact.path),
                };
                const projectId = useWorkStore.getState().activeProjectId;
                upsertFile(projectId, file);
                const saved = useWorkStore
                  .getState()
                  .projects.find((p) => p.id === projectId)
                  ?.files.find((f) => f.path === file.path);
                if (saved) selectFile(saved.id);
              }}
            >
              <FileCode className="size-3.5" />
            </Button>
          ) : null}
          {artifact?.path.endsWith(".html") ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label="Preview generated page"
              onClick={() => {
                const state = useWorkStore.getState();
                const project = state.projects.find((p) => p.id === state.activeProjectId);
                const source = project?.files.find((f) => f.path === artifact.path) ?? artifact;
                const id = state.openSideTab("browser", { title: source.path, ephemeral: false });
                state.setBrowserSrcdoc(id, buildWorkspacePreview(source, project?.files ?? [source]), source.path);
              }}
            >
              <Globe className="mr-1 size-3.5" />
              Preview
            </Button>
          ) : null}
          <CopyButton text={text} />
        </span>
      </div>
      {isLongCode ? (
        <button
          type="button"
          className="w-full px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/30"
          onClick={() => setShowLongCode((open) => !open)}
        >
          {displayCode ? "Hide source" : "Show source · " + text.split("\n").length + " lines"}
        </button>
      ) : null}
      {displayCode ? (
        <pre className="overflow-x-auto p-3 font-mono text-[12.5px] leading-relaxed text-foreground">
          <code>{text}</code>
        </pre>
      ) : null}
    </div>
  );
}

export function MessageMarkdown({
  content, chatId, messageId, streaming = false,
}: {
  content: string;
  chatId?: string;
  messageId?: string;
  streaming?: boolean;
}) {
  const artifacts = useMemo(() => extractArtifacts(content), [content]);
  const openSideTab = useWorkStore((s) => s.openSideTab);
  const setTabUrl = useWorkStore((s) => s.setTabUrl);
  const sideTabs = useWorkStore((s) => s.sideTabs);

  return (
    <div className="md">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (!href) return <span>{children}</span>;
            return (
              <button
                type="button"
                className="inline text-left text-accent underline decoration-accent/40 underline-offset-[3px]"
                onClick={() => {
                  const existing = sideTabs.find((t) => t.kind === "browser");
                  if (existing) {
                    useWorkStore.getState().setActiveSideTab(existing.id);
                    setTabUrl(existing.id, href);
                  } else {
                    openSideTab("browser", { url: href, title: "Browser", ephemeral: false });
                  }
                }}
              >
                {children}
                <Globe className="ml-1 inline size-3 opacity-70" />
              </button>
            );
          },
          img: ({ src, alt }) => {
            if (!src) return null;
            const label = alt || "Image";
            return (
              <ImageLightbox
                src={src}
                alt={label}
                chatId={chatId}
                assistant={chatId ? <Composer targetId={chatId} targetKind="chat" placeholder="Ask about this file" contextLabel={"Image: " + label} contextual /> : undefined}
                triggerClassName="as-message-image-trigger"
              >
                <img src={src} alt={label} loading="lazy" className="max-h-[440px] max-w-full rounded-xl object-contain" />
              </ImageLightbox>
            );
          },
          pre: ({ children }) => <div className="not-prose">{children as ReactNode}</div>,
          code: ({ className, children, ...props }) => {
            const text = String(children).replace(/\n$/, "");
            const lang = /language-(\S+)/.exec(className ?? "")?.[1];
            const inline = !className && !text.includes("\n");
            if (inline) {
              return (
                <code className={cn("rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em]", className)} {...props}>
                  {children}
                </code>
              );
            }
            const matchingArtifact = artifacts.find((item) => item.content === text);
            const code = <CodeBlock language={lang ?? "text"} text={text} artifactHint={matchingArtifact} />;
            if (lang?.toLowerCase() !== "svg") return code;
            return <><InlineSvgPreview source={text} complete={!streaming} onReview={chatId && messageId ? review => {
              const state = useWorkStore.getState();
              const reference = "SVG design review — message " + messageId + ", SHA-256 " + review.sha256 + ", backdrop " + review.backdrop + ".";
              const instruction = review.decision === 'approve'
                ? "I approve this exact visual revision for implementation. Reuse existing components and verify the result against the reference. Tool and deployment approvals remain separate."
                : "Request changes to this visual revision: ";
              const current = state.drafts[chatId] || "";
              state.setDraft(chatId, [current, reference + "\n" + instruction].filter(Boolean).join("\n\n"));
            } : undefined}/>{code}</>;
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
