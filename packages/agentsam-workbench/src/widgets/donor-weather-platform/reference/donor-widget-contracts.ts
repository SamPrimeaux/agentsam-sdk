/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * @inneranimalmedia/agentsam-contracts/widgets
 * Widget definition and state contracts for AgentSam Workbench & Local Studio.
 */

export interface WidgetDataEnvelope<T = any> {
  status: 'loading' | 'ready' | 'error' | 'stale' | 'needs_setup';
  updatedAt: number;
  data: T | null;
  source?: string;
  error?: string;
}

export type WidgetCategory =
  | 'utility'
  | 'glance'
  | 'navigation'
  | 'content'
  | 'agent/runtime'
  | 'weather';

export type WidgetSize = 'sm' | 'md' | 'lg' | 'full';

export interface WidgetDefinition<TConfig = any, TState = any> {
  id: string;
  title: string;
  category: WidgetCategory;
  description: string;
  defaultSize: WidgetSize;
  iconName: string;
  tags: string[];
  version: string;
  defaultConfig?: TConfig;
  initialState?: TState;
}

// -------------------------------------------------------------
// UTILITY CONTRACTS
// -------------------------------------------------------------

export interface CountdownWidgetConfig {
  defaultDurationSeconds: number;
  label?: string;
  chimeEnabled: boolean;
  autoRestart?: boolean;
}

export interface CountdownWidgetState {
  deadlineMs: number | null;
  initialDurationSeconds: number;
  remainingMs: number;
  status: 'idle' | 'running' | 'paused' | 'completed';
  label: string;
  lastUpdated: number;
}

export interface ClockWidgetConfig {
  defaultTimezone: string;
  format24h: boolean;
  showSeconds: boolean;
  showUtcOffset: boolean;
}

export interface CalculatorState {
  display: string;
  equation: string;
  history: Array<{ expr: string; result: string; timestamp: number }>;
  memory: number;
}

export interface QuickControlsState {
  devServer: boolean;
  turboRun: boolean;
  telemetryStream: boolean;
  autoApprovals: boolean;
  audioChimes: boolean;
  atmosphericTheme: 'weather-auto' | 'azure-sky' | 'deep-slate' | 'twilight' | 'aurora' | 'emerald';
}

// -------------------------------------------------------------
// GLANCE CONTRACTS
// -------------------------------------------------------------

export interface GlanceMetricsState {
  throughputReqSec: number;
  latencyP95Ms: number;
  memoryRssMb: number;
  eventLoopLagMs: number;
  errorRatePercent: number;
  uptimeHours: number;
  history: Array<{ time: string; throughput: number; latency: number }>;
}

export interface GlanceJobItem {
  id: string;
  name: string;
  cronExpr: string;
  lastRunStatus: 'success' | 'running' | 'failed' | 'idle';
  nextRunIn: string;
  durationMs: number;
}

export interface GlanceJobsState {
  jobs: GlanceJobItem[];
  concurrencyLimit: number;
  activeExecutors: number;
}

export interface GlanceQueuesState {
  inboundDepth: number;
  priorityHigh: number;
  priorityNormal: number;
  deadLetterCount: number;
  throughputPerMin: number;
}

export interface RuntimeStateInfo {
  clusterState: 'healthy' | 'degraded' | 'rebalancing';
  nodeEnv: string;
  activeSandboxes: number;
  gatewayLatencyMs: number;
  connectedClients: number;
  version: string;
}

// -------------------------------------------------------------
// NAVIGATION CONTRACTS
// -------------------------------------------------------------

export interface LauncherItem {
  id: string;
  title: string;
  subtitle: string;
  shortcut?: string;
  actionId: string;
  category: 'agent' | 'weather' | 'system' | 'debug';
}

export interface RecentItem {
  id: string;
  title: string;
  timestamp: string;
  type: 'query' | 'dashboard' | 'export' | 'run';
  details?: string;
}

export interface ShortcutEntry {
  keyCombo: string;
  description: string;
  scope: 'global' | 'widgets' | 'weather' | 'terminal';
}

// -------------------------------------------------------------
// CONTENT CONTRACTS
// -------------------------------------------------------------

export interface TaskListItem {
  id: string;
  text: string;
  completed: boolean;
  priority: 'low' | 'med' | 'high';
  assignedAgent?: string;
}

export interface MediaFeedItem {
  id: string;
  title: string;
  type: 'radar' | 'satellite' | 'ambience' | 'telemetry-stream';
  status: 'live' | 'buffering' | 'offline';
  fps?: number;
}

export interface ArtifactFile {
  filename: string;
  mime: string;
  sizeBytes: number;
  codeSnippet: string;
}

// -------------------------------------------------------------
// AGENT / RUNTIME CONTRACTS
// -------------------------------------------------------------

export interface ActiveRunState {
  runId: string;
  status: 'idle' | 'planning' | 'executing' | 'completed' | 'failed';
  currentGoal: string;
  activeTool?: string;
  stepIndex: number;
  totalSteps: number;
  elapsedMs: number;
  thoughtSnippet: string;
}

export interface TokenCostGlanceState {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  activeModel: string;
  costPerHourTrend: number;
}

export interface QueueStatusState {
  pendingTasks: number;
  runningTasks: number;
  failedRetries: number;
  laneDistribution: { high: number; default: number; background: number };
}

export interface ApprovalRequest {
  id: string;
  title: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  requester: string;
  timestamp: string;
  status: 'pending' | 'approved' | 'rejected';
  payloadSummary?: string;
}

export interface TaskWorkflowStep {
  id: string;
  label: string;
  status: 'completed' | 'in_progress' | 'pending' | 'failed';
  durationMs?: number;
}

export interface TaskWorkflowState {
  workflowId: string;
  name: string;
  overallPercent: number;
  etaSeconds: number;
  steps: TaskWorkflowStep[];
}

// -------------------------------------------------------------
// WEATHER AGENT CONTRACTS
// -------------------------------------------------------------

export interface WeatherAgentWidgetState {
  city: string;
  temperatureC: number;
  condition: string;
  humidityPercent: number;
  windSpeedKmh: number;
  precipitationMm: number;
  pressureHpa: number;
  forecastSnippet: string;
  lastUpdated: string;
}

// -------------------------------------------------------------
// SYSTEM TAXONOMY REGISTRY
// -------------------------------------------------------------

export const WIDGET_TAXONOMY: Record<WidgetCategory, { label: string; description: string; widgetIds: string[] }> = {
  'utility': {
    label: 'Utility',
    description: 'Calculators, precision clocks, controls, and deadline timers',
    widgetIds: ['countdown', 'clock', 'calculator', 'quick-controls']
  },
  'glance': {
    label: 'Glance',
    description: 'Instant operational telemetry, queue depth, jobs, and runtime state',
    widgetIds: ['metrics', 'jobs', 'queues', 'runtime-state']
  },
  'navigation': {
    label: 'Navigation',
    description: 'Command launcher, recent dashboards/queries, and quick shortcuts',
    widgetIds: ['launcher', 'recent-items', 'shortcuts']
  },
  'content': {
    label: 'Content',
    description: 'Execution checklists, ambient media feeds, and code artifact previews',
    widgetIds: ['list', 'media', 'artifact-preview']
  },
  'agent/runtime': {
    label: 'Agent / Runtime',
    description: 'Active run pipeline, token/cost glance, queue status, approvals, and workflow progress',
    widgetIds: ['active-run', 'token-cost-glance', 'queue-status', 'approvals', 'task-progress']
  },
  'weather': {
    label: 'Weather Agent',
    description: 'Weather intelligence dashboard agent widget with real-time Open-Meteo forecasts',
    widgetIds: ['weather-dashboard-agent']
  }
};

export const WIDGET_REGISTRY: Record<string, WidgetDefinition> = {
  // Utility
  'countdown': {
    id: 'countdown',
    title: 'Countdown Timer',
    category: 'utility',
    description: 'Absolute deadline timer immune to background tab sleep drifts',
    defaultSize: 'sm',
    iconName: 'Timer',
    tags: ['utility', 'deadline', 'timer', 'focus'],
    version: '1.2.0'
  },
  'clock': {
    id: 'clock',
    title: 'World & Precision Clock',
    category: 'utility',
    description: 'UTC offset, timezone selector, local solar time, and seconds sweep',
    defaultSize: 'sm',
    iconName: 'Clock',
    tags: ['utility', 'time', 'world-clock', 'timezone'],
    version: '1.0.0'
  },
  'calculator': {
    id: 'calculator',
    title: 'Utility Calculator',
    category: 'utility',
    description: 'Quick arithmetic and expression evaluator with history tape',
    defaultSize: 'sm',
    iconName: 'Calculator',
    tags: ['utility', 'math', 'calculator', 'history'],
    version: '1.0.0'
  },
  'quick-controls': {
    id: 'quick-controls',
    title: 'Quick Controls',
    category: 'utility',
    description: 'Runtime toggles for turbo execution, telemetry stream, chimes, and atmosphere',
    defaultSize: 'md',
    iconName: 'Sliders',
    tags: ['utility', 'controls', 'settings', 'theme'],
    version: '1.1.0'
  },

  // Glance
  'metrics': {
    id: 'metrics',
    title: 'Operational Metrics',
    category: 'glance',
    description: 'Throughput (req/s), latency p95, memory RSS, and event loop jitter',
    defaultSize: 'md',
    iconName: 'Activity',
    tags: ['glance', 'metrics', 'telemetry', 'latency'],
    version: '1.0.0'
  },
  'jobs': {
    id: 'jobs',
    title: 'Scheduled Jobs',
    category: 'glance',
    description: 'Cron scheduler status, next run projections, and trigger on-demand',
    defaultSize: 'md',
    iconName: 'CalendarClock',
    tags: ['glance', 'jobs', 'cron', 'batch'],
    version: '1.0.0'
  },
  'queues': {
    id: 'queues',
    title: 'Queue Depth',
    category: 'glance',
    description: 'Inbound message backlog, priority distribution, and dead-letter count',
    defaultSize: 'md',
    iconName: 'Layers',
    tags: ['glance', 'queues', 'backlog', 'throughput'],
    version: '1.0.0'
  },
  'runtime-state': {
    id: 'runtime-state',
    title: 'Runtime State',
    category: 'glance',
    description: 'Cluster health, active sandbox isolation, and node environment',
    defaultSize: 'sm',
    iconName: 'Server',
    tags: ['glance', 'runtime', 'health', 'cluster'],
    version: '1.0.0'
  },
  'cloudflare-observability': {
    id: 'cloudflare-observability',
    title: 'Cloudflare Worker Observability',
    category: 'glance',
    description: 'Live Cloudflare Worker telemetry, CPU wall time, and Workers Observability MCP tools',
    defaultSize: 'md',
    iconName: 'Cloud',
    tags: ['glance', 'cloudflare', 'workers', 'observability', 'telemetry'],
    version: '1.1.0'
  },
  'github-activity': {
    id: 'github-activity',
    title: 'GitHub Activity',
    category: 'glance',
    description: 'Repository PR status, CI checks, branch sync, and commit feed',
    defaultSize: 'sm',
    iconName: 'GitBranch',
    tags: ['glance', 'github', 'git', 'pull-requests', 'ci'],
    version: '1.0.0'
  },

  // Navigation
  'launcher': {
    id: 'launcher',
    title: 'Command Launcher',
    category: 'navigation',
    description: 'Quick-access command launcher for agent tasks and weather queries',
    defaultSize: 'md',
    iconName: 'Compass',
    tags: ['navigation', 'launcher', 'quick-actions'],
    version: '1.0.0'
  },
  'recent-items': {
    id: 'recent-items',
    title: 'Recent Items',
    category: 'navigation',
    description: 'Historical weather dashboards, query sessions, and generated configs',
    defaultSize: 'sm',
    iconName: 'History',
    tags: ['navigation', 'recent', 'history', 'queries'],
    version: '1.0.0'
  },
  'shortcuts': {
    id: 'shortcuts',
    title: 'Studio Shortcuts',
    category: 'navigation',
    description: 'Keyboard navigation and rapid action shortcuts cheatsheet',
    defaultSize: 'sm',
    iconName: 'Command',
    tags: ['navigation', 'shortcuts', 'keyboard', 'hotkeys'],
    version: '1.0.0'
  },

  // Content
  'list': {
    id: 'list',
    title: 'Task Checklist',
    category: 'content',
    description: 'Interactive execution checklist with priority flags and status tracking',
    defaultSize: 'md',
    iconName: 'CheckSquare',
    tags: ['content', 'tasks', 'checklist', 'todos'],
    version: '1.0.0'
  },
  'media': {
    id: 'media',
    title: 'Atmospheric Media',
    category: 'content',
    description: 'Live radar feed simulation and ambient acoustic atmospheric soundscapes',
    defaultSize: 'md',
    iconName: 'Radio',
    tags: ['content', 'media', 'radar', 'ambience'],
    version: '1.0.0'
  },
  'artifact-preview': {
    id: 'artifact-preview',
    title: 'Artifact Preview',
    category: 'content',
    description: 'Code and schema inspector for active widget contracts and dashboard configs',
    defaultSize: 'lg',
    iconName: 'FileCode2',
    tags: ['content', 'code', 'contracts', 'artifacts'],
    version: '1.0.0'
  },

  // Agent/Runtime
  'active-run': {
    id: 'active-run',
    title: 'Active Run Inspector',
    category: 'agent/runtime',
    description: 'Live agent execution step tracker, thought streaming, and tool calls',
    defaultSize: 'lg',
    iconName: 'PlayCircle',
    tags: ['agent/runtime', 'agent', 'execution', 'streaming'],
    version: '1.1.0'
  },
  'token-cost-glance': {
    id: 'token-cost-glance',
    title: 'Token & Cost Glance',
    category: 'agent/runtime',
    description: 'Real-time prompt/completion token counter and compute cost tally',
    defaultSize: 'sm',
    iconName: 'Coins',
    tags: ['agent/runtime', 'tokens', 'cost', 'metrics'],
    version: '1.0.0'
  },
  'queue-status': {
    id: 'queue-status',
    title: 'Agent Queue Status',
    category: 'agent/runtime',
    description: 'Agent worker pipeline, concurrent subtasks, and backpressure',
    defaultSize: 'sm',
    iconName: 'Network',
    tags: ['agent/runtime', 'workers', 'concurrency', 'queues'],
    version: '1.0.0'
  },
  'approvals': {
    id: 'approvals',
    title: 'Human Approvals',
    category: 'agent/runtime',
    description: 'Pending external tool actions and cost thresholds requiring review',
    defaultSize: 'md',
    iconName: 'ShieldAlert',
    tags: ['agent/runtime', 'approvals', 'safety', 'human-in-the-loop'],
    version: '1.1.0'
  },
  'task-progress': {
    id: 'task-progress',
    title: 'Workflow Progress',
    category: 'agent/runtime',
    description: 'Multi-stage workflow stepper with milestone timings and ETA',
    defaultSize: 'md',
    iconName: 'GitCommit',
    tags: ['agent/runtime', 'progress', 'stepper', 'pipeline'],
    version: '1.0.0'
  },

  // Weather
  'weather-dashboard-agent': {
    id: 'weather-dashboard-agent',
    title: 'Weather Dashboard Agent',
    category: 'weather',
    description: 'Instant weather synthesis with KPI cards, dynamic charts, and satellite view',
    defaultSize: 'full',
    iconName: 'CloudSun',
    tags: ['weather', 'agent', 'forecast', 'open-meteo'],
    version: '2.0.0'
  }
};
