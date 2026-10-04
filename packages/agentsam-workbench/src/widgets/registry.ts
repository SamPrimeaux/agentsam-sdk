import type { AgentSamWidgetDefinition } from '@inneranimalmedia/agentsam-contracts/widgets';

export const BUILTIN_WIDGET_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'countdown',
    kind: 'countdown',
    title: 'Countdown',
    description: 'Compact deadline-based timer for focus blocks, launch windows, and task checkpoints.',
    icon: 'clock-3',
    sizes: ['small', 'medium'] as const,
    deeplink: '/widgets',
  } satisfies AgentSamWidgetDefinition),
] satisfies readonly AgentSamWidgetDefinition[]);
