import { useEffect, useMemo, useState } from "react";
import { ContentStudio } from "@inneranimalmedia/agentsam-content-studio";
import type { ContentAsset, ContentRuntime } from "@inneranimalmedia/agentsam-content";
import { createLocalStudioContentRuntime } from "@/lib/content/createLocalStudioContentRuntime";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";

/**
 * Local Studio gallery entry — mounts portable Content Studio on a real host runtime.
 * Account/actor come from AuthProvider session; fail closed when unavailable.
 * Brand projections stay empty until the host injects BrandPack authority.
 */
export function ContentStudioPage() {
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

  return <ContentStudioPageMounted user={user} />;
}

function ContentStudioPageMounted({
  user,
}: {
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
        // Empty until Path B BrandPack projection — never DEMO fixtures.
        brandProjections: [],
      }),
    [user.id, user.displayName, user.primaryEmail],
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Content Studio</span>
        <span className="truncate pl-4">
          {user.id} · {capsLabel} · {localLabel}
        </span>
      </header>
      <div className="min-h-0 flex-1">
        <ContentStudioShell runtime={runtime} />
      </div>
    </div>
  );
}

async function bytesToBase64(bytes: Uint8Array): Promise<string> {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function ContentStudioShell({ runtime }: { runtime: ContentRuntime }) {
  async function handleAssetCreated(asset: ContentAsset, file: File) {
    if (!file.type.startsWith("image/")) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const dataBase64 = await bytesToBase64(bytes);
      const res = await fetch("/api/content/optimize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, mime: file.type, dataBase64 }),
      });
      const body = await res.json().catch(() => ({ ok: false }));
      if (!body.ok || body.skipped) return;
      await runtime.addVariant(asset.id, {
        name: "public",
        providerRef: { provider: "local", ref: body.ref, role: "derivative" },
        format: body.format,
        bytes: body.bytes,
        width: body.width,
        height: body.height,
        createdAt: new Date().toISOString(),
      });
    } catch {
      // Best-effort — upload already succeeded; optimize failure is non-fatal.
    }
  }

  return <ContentStudio runtime={runtime} showAssistant onAssetCreated={handleAssetCreated} />;
}
