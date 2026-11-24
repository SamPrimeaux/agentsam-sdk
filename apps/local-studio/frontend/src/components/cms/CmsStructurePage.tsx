import { useState } from "react";
import { Globe, PanelsTopLeft } from "lucide-react";
import { PlatformNavigationSettings } from "../settings/PlatformNavigationSettings";
import { WebsiteNavigationSettings } from "./WebsiteNavigationSettings";

type Scope = "website" | "platform";

export function CmsStructurePage({ initialSiteId, initialSiteSlug, initialScope = "website" }: { initialSiteId?: string; initialSiteSlug?: string; initialScope?: Scope }) {
  const [scope, setScope] = useState<Scope>(initialScope);
  return (
    <main className="mx-auto grid w-full max-w-[1440px] gap-5 p-4 md:p-6">
      <header className="flex flex-col gap-2">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Online Store · CMS</div>
        <h1 className="text-2xl font-semibold tracking-tight">Structure</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">Manage website menus and AgentSam navigation in the existing CMS surface. Website menus publish to the selected site; platform navigation stays account-scoped.</p>
      </header>
      <div className="inline-flex w-fit rounded-xl border border-border bg-muted/40 p-1" role="tablist" aria-label="Navigation context">
        <button type="button" role="tab" aria-selected={scope === "website"} onClick={() => setScope("website")} className={"inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium " + (scope === "website" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          <Globe size={16} /> Website
        </button>
        <button type="button" role="tab" aria-selected={scope === "platform"} onClick={() => setScope("platform")} className={"inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium " + (scope === "platform" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          <PanelsTopLeft size={16} /> AgentSam
        </button>
      </div>
      {scope === "website" ? <WebsiteNavigationSettings initialSiteId={initialSiteId} initialSiteSlug={initialSiteSlug} /> : <PlatformNavigationSettings />}
    </main>
  );
}

