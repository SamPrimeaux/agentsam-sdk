import { useState } from "react";

/**
 * Manifest-driven installable empty state (Local Studio copy — shell-kit twin).
 * Resolves semantic `icon` from the caller; never stores Lucide ids in manifests.
 */
export function InstallableEmptyState({
  installable,
  icon,
  onInstall,
  onPreview,
}: {
  installable: {
    id?: string;
    display_name?: string;
    name?: string;
    package?: string;
    icon?: string;
    install?: { command?: string; supported?: boolean };
    preview?: { supported?: boolean; route?: string };
    empty_state?: {
      title?: string;
      description?: string;
      primary_label?: string;
      secondary_label?: string;
    };
  };
  icon?: React.ReactNode;
  onInstall?: () => void;
  onPreview?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const name =
    installable?.display_name || installable?.name || installable?.id || "Package";
  const command =
    installable?.install?.command ||
    (installable?.package ? `npm install ${installable.package}` : undefined);
  const title = installable?.empty_state?.title || `${name} isn't connected`;
  const description =
    installable?.empty_state?.description ||
    `Install or open ${name} locally. Vectors are optional.`;
  const primaryLabel = installable?.empty_state?.primary_label || "Install";
  const secondaryLabel = installable?.empty_state?.secondary_label || "Preview";

  async function copyCommand() {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  }

  return (
    <section
      className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-muted/30 p-6"
      aria-labelledby="db-empty-title"
    >
      {icon ? (
        <div className="flex size-12 items-center justify-center rounded-xl bg-background text-foreground" aria-hidden>
          {icon}
        </div>
      ) : null}
      <div className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
        AgentSam package · {installable?.icon || "generic"}
      </div>
      <h2 id="db-empty-title" className="text-lg font-medium text-foreground">
        {title}
      </h2>
      <p className="max-w-md text-sm text-muted-foreground text-pretty">{description}</p>
      {command ? (
        <button
          type="button"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left font-mono text-xs text-muted-foreground hover:text-foreground"
          onClick={copyCommand}
          title="Copy command"
        >
          <span aria-hidden>$</span> {command}
          <span className="float-right opacity-60">{copied ? "Copied" : "⧉"}</span>
        </button>
      ) : null}
      <div className="mt-1 flex flex-wrap gap-2">
        {installable?.preview?.supported !== false && onPreview ? (
          <button
            type="button"
            className="h-10 rounded-lg border border-border px-4 text-sm hover:bg-background"
            onClick={onPreview}
          >
            {secondaryLabel}
          </button>
        ) : null}
        {onInstall ? (
          <button
            type="button"
            className="h-10 rounded-lg bg-foreground px-4 text-sm font-medium text-background"
            onClick={onInstall}
          >
            {primaryLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}
