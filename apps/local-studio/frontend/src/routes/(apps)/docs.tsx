import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowRight, BookOpen, CircleHelp, Globe2, LayoutTemplate, PanelsTopLeft, Store } from 'lucide-react';

export const Route = createFileRoute('/(apps)/docs')({ component: DocumentationHome });

const card = 'rounded-2xl border border-border bg-card p-5';
const action = 'inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium transition hover:bg-muted';

function DocumentationHome() {
  const navigate = useNavigate();
  return (
    <main className="min-h-screen overflow-auto bg-background text-foreground" data-studio-product="documentation-home">
      <div className="mx-auto max-w-6xl space-y-8 p-6 lg:p-10">
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex max-w-3xl items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-card"><BookOpen size={23} /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">AgentSam / Documentation</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Help for the work in front of you.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">Guides explain the real workflow, what a status means, and which action to take next. Use the question-mark icon from a workspace to find guidance that matches the task.</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground"><CircleHelp size={15} /> Help center</span>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
          <article className={card}>
            <span className="flex size-10 items-center justify-center rounded-xl bg-muted"><Globe2 size={19} /></span>
            <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Available guide</p>
            <h2 className="mt-2 text-xl font-semibold">Sites, themes, and CMS</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Understand connected websites, content-only records, local theme drafts, the Online Store preview, and the checks required before publication.</p>
            <button type="button" className={action + ' mt-5'} onClick={() => void navigate({ to: '/help/cms' })}>Read website guide <ArrowRight size={15} /></button>
          </article>
          <aside className={card}>
            <span className="flex size-10 items-center justify-center rounded-xl bg-muted"><PanelsTopLeft size={19} /></span>
            <h2 className="mt-4 text-lg font-semibold">One capability, clear states</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Connected sites, editable content, theme drafts, previews, and published websites are different states. The interface and its guides should say which state is actually verified.</p>
            <button type="button" className={action + ' mt-5 w-full'} onClick={() => void navigate({ to: '/sites' })}>Open Sites <ArrowRight size={15} /></button>
          </aside>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="docs-next-actions">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted"><Store size={19} /></span>
            <div>
              <h2 id="docs-next-actions" className="text-lg font-semibold">Quick paths</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">Jump back into the relevant workspace when you are ready to apply the guide.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button type="button" className="flex items-center gap-3 rounded-xl border border-border p-4 text-left transition hover:bg-muted" onClick={() => void navigate({ to: '/cms' })}>
              <Store size={18} className="text-muted-foreground" /><span className="min-w-0 flex-1"><strong className="block text-sm font-medium">Online Store / CMS</strong><span className="mt-1 block text-xs text-muted-foreground">Inspect site status and edit content</span></span><ArrowRight size={15} />
            </button>
            <button type="button" className="flex items-center gap-3 rounded-xl border border-border p-4 text-left transition hover:bg-muted" onClick={() => void navigate({ to: '/themes' })}>
              <LayoutTemplate size={18} className="text-muted-foreground" /><span className="min-w-0 flex-1"><strong className="block text-sm font-medium">Theme library</strong><span className="mt-1 block text-xs text-muted-foreground">Explore packaged themes and drafts</span></span><ArrowRight size={15} />
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
