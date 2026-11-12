import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Download, ExternalLink, Globe, Monitor, Puzzle, RotateCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkStore } from "@/lib/work/store";
import type { SideTab } from "@inneranimalmedia/agentsam-local-shared";
import { AnnotationToggle } from '../../../agentsam/AnnotationHelper';
import { isPackagedDesktop, openAgentBrowser, type AgentBrowserLaunch } from '@/lib/desktop/tauri';
import { toast } from 'sonner';

const BOOKMARKS = [
  { label: "MDN", url: "https://developer.mozilla.org/" },
  { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Main_Page" },
  { label: "npm", url: "https://www.npmjs.com/" },
  { label: "Workers docs", url: "https://developers.cloudflare.com/workers/" },
  { label: "DuckDuckGo", url: "https://duckduckgo.com/" },
];

function resolveInput(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.includes(" ") || !value.includes(".")) {
    return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
  }
  return `https://${value}`;
}

export function BrowserStage({ tab }: { tab: SideTab }) {
  const desktop = isPackagedDesktop();
  const setTabUrl = useWorkStore((s) => s.setTabUrl);
  const navigateBrowser = useWorkStore((s) => s.navigateBrowser);
  const [draft, setDraft] = useState(tab.url);
  const [reloadKey, setReloadKey] = useState(0);
  const [browserProfile, setBrowserProfile] = useState<AgentBrowserLaunch | null>(null);
  // The in-app view is an intentionally constrained page preview. Full Chrome
  // retains normal extensions, downloads and permissions in its own profile.
  const [desktopView, setDesktopView] = useState<'preview' | 'chrome'>('preview');
  const chromeMode = desktop && desktopView === 'chrome' && !tab.srcdoc;
  const src = tab.srcdoc ? undefined : tab.url;
  const canBack = tab.historyIndex > 0;
  const canForward = tab.historyIndex >= 0 && tab.historyIndex < tab.history.length - 1;

  useEffect(() => {
    setDraft(tab.url || (tab.srcdoc ? tab.title : ""));
  }, [tab.url, tab.srcdoc, tab.title, tab.id]);

  function go(url: string) {
    const next = resolveInput(url);
    if (!next) return;
    setDraft(next);
    setTabUrl(tab.id, next);
    if (chromeMode) {
      void openAgentBrowser(next).then(setBrowserProfile).catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Could not open Google Chrome');
      });
    } else {
      setReloadKey((k) => k + 1);
    }
  }

  function openChrome(target = tab.url || undefined) {
    void openAgentBrowser(target).then((result) => {
      setBrowserProfile(result);
      toast.success('Opened AgentSam Browser in Google Chrome');
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Could not open Google Chrome');
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    go(draft);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-agentsam-resource={`browser:${tab.id}`} aria-label={desktop ? 'AgentSam Google Chrome browser controls' : `Browser preview: ${tab.url || tab.title}. Annotation refers to the preview frame; embedded page contents are not captured.`}>
      {desktop && !tab.srcdoc ? <div className="flex flex-none items-center justify-between gap-2 border-b border-border px-3 py-2" role="group" aria-label="Browser location">
        <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-1">
          <button type="button" onClick={() => setDesktopView('preview')} aria-pressed={!chromeMode}
            className={'inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs ' + (!chromeMode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            <Monitor className="size-4" /> In-app preview
          </button>
          <button type="button" onClick={() => setDesktopView('chrome')} aria-pressed={chromeMode}
            className={'inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs ' + (chromeMode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            <Globe className="size-4" /> Full Chrome
          </button>
        </div>
        <span className="hidden text-xs text-muted-foreground sm:inline">{chromeMode ? 'Dedicated browser profile' : 'Sites may restrict embedding'}</span>
      </div> : null}
      {tab.srcdoc ? (
        <div className="flex h-10 items-center gap-2 border-b border-border px-3" aria-label="Rendered project preview">
          <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium">Preview</span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{tab.title}</span>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Refresh preview"
            onClick={() => setReloadKey((key) => key + 1)}>
            <RotateCw className="size-3.5" />
          </Button>
        </div>
      ) : (
      <form onSubmit={onSubmit} className="flex items-center gap-1 border-b border-border px-2 py-2">
        {!chromeMode ? <AnnotationToggle /> : null}
        {!chromeMode ? <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-11 shrink-0 md:size-8"
          aria-label="Back"
          disabled={!canBack}
          onClick={() => navigateBrowser(tab.id, -1)}
        >
          <ArrowLeft className="size-4" />
        </Button> : null}
        {!chromeMode ? <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-11 shrink-0 md:size-8"
          aria-label="Forward"
          disabled={!canForward}
          onClick={() => navigateBrowser(tab.id, 1)}
        >
          <ArrowRight className="size-4" />
        </Button> : null}
        {!chromeMode ? <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-11 shrink-0 md:size-8"
          aria-label="Reload"
          disabled={!tab.url && !tab.srcdoc}
          onClick={() => setReloadKey((k) => k + 1)}
        >
          <RotateCw className="size-4" />
        </Button> : null}
        <div className="relative min-w-0 flex-1">
          <Globe className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search or enter a URL"
            className="h-11 pl-8 md:h-9"
            aria-label="Address"
          />
        </div>
        {desktop ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-11 shrink-0 md:size-9"
            aria-label="Manage Chrome extensions"
            title="Manage Chrome extensions"
            onClick={() => openChrome('chrome://extensions/')}
          >
            <Puzzle className="size-4" />
          </Button>
        ) : null}
        {chromeMode ? <Button type="submit" size="sm" className="h-11 shrink-0 md:h-8">Open in Chrome</Button> : tab.url ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-11 shrink-0 md:size-8"
            aria-label={desktop ? 'Open in full Chrome' : 'Open externally'}
            onClick={() => desktop ? openChrome(tab.url) : window.open(tab.url, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="size-4" />
          </Button>
        ) : null}
      </form>
      )}

      {chromeMode ? (
        <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-auto px-6 py-8 text-center" aria-label="AgentSam Google Chrome browser">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-muted"><Globe className="size-6 text-primary" /></div>
          <div className="max-w-lg">
            <h2 className="text-lg font-semibold">AgentSam Browser runs in Google Chrome</h2>
            <p className="mt-2 text-sm text-muted-foreground">This opens a separate Chrome profile managed by Local Studio. Chrome supplies real tabs, navigation, downloads, site permission prompts, and its extension manager.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={() => openChrome()}><Globe className="mr-2 size-4" />Open browser</Button>
            <Button type="button" variant="outline" onClick={() => openChrome('chrome://downloads/')}><Download className="mr-2 size-4" />Downloads</Button>
            <Button type="button" variant="outline" onClick={() => openChrome('chrome://settings/content/')}><ShieldCheck className="mr-2 size-4" />Site permissions</Button>
          </div>
          {browserProfile ? <div className="max-w-xl rounded-lg border border-border bg-muted/50 px-3 py-2 text-left text-xs text-muted-foreground"><div>Separate Chrome profile</div><code className="mt-1 block break-all">{browserProfile.profile_path}</code></div> : null}
          <p className="max-w-lg text-xs text-muted-foreground">Install extensions into this AgentSam profile from Chrome’s Extensions page. Your everyday Chrome profile stays separate. The AgentSam Tab Handoff extension can be loaded unpacked from the Local Studio source folder.</p>
        </section>
      ) : tab.srcdoc ? (
        <>
          {tab.srcdoc.includes('name="agentsam-preview-fragment"') ? (
            <p className="border-b border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground" role="status">
              HTML fragment preview · no stylesheet was included. This is not a finished page.
            </p>
          ) : null}
          <iframe
          key={`doc-${reloadKey}`}
          title={tab.title}
          srcDoc={tab.srcdoc}
          sandbox="allow-scripts allow-forms"
          className="min-h-0 flex-1 w-full bg-paper"
        />
        </>
      ) : src ? (
        <iframe
          key={`${src}-${reloadKey}`}
          title={tab.title}
          src={src}
          className="h-full w-full bg-card"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <Globe className="mb-3 size-8 text-stone" />
          <h2 className="text-base font-medium">Browser preview</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground text-pretty">
            Inspect embeddable pages and preview local HTML without leaving Work.
            Sites that block embedded frames need an external browser.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {BOOKMARKS.map((item) => (
              <Button
                key={item.url}
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => go(item.url)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
