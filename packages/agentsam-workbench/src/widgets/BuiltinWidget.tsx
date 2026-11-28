import { MediaWidget } from './MediaWidget';
import { CountdownWidget } from './CountdownWidget';
import { QueueDepthWidget } from './QueueDepthWidget';
import { ClockWidget } from './ClockWidget';
import { CalculatorWidget } from './CalculatorWidget';
import type { AgentSamWidgetDataHost } from '@inneranimalmedia/agentsam-contracts/widgets';

import { PullRequestSummaryWidget, ReleaseReadinessWidget } from './ReleaseWidgets';

import { CreativeEntryWidget, ArtifactPreviewWidget, type CreativeWidgetHost } from './CreativeWidgets';
import { creativeWidgetEntry } from './creative-covers';

export interface BuiltinWidgetProps {
  widgetId: string;
  compact?: boolean;
  creativeHost?: CreativeWidgetHost;
  dataHost?: AgentSamWidgetDataHost;
  configuration?: Record<string, unknown>;
}

export function BuiltinWidget({
  widgetId,
  compact = false,
  creativeHost,
  dataHost,
  configuration = {},
}: BuiltinWidgetProps) {
  if (widgetId === 'media') return <MediaWidget configuration={configuration} />;
  if (widgetId === 'artifact-preview') return <ArtifactPreviewWidget host={creativeHost} configuration={configuration} />;
  if (creativeWidgetEntry(widgetId)) return <CreativeEntryWidget widgetId={widgetId} host={creativeHost} />;
  if (widgetId === 'pull-request-summary') return <PullRequestSummaryWidget dataHost={dataHost} />;
  if (widgetId === 'release-readiness') return <ReleaseReadinessWidget dataHost={dataHost} />;
  if (widgetId === 'queues') return <QueueDepthWidget compact={compact} />;
  if (widgetId === 'clock') return <ClockWidget compact={compact} defaultTimeZone={typeof configuration.timeZone === 'string' ? configuration.timeZone : ''} />;
  if (widgetId === 'calculator') return <CalculatorWidget />;
  if (widgetId === 'countdown') {
    const requested = Number(configuration.durationMs);
    const durationMs = Number.isFinite(requested) && requested > 0
      ? requested
      : 5 * 60_000;
    return <CountdownWidget durationMs={durationMs} compact={compact} />;
  }
  return null;
}
