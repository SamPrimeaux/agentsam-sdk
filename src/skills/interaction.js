/**
 * AgentSamInteraction — host-agnostic next-step contract.
 * Separate from modelInstructions (what the model sees this turn).
 */

/**
 * @typedef {{
 *   status: 'ready'|'needs_input'|'needs_approval'|'blocked'|'complete',
 *   prompt?: {
 *     kind: 'info'|'text'|'select'|'multiselect'|'confirm'|'error',
 *     code?: string,
 *     title?: string,
 *     message: string,
 *     options?: Array<{ value: string, label: string, description?: string }>,
 *     actions?: Array<{ id: string, label: string }>,
 *   }
 * }} AgentSamInteraction
 */

/** @returns {AgentSamInteraction} */
export function interactionReady() {
  return { status: 'ready' };
}

/** @returns {AgentSamInteraction} */
export function interactionComplete(message) {
  return {
    status: 'complete',
    prompt: message
      ? { kind: 'info', message: String(message) }
      : undefined,
  };
}

/**
 * @param {{ code?: string, title?: string, message: string, actions?: Array<{id:string,label:string}> }} opts
 * @returns {AgentSamInteraction}
 */
export function interactionBlocked(opts) {
  return {
    status: 'blocked',
    prompt: {
      kind: 'error',
      code: opts.code,
      title: opts.title,
      message: opts.message,
      actions: opts.actions,
    },
  };
}

/**
 * @param {{ title?: string, message: string, options: Array<{value:string,label:string,description?:string}> }} opts
 * @returns {AgentSamInteraction}
 */
export function interactionNeedsSelect(opts) {
  return {
    status: 'needs_input',
    prompt: {
      kind: 'select',
      title: opts.title,
      message: opts.message,
      options: opts.options,
    },
  };
}

/**
 * @param {string} trigger
 * @param {string[]} suggestions
 * @returns {AgentSamInteraction}
 */
export function interactionUnknownSkill(trigger, suggestions = []) {
  const lines = [
    `Unknown skill ${trigger}`,
    '',
    ...(suggestions.length
      ? ['Did you mean?', ...suggestions.map((s) => `  ${s}`), '']
      : [
          'No close matches in this registry.',
          '',
          'Create it locally:',
          `  agentsam skill create ${String(trigger).replace(/^\//, '') || 'my-skill'}`,
          '',
        ]),
    'List installed triggers with /skills, or create/install a skill when the list is empty.',
  ];
  return {
    status: 'blocked',
    prompt: {
      kind: 'error',
      code: 'SKILL_NOT_FOUND',
      title: 'Unknown skill',
      message: lines.join('\n'),
      actions: [
        { id: 'create', label: 'Create skill' },
        { id: 'list', label: 'List skills' },
        { id: 'cancel', label: 'Cancel' },
      ],
    },
  };
}
