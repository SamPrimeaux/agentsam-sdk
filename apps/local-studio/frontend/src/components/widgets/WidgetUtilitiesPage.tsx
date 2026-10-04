import { CountdownWidget, WidgetFrame } from '@inneranimalmedia/agentsam-workbench/widgets';
import '@inneranimalmedia/agentsam-workbench/widgets/widgets.css';

export function WidgetUtilitiesPage() {
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6 md:p-10">
        <header className="max-w-2xl">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">App utilities</p>
          <h1 className="text-3xl font-semibold tracking-tight">Small controls, native to the app.</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Widgets are reusable app primitives, not installable prebuilds. This surface proves the shared
            widget contract inside Local Studio.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <WidgetFrame
            title="Focus timer"
            description="Five-minute countdown. The host owns where it appears and what completion means."
            size="small"
          >
            <CountdownWidget durationMs={5 * 60_000} />
          </WidgetFrame>
        </div>
      </div>
    </div>
  );
}
