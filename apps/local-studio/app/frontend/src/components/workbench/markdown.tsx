import { useMemo, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, FileCode, Globe, Play } from "lucide-react";
import { useState } from "react";
import { cn, languageFromPath } from "@/lib/utils";
import { extractArtifacts } from "@/lib/work/files";
import { useWorkStore } from "@/lib/work/store";
import { Button } from "@/components/ui/button";

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
}: {
  language: string;
  text: string;
}) {
  const selectFile = useWorkStore((s) => s.selectFile);
  const upsertFile = useWorkStore((s) => s.upsertFile);
  const enqueueCommand = useWorkStore((s) => s.enqueueCommand);
  const navigate = useNavigate();
  const artifacts = useMemo(() => extractArtifacts("```" + language + "\n" + text + "\n```"), [language, text]);
  const artifact = artifacts[0];
  const runnable = SHELL_LANGS.has((language.split(/\s+/)[0] ?? "").toLowerCase());

  return (
    <div className="overflow-hidden rounded-xl bg-ink shadow-hairline">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
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
                void navigate({ to: "/files" });
              }}
            >
              <FileCode className="size-3.5" />
            </Button>
          ) : null}
          <CopyButton text={text} />
        </span>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[12.5px] leading-relaxed text-paper">
        <code>{text}</code>
      </pre>
    </div>
  );
}

export function MessageMarkdown({
  content,
}: {
  content: string;
  trailId?: string;
}) {
  const navigate = useNavigate();
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
                  void navigate({ to: "/browse" });
                }}
              >
                {children}
                <Globe className="ml-1 inline size-3 opacity-70" />
              </button>
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
            return <CodeBlock language={lang ?? "text"} text={text} />;
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
