import { ArrowUpRight, ExternalLink, Store } from 'lucide-react';

const THEME_STORE_URL = 'https://themes.inneranimalmedia.com/';

export function ThemeStorePage() {
  return (
    <main className="min-h-full bg-background px-6 py-12" data-theme-store-handoff>
      <div className="mx-auto max-w-3xl">
        <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground">
          <Store size={20} aria-hidden="true" />
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Storefront themes</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Theme Store</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
          Storefront themes are published, previewed, versioned, and distributed by InnerAnimalMedia Theme Store.
          AgentSam connects your selected site to those published releases; it does not maintain a second theme catalog.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <a
            href={THEME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Open Theme Store <ExternalLink size={15} aria-hidden="true" />
          </a>
          <a
            href="/admin/store"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Open Online Store <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
        <p className="mt-8 border-t border-border pt-5 text-xs leading-6 text-muted-foreground">
          To try a theme on a website, choose the site in Online Store and use Discover themes. The resulting draft belongs to that site and opens in Theme Studio.
        </p>
      </div>
    </main>
  );
}
