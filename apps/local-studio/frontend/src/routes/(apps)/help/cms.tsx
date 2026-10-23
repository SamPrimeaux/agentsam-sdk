import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  FileText,
  Globe2,
  LayoutTemplate,
  PanelsTopLeft,
  ShieldCheck,
  Store,
} from 'lucide-react';

export const Route = createFileRoute('/(apps)/help/cms')({ component: CmsHelpPage });

const card = 'rounded-2xl border border-border bg-card p-5';
const action = 'inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium transition hover:bg-muted';

function CmsHelpPage() {
  const navigate = useNavigate();

  return (
    <main className="h-full overflow-auto bg-background text-foreground" data-studio-product="cms-help">
      <div className="mx-auto max-w-6xl space-y-8 p-6 lg:p-10">
        <button type="button" onClick={() => void navigate({ to: '/cms' })} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} /> Back to Sites & CMS
        </button>

        <header className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex max-w-3xl items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-card"><BookOpen size={23} /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Documentation / Sites & CMS</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Build the site. Know what is live.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Sites, themes, content, previews, and publishing are connected parts of one workflow—but they are not interchangeable states. This guide explains what each state means and what to do next.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground"><CircleHelp size={15} /> Contextual help</span>
        </header>

        <section className="grid gap-4 md:grid-cols-3" aria-label="Website states">
          <article className={card}>
            <span className="flex size-10 items-center justify-center rounded-xl bg-muted"><Globe2 size={19} /></span>
            <h2 className="mt-4 font-semibold">Connected website</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">The site has an authorized application Worker. Its Online Store workspace can use the site's own APIs, actual storefront preview, theme state, and publishing checks.</p>
            <span className="mt-4 inline-flex items-center gap-2 text-xs font-medium"><CheckCircle2 size={14} /> Runtime verified by the site</span>
          </article>
          <article className={card}>
            <span className="flex size-10 items-center justify-center rounded-xl bg-muted"><FileText size={19} /></span>
            <h2 className="mt-4 font-semibold">Content-only project</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">CMS records exist, but a storefront renderer, installed theme, or publication binding has not been verified. Existing content remains editable; it is not evidence of a live website.</p>
            <span className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-200"><CircleHelp size={14} /> Setup still required</span>
          </article>
          <article className={card}>
            <span className="flex size-10 items-center justify-center rounded-xl bg-muted"><LayoutTemplate size={19} /></span>
            <h2 className="mt-4 font-semibold">Local theme draft</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">A working theme project saved on this installation. It is useful for experimentation, but it stays separate from a connected site until you deliberately install or publish it.</p>
            <span className="mt-4 inline-flex items-center gap-2 text-xs font-medium"><PanelsTopLeft size={14} /> Separate from live content</span>
          </article>
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-labelledby="cms-guide-workflow">
          <div className="border-b border-border px-5 py-5 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Recommended workflow</p>
            <h2 id="cms-guide-workflow" className="mt-2 text-xl font-semibold">From theme to a verified storefront</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">The Online Store dashboard is the reference for desktop and mobile previews, active-theme status, saved drafts, and publish readiness. Use it only for an installation whose runtime is actually connected.</p>
          </div>
          <ol className="grid gap-0 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
            <li className="flex gap-4 p-5 sm:p-6">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border text-sm font-semibold">01</span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">Choose a starting theme</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">Explore packaged themes, then create a draft for the intended site. A catalog entry is a starting point—not a claim that it is already installed.</p>
                <button type="button" className={action + ' mt-4'} onClick={() => void navigate({ to: '/themes' })}>Browse themes <ArrowRight size={15} /></button>
              </div>
            </li>
            <li className="flex gap-4 p-5 sm:p-6">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border text-sm font-semibold">02</span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">Edit structured content</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">Edit page copy, sections, and blocks in the editor. Changes remain drafts until a supported publication flow confirms they are live.</p>
                <button type="button" className={action + ' mt-4'} onClick={() => void navigate({ to: '/cms' })}>Open CMS <ArrowRight size={15} /></button>
              </div>
            </li>
            <li className="flex gap-4 p-5 sm:p-6">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border text-sm font-semibold">03</span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">Verify the preview</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">Confirm the correct site, installed renderer, theme, and page templates. A content-only project should show setup guidance rather than a fabricated live preview.</p>
              </div>
            </li>
            <li className="flex gap-4 p-5 sm:p-6">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border text-sm font-semibold">04</span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">Publish deliberately</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">Publish only after the destination is verified and the theme is marked ready. Local drafts, CMS records, and a public website are different states.</p>
                <button type="button" className={action + ' mt-4'} onClick={() => void navigate({ to: '/sites' })}>Manage sites <ArrowRight size={15} /></button>
              </div>
            </li>
          </ol>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
          <div className={card}>
            <h2 className="text-lg font-semibold">Common questions</h2>
            <div className="mt-3 divide-y divide-border">
              <details className="group py-3">
                <summary className="cursor-pointer list-none font-medium marker:hidden">Why is the site preview unavailable?</summary>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">The selected record may contain content without a verified storefront runtime. Check the site's connection and theme installation before expecting a public preview.</p>
              </details>
              <details className="group py-3">
                <summary className="cursor-pointer list-none font-medium marker:hidden">Does editing content publish it?</summary>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">No. Editing changes structured content or a draft. Publication is a separate action that must target a verified site and supported renderer.</p>
              </details>
              <details className="group py-3">
                <summary className="cursor-pointer list-none font-medium marker:hidden">Will a local draft replace my live website?</summary>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">A local theme draft is kept separate. It should not replace live site content unless you explicitly install or publish it through the site's supported workflow.</p>
              </details>
            </div>
          </div>
          <aside className={card}>
            <span className="flex size-10 items-center justify-center rounded-xl bg-muted"><Store size={19} /></span>
            <h2 className="mt-4 text-lg font-semibold">Need the Online Store view?</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">For a connected ecommerce installation, the Online Store workspace presents the real desktop/mobile storefront previews, theme drafts, and publication state. The CMS does not invent those details for an unconnected project.</p>
            <button type="button" className={action + ' mt-5 w-full'} onClick={() => void navigate({ to: '/sites' })}>Open Sites <ArrowRight size={15} /></button>
          </aside>
        </section>
      </div>
    </main>
  );
}
