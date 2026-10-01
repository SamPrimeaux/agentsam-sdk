import {
  AgentSamError,
  ERROR_REASON,
  createToolError,
} from '@inneranimalmedia/agentsam-errors';

const TOOL = 'goap';

function resource(type, id = null, name = null) {
  return { type, id, name };
}

export function goapInputError(message, {
  stage = 'validate',
  resource: target = null,
  details = null,
} = {}) {
  return createToolError({
    reason: ERROR_REASON.INPUT_INVALID,
    message,
    tool: TOOL,
    stage,
    resource: target,
    details,
    operation: {
      kind: 'goap',
      action: stage,
      resource_type: target?.type || null,
      resource_id: target?.id || null,
      read_only: true,
      idempotent: true,
      side_effect_state: 'none',
    },
  });
}

export function goapTargetNotFound(type, id, {
  stage = 'resolve',
  message = null,
  details = null,
} = {}) {
  return createToolError({
    reason: ERROR_REASON.TARGET_NOT_FOUND,
    message: message || `${type} was not found.`,
    tool: TOOL,
    stage,
    resource: resource(type, id),
    details,
    operation: {
      kind: 'goap',
      action: stage,
      resource_type: type,
      resource_id: id,
      read_only: true,
      idempotent: true,
      side_effect_state: 'none',
    },
  });
}

export function goapStaleVersion({
  expectedRevision,
  actualRevision,
  blackboardId = null,
  stage = 'compare_and_swap',
  action = 'update_blackboard',
} = {}) {
  return createToolError({
    reason: ERROR_REASON.STALE_VERSION,
    message: 'GOAP state changed before this mutation could commit.',
    tool: TOOL,
    stage,
    failure_class: 'conflict',
    resource: resource('blackboard', blackboardId),
    details: {
      expected_revision: expectedRevision ?? null,
      actual_revision: actualRevision ?? null,
    },
    operation: {
      kind: 'mutation',
      action,
      resource_type: 'blackboard',
      resource_id: blackboardId,
      read_only: false,
      idempotent: true,
      side_effect_state: 'confirmed_not_applied',
    },
  });
}

export function goapAdapterError(message, {
  stage = 'adapter',
  adapter = null,
  details = null,
  cause = null,
} = {}) {
  return createToolError({
    reason: ERROR_REASON.INTERNAL_ADAPTER_FAILED,
    message,
    tool: TOOL,
    stage,
    resource: resource('adapter', adapter),
    details,
  }, cause ? { cause } : {});
}

export function goapInvariantError(message, {
  stage = 'execute',
  resource: target = null,
  details = null,
  sideEffectState = 'unknown',
} = {}) {
  return createToolError({
    reason: ERROR_REASON.INTERNAL_INVARIANT_VIOLATION,
    message,
    tool: TOOL,
    stage,
    resource: target,
    details,
    operation: {
      kind: 'goap',
      action: stage,
      resource_type: target?.type || null,
      resource_id: target?.id || null,
      read_only: false,
      idempotent: false,
      side_effect_state: sideEffectState,
    },
  });
}

export function goapPersistenceError(cause, {
  stage = 'persistence',
  resource: target = null,
  details = null,
  operation = null,
} = {}) {
  if (cause instanceof AgentSamError) return cause;

  return createToolError({
    reason: ERROR_REASON.PERSISTENCE_FAILED,
    message: 'GOAP persistence operation failed.',
    tool: TOOL,
    stage,
    resource: target,
    details,
    operation: operation || {
      kind: 'persistence',
      action: stage,
      resource_type: target?.type || null,
      resource_id: target?.id || null,
      read_only: false,
      idempotent: false,
      side_effect_state: 'unknown',
    },
  }, { cause });
}
