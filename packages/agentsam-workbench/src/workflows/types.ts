/**
 * Workflow Studio presentation model.
 *
 * This is a UI projection of a host-owned, versioned workflow graph. It is not
 * a persistence adapter, execution engine, database schema, or route contract.
 * The host maps its authoritative records into this model and supplies every
 * operation through WorkflowStudioHost.
 */
export type WorkflowLifecycle = "draft" | "active" | "disabled" | "retired";
export type WorkflowScopeType = "platform" | "account";
export type WorkflowNodeKind =
  | "action"
  | "agent"
  | "branch"
  | "approval"
  | "parallel"
  | "join"
  | "output";
export type WorkflowResolutionMode = "routed" | "pinned";
export type WorkflowEdgeConditionType = "always" | "status" | "field" | "branch";

export type WorkflowNodeStatus =
  | "idle"
  | "pending"
  | "queued"
  | "running"
  | "waiting"
  | "success"
  | "completed"
  | "failed"
  | "skipped"
  | "approval_pending"
  | "timed_out"
  | "retrying";

export type WorkflowRunStatus =
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

export type WorkflowNodeUi = {
  position?: { x?: number; y?: number };
  color?: string;
  collapsed?: boolean;
  [key: string]: unknown;
};

export type WorkflowEdgeUi = {
  label?: string;
  color?: string;
  [key: string]: unknown;
};

export type WorkflowGraphNode = {
  /** Host-assigned persisted ID; omitted for a newly added draft node. */
  id?: string;
  nodeKey: string;
  kind: WorkflowNodeKind;
  title: string;
  description?: string | null;
  resolutionMode?: WorkflowResolutionMode | null;
  capabilityKey?: string | null;
  pinnedToolId?: string | null;
  agentProfileId?: string | null;
  config?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  retryPolicy?: Record<string, unknown>;
  timeoutMs?: number | null;
  ui?: WorkflowNodeUi;
};

export type WorkflowGraphEdge = {
  /** Host-assigned persisted ID; omitted for a newly added draft edge. */
  id?: string;
  fromNodeKey: string;
  toNodeKey: string;
  conditionType: WorkflowEdgeConditionType;
  condition?: Record<string, unknown>;
  priority?: number;
  isFallback?: boolean;
  ui?: WorkflowEdgeUi;
};

export type WorkflowGraph = {
  id: string;
  workflowKey: string;
  revision: number;
  scopeType: WorkflowScopeType;
  accountId?: string | null;
  displayName: string;
  description?: string | null;
  lifecycle: WorkflowLifecycle;
  entryNodeKey?: string | null;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  ui?: Record<string, unknown>;
};

export type WorkflowCapabilityOption = {
  key: string;
  label: string;
  description?: string;
  ready?: boolean;
};

export type WorkflowToolOption = {
  id: string;
  label: string;
  description?: string;
  ready?: boolean;
  capabilityKey?: string | null;
  toolKey?: string | null;
  handlerType?: string | null;
  dispatchTarget?: string | null;
  riskLevel?: string | null;
  requiresApproval?: boolean;
};

export type WorkflowAgentProfileOption = {
  id: string;
  label: string;
  description?: string;
  profileKey?: string | null;
  modelKey?: string | null;
};

export type WorkflowValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  nodeKey?: string;
  edgeIndex?: number;
};

export type WorkflowValidationResult = {
  ok: boolean;
  issues: WorkflowValidationIssue[];
  /** Optional host-owned receipt/reference for a real validation operation. */
  receiptId?: string | null;
};

export type WorkflowRunSummary = {
  id: string;
  status: WorkflowRunStatus;
  triggerKind?: string | null;
  waitingReason?: string | null;
  createdAt?: number | null;
  startedAt?: number | null;
  completedAt?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
};

export type WorkflowRunStep = {
  id: string;
  nodeKey: string;
  status: WorkflowNodeStatus;
  attempt?: number;
  startedAt?: number | null;
  completedAt?: number | null;
  latencyMs?: number | null;
  errorMessage?: string | null;
  outputSummary?: string | null;
  approvalId?: string | null;
  approvalStatus?: string | null;
  capabilityKey?: string | null;
  toolKey?: string | null;
  authorizedOperation?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  resourceRevision?: string | null;
  approvedBy?: string | null;
  decisionReason?: string | null;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
};

/** Host-owned actions. No URL, database, queue, or runtime is assumed here. */
export type WorkflowStudioHost = {
  saveDraft?: (graph: WorkflowGraph) => Promise<WorkflowGraph>;
  validate?: (graph: WorkflowGraph) => Promise<WorkflowValidationResult>;
  activate?: (graph: WorkflowGraph) => Promise<WorkflowGraph>;
  run?: (graph: WorkflowGraph, input?: Record<string, unknown>) => Promise<WorkflowRunSummary>;
};

export type WorkflowStudioProps = {
  workflow: WorkflowGraph | null;
  host?: WorkflowStudioHost;
  loading?: boolean;
  error?: string | null;
  readOnly?: boolean;
  capabilities?: WorkflowCapabilityOption[];
  tools?: WorkflowToolOption[];
  agentProfiles?: WorkflowAgentProfileOption[];
  run?: WorkflowRunSummary | null;
  runSteps?: WorkflowRunStep[];
  onChange?: (workflow: WorkflowGraph) => void;
  onRetry?: () => void;
  onClose?: () => void;
};
