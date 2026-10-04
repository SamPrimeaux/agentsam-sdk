import { CountdownWidget } from './CountdownWidget';

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
  if (widgetId === 'countdown') {
    const requested = Number(configuration.durationMs);
    const durationMs = Number.isFinite(requested) && requested > 0
      ? requested
      : 5 * 60_000;
    return <CountdownWidget durationMs={durationMs} compact={compact} />;
  }
  return null;
}
