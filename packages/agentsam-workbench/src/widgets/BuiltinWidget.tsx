import { CountdownWidget } from './CountdownWidget';
import { QueueDepthWidget } from './QueueDepthWidget';
import { ClockWidget } from './ClockWidget';
import { CalculatorWidget } from './CalculatorWidget';

export interface BuiltinWidgetProps {
  widgetId: string;
  compact?: boolean;
  configuration?: Record<string, unknown>;
}

export function BuiltinWidget({
  widgetId,
  compact = false,
  configuration = {},
}: BuiltinWidgetProps) {
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
