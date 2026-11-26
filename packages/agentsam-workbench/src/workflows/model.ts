import type {
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowValidationIssue,
  WorkflowValidationResult,
} from "./types";

export const WORKFLOW_NODE_SIZE = { width: 236, height: 104 } as const;
export const WORKFLOW_GRID_SIZE = 20;

export function resolveWorkflowNodePositions(
  nodes: WorkflowGraphNode[],
  edges: WorkflowGraphEdge[],
): Record<string, { x: number; y: number }> {
  const automatic = autoLayoutWorkflowNodes(nodes, edges);
  const result: Record<string, { x: number; y: number }> = {};
  for (const node of nodes) {
    const position = node.ui?.position;
    const x = Number(position?.x);
    const y = Number(position?.y);
    result[node.nodeKey] = Number.isFinite(x) && Number.isFinite(y)
      ? { x, y }
      : automatic[node.nodeKey] ?? { x: 72, y: 72 };
  }
  return result;
}

/** Deterministic topological layout. Cyclic/unreachable nodes remain visible. */
export function autoLayoutWorkflowNodes(
  nodes: WorkflowGraphNode[],
  edges: WorkflowGraphEdge[],
  options: { originX?: number; originY?: number; columnGap?: number; rowGap?: number } = {},
): Record<string, { x: number; y: number }> {
  const originX = options.originX ?? 72;
  const originY = options.originY ?? 72;
  const columnGap = options.columnGap ?? 316;
  const rowGap = options.rowGap ?? 164;
  const keys = [...new Set(nodes.map((node) => node.nodeKey).filter(Boolean))];
  const known = new Set(keys);
  const indegree = new Map(keys.map((key) => [key, 0]));
  const outgoing = new Map(keys.map((key) => [key, [] as string[]]));

  for (const edge of edges) {
    if (!known.has(edge.fromNodeKey) || !known.has(edge.toNodeKey)) continue;
    outgoing.get(edge.fromNodeKey)!.push(edge.toNodeKey);
    indegree.set(edge.toNodeKey, (indegree.get(edge.toNodeKey) ?? 0) + 1);
  }

  let frontier = keys.filter((key) => indegree.get(key) === 0).sort();
  const layers: string[][] = [];
  const visited = new Set<string>();
  while (frontier.length) {
    const layer = frontier.filter((key) => !visited.has(key));
    if (!layer.length) break;
    layers.push(layer);
    layer.forEach((key) => visited.add(key));
    const next = new Set<string>();
    for (const key of layer) {
      for (const target of outgoing.get(key) ?? []) {
        indegree.set(target, (indegree.get(target) ?? 1) - 1);
        if (indegree.get(target) === 0 && !visited.has(target)) next.add(target);
      }
    }
    frontier = [...next].sort();
  }

  const remaining = keys.filter((key) => !visited.has(key)).sort();
  if (remaining.length) layers.push(remaining);

  const positions: Record<string, { x: number; y: number }> = {};
  layers.forEach((layer, column) => {
    layer.forEach((key, row) => {
      positions[key] = { x: originX + column * columnGap, y: originY + row * rowGap };
    });
  });
  return positions;
}

/**
 * Local structural checks only. This does not resolve capabilities, verify
 * permissions, test provider connections, or prove that a workflow can run.
 */
export function validateWorkflowGraph(
  graph: WorkflowGraph,
  options: { forActivation?: boolean } = {},
): WorkflowValidationResult {
  const issues: WorkflowValidationIssue[] = [];
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const nodeByKey = new Map<string, WorkflowGraphNode>();

  if (!nodes.length) {
    issues.push({ severity: "error", code: "workflow_nodes_required", message: "Add at least one node." });
  }

  for (const node of nodes) {
    const key = node.nodeKey?.trim();
    if (!key) {
      issues.push({ severity: "error", code: "workflow_node_key_required", message: "Every node needs a stable key." });
      continue;
    }
    if (nodeByKey.has(key)) {
      issues.push({ severity: "error", code: "workflow_node_key_duplicate", nodeKey: key, message: `Node key “${key}” is duplicated.` });
    } else {
      nodeByKey.set(key, node);
    }

    if (node.kind === "action") {
      if (!node.capabilityKey?.trim()) {
        issues.push({ severity: "error", code: "workflow_action_capability_required", nodeKey: key, message: "Every action must resolve to a registered capability." });
      }
      if (node.resolutionMode === "routed" && !node.capabilityKey?.trim()) {
        issues.push({ severity: "error", code: "workflow_action_capability_required", nodeKey: key, message: "Choose a capability for this routed action." });
      } else if (node.resolutionMode === "pinned" && !node.pinnedToolId?.trim()) {
        issues.push({ severity: "error", code: "workflow_action_tool_required", nodeKey: key, message: "Choose a tool for this pinned action." });
      } else if (!node.resolutionMode) {
        issues.push({ severity: "error", code: "workflow_action_resolution_required", nodeKey: key, message: "Choose routed capability or pinned tool resolution." });
      }
    } else if (node.kind === "agent" && !node.agentProfileId?.trim()) {
      issues.push({ severity: "error", code: "workflow_agent_profile_required", nodeKey: key, message: "Choose an active agent profile owned by this user or provided globally." });
    } else if (node.resolutionMode || node.capabilityKey || node.pinnedToolId) {
      issues.push({ severity: "error", code: "workflow_non_action_resolution_forbidden", nodeKey: key, message: "Only action nodes can declare capability or pinned-tool resolution." });
    }
  }

  if (graph.entryNodeKey && !nodeByKey.has(graph.entryNodeKey)) {
    issues.push({ severity: "error", code: "workflow_entry_node_missing", message: "The configured entry node does not exist." });
  } else if (!graph.entryNodeKey) {
    issues.push({
      severity: options.forActivation || graph.lifecycle === "active" ? "error" : "warning",
      code: "workflow_entry_node_required",
      message: "Choose an entry node before activating this workflow.",
    });
  }

  const edgeKeys = new Set<string>();
  edges.forEach((edge, index) => {
    const from = edge.fromNodeKey;
    const to = edge.toNodeKey;
    if (!nodeByKey.has(from)) {
      issues.push({ severity: "error", code: "workflow_edge_source_missing", edgeIndex: index, message: `Connection source “${from}” does not exist.` });
    }
    if (!nodeByKey.has(to)) {
      issues.push({ severity: "error", code: "workflow_edge_target_missing", edgeIndex: index, message: `Connection target “${to}” does not exist.` });
    }
    if (from && from === to) {
      issues.push({ severity: "error", code: "workflow_edge_self_reference", edgeIndex: index, message: "A node cannot connect to itself." });
    }
    const uniqueKey = [from, to, edge.conditionType, edge.priority ?? 0].join("\u0000");
    if (edgeKeys.has(uniqueKey)) {
      issues.push({ severity: "error", code: "workflow_edge_duplicate", edgeIndex: index, message: "This connection duplicates an existing connection at the same priority." });
    }
    edgeKeys.add(uniqueKey);
  });

  for (const node of nodes.filter((candidate) => candidate.kind === "approval")) {
    const config = node.config ?? {};
    const outgoingActions = edges
      .filter((edge) => edge.fromNodeKey === node.nodeKey)
      .map((edge) => nodeByKey.get(edge.toNodeKey))
      .filter((candidate): candidate is WorkflowGraphNode => candidate?.kind === "action");
    const explicitTarget = String(config.target_node_key ?? config.targetNodeKey ?? "").trim();
    const targetKey = explicitTarget || (outgoingActions.length === 1 ? outgoingActions[0].nodeKey : "");
    const target = targetKey ? nodeByKey.get(targetKey) : undefined;
    if (!target || target.kind !== "action") {
      issues.push({ severity: "error", code: "workflow_approval_target_required", nodeKey: node.nodeKey, message: "Choose one connected action that this approval authorizes." });
      continue;
    }
    if (!edges.some((edge) => edge.fromNodeKey === node.nodeKey && edge.toNodeKey === targetKey)) {
      issues.push({ severity: "error", code: "workflow_approval_target_not_connected", nodeKey: node.nodeKey, message: "The approved action must be directly connected to this approval gate." });
    }
    const actionConfig = target.config ?? {};
    const operation = actionConfig.authorized_operation ?? actionConfig.authorizedOperation ?? actionConfig.operation ?? actionConfig.operation_key;
    const resourceType = actionConfig.resource_type ?? actionConfig.resourceType;
    const resourceId = actionConfig.resource_id ?? actionConfig.resourceId ?? actionConfig.resource_id_path ?? actionConfig.resourceIdPath;
    const resourceRevision = actionConfig.resource_revision ?? actionConfig.resourceRevision ?? actionConfig.resource_revision_path ?? actionConfig.resourceRevisionPath;
    if (!String(operation ?? "").trim()) {
      issues.push({ severity: "error", code: "workflow_approval_operation_required", nodeKey: target.nodeKey, message: "The target action needs an explicit authorized operation." });
    }
    if (!String(resourceType ?? "").trim()) {
      issues.push({ severity: "error", code: "workflow_approval_resource_type_required", nodeKey: target.nodeKey, message: "The target action needs a resource type." });
    }
    if (!String(resourceId ?? "").trim()) {
      issues.push({ severity: "error", code: "workflow_approval_resource_id_required", nodeKey: target.nodeKey, message: "Bind the target resource ID using a value or input path." });
    }
    if (!String(resourceRevision ?? "").trim()) {
      issues.push({ severity: "error", code: "workflow_approval_resource_revision_required", nodeKey: target.nodeKey, message: "Bind the exact resource revision that the action will modify." });
    }
  }

  const errors = issues.some((issue) => issue.severity === "error");
  return { ok: !errors, issues };
}

export function workflowEdgeKey(edge: WorkflowGraphEdge, index: number): string {
  return edge.id ?? `${edge.fromNodeKey}->${edge.toNodeKey}:${edge.conditionType}:${edge.priority ?? 0}:${index}`;
}

export function createWorkflowNodeKey(kind: string, existing: string[]): string {
  const base = kind.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "node";
  const used = new Set(existing);
  let suffix = 1;
  let candidate = `${base}-${suffix}`;
  while (used.has(candidate)) candidate = `${base}-${++suffix}`;
  return candidate;
}
