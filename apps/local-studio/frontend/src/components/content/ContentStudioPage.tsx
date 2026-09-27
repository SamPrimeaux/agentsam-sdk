import { useEffect, useMemo, useState } from "react";
import { ContentStudio } from "@inneranimalmedia/agentsam-content-studio";
import type { ContentRuntime } from "@inneranimalmedia/agentsam-content";
import { createLocalStudioContentRuntime } from "@/lib/content/createLocalStudioContentRuntime";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";

export interface ContentStudioPageProps {
  /** Sites → Media: scope assets to this site/project slug. */
  projectId?: string;
  brandId?: string;
  /** Optional header label override (e.g. site name). */
  title?: string;
}

/**
 * Local Studio Content Studio mount — Sites → Media and /content.
 * Optimize runs via ContentRuntime.importAsset + host ImageOptimizer
 * (desktop: Tauri bridge; web: /api/content/optimize). Never call Nitro from desktop UI.
 */
export function ContentStudioPage(props: ContentStudioPageProps = {}) {
  const { user, isPending } = useCurrentUserState();

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Resolving account…
      </div>
    );
  }

  if (!user) {
    return <RedirectToSignIn />;
  }

  return <ContentStudioPageMounted user={user} {...props} />;
}

function ContentStudioPageMounted({
  user,
  projectId,
  brandId,
  title,
}: ContentStudioPageProps & {
  user: {
    id: string;
    displayName: string | null;
    primaryEmail: string | null;
  };
}) {
  const runtime = useMemo(
    () =>
      createLocalStudioContentRuntime({
        accountId: user.id,
        actorRef: user.id,
        accountLabel: user.displayName ?? user.primaryEmail ?? user.id,
        brandProjections: [],
        projectId,
      }),
    [user.id, user.displayName, user.primaryEmail, projectId],
  );

  const [capsLabel, setCapsLabel] = useState("loading capabilities…");
  const [localLabel, setLocalLabel] = useState("probing local host…");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const caps = await runtime.capabilities();
        if (cancelled) return;
        const providers = caps.providers.map((p) => p.id);
        const local = caps.local.availability;
        setCapsLabel(
          providers.length
            ? `capabilities · ${providers.join(", ")} · local:${local}`
            : `capabilities · local:${local}`,
        );
      } catch (err) {
        if (!cancelled) setCapsLabel(`capabilities unavailable · ${String(err)}`);
      }
      try {
        const status = await runtime.localHost.status();
        if (!cancelled) {
          setLocalLabel(
            `${status.availability}${status.label ? ` · ${status.label}` : ""}`,
          );
        }
      } catch {
        if (!cancelled) setLocalLabel("local host unreachable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runtime]);

  const heading = title
    ? title
    : projectId
      ? `Media · ${projectId}`
      : "Content Studio";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{heading}</span>
        <span className="truncate pl-4">
          {user.id} · {capsLabel} · {localLabel}
        </span>
      </header>
      <div className="min-h-0 flex-1">
        <ContentStudioShell runtime={runtime} projectId={projectId} brandId={brandId} />
      </div>
    </div>
  );
}

function ContentStudioShell({
  runtime,
  projectId,
  brandId,
}: {
  runtime: ContentRuntime;
  projectId?: string;
  brandId?: string;
}) {
  return (
    <ContentStudio
      runtime={runtime}
      showAssistant
      projectId={projectId}
      brandId={brandId}
    />
  );
}
