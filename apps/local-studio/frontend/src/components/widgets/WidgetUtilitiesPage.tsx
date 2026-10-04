import { useEffect, useState } from 'react';
import { BuiltinWidget, WidgetFrame } from '@inneranimalmedia/agentsam-workbench/widgets';
import '@inneranimalmedia/agentsam-workbench/widgets/widgets.css';
import {
  listLocalStudioWidgets,
  subscribeLocalStudioWidgets,
} from '@/lib/widgets/preferences';

export function WidgetUtilitiesPage() {
  const [widgets, setWidgets] = useState(() => listLocalStudioWidgets());

  useEffect(() => subscribeLocalStudioWidgets(() => setWidgets(listLocalStudioWidgets())), []);

  const visible = widgets.filter((widget) => widget.visible);

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6 md:p-10">
        <header className="max-w-2xl">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">App utilities</p>
          <h1 className="text-3xl font-semibold tracking-tight">Small controls, native to the app.</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Widgets are portable app primitives. Choose which ones are visible from Settings → Customize → Widgets.
          </p>
        </header>

        {visible.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((widget) => (
              <WidgetFrame
                key={widget.id}
                title={widget.title}
                description={widget.description}
                size="small"
              >
                <BuiltinWidget widgetId={widget.id} />
              </WidgetFrame>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm font-medium">No widgets are visible.</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Re-enable a widget from Settings → Customize → Widgets.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
