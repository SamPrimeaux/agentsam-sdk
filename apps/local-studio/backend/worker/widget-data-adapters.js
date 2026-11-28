/** Host-side registry: only adapters with a real Local Studio implementation may be marked ready. */
export const SUPPORTED_WIDGET_DATA_ADAPTERS = new Set([
  'queues.observability',
  'github.pull-request',
  'github.commit-readiness',
]);
