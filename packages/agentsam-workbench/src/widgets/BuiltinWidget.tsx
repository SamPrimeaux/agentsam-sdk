import { CountdownWidget } from './CountdownWidget';
import { QueueDepthWidget } from './QueueDepthWidget';
import { ClockWidget } from './ClockWidget';
import { CalculatorWidget } from './CalculatorWidget';
import { CloudflareResourcesWidget } from './CloudflareResourcesWidget';
import { GitHubActivityWidget } from './GitHubActivityWidget';
import { GoogleDriveRecentWidget } from './GoogleDriveRecentWidget';
import type { AgentSamWidgetProviderData } from '@inneranimalmedia/agentsam-contracts/widgets';

export interface BuiltinWidgetProps {
  widgetId: string;
  compact?: boolean;
  interactive?: boolean;
  configuration?: Record<string, unknown>;
  data?: AgentSamWidgetProviderData;
  onLoadHistory?: (queueId: string) => Promise<AgentSamWidgetProviderData>;
}

export function BuiltinWidget({
  widgetId,
  compact = false,
  interactive = true,
  configuration = {},
  data,
  onLoadHistory,
}: BuiltinWidgetProps) {
  if (widgetId === 'queues') return <QueueDepthWidget compact={compact} interactive={interactive} data={data} onLoadHistory={onLoadHistory} />;
  if (widgetId === 'clock') return <ClockWidget compact={compact} defaultTimeZone={typeof configuration.timeZone === 'string' ? configuration.timeZone : ''} />;
  if (widgetId === 'calculator') return <CalculatorWidget />;
  if (widgetId === 'cloudflare-resources') return <CloudflareResourcesWidget data={data} compact={compact} />;
  if (widgetId === 'github-activity') return <GitHubActivityWidget data={data} compact={compact} />;
  if (widgetId === 'google-drive-recent') return <GoogleDriveRecentWidget data={data} compact={compact} />;
  if (widgetId === 'countdown') {
    const requested = Number(configuration.durationMs);
    const durationMs = Number.isFinite(requested) && requested > 0
      ? requested
      : 5 * 60_000;
    return <CountdownWidget durationMs={durationMs} compact={compact} />;
  }
  return null;
}
