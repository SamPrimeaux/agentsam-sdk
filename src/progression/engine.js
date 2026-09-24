/**
 * Generic AgentSam progression engine — not brand-specific.
 * Capabilities emit state + findings; this ranks next_actions for any domain.
 */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   reason: string,
 *   command?: string,
 *   capability?: string,
 *   priority?: number,
 *   requires_model?: boolean,
 *   safe?: boolean,
 * }} NextAction
 */

/**
 * @param {{
 *   capability: string,
 *   result?: object,
 *   session?: object,
 *   rules?: Array<{
 *     when: (ctx: object) => boolean,
 *     action: NextAction | ((ctx: object) => NextAction)
 *   }>
 * }} opts
 * @returns {{ next_actions: NextAction[] }}
 */
export function suggestNextActions(opts = {}) {
  const ctx = {
    capability: opts.capability || '',
    result: opts.result || {},
    session: opts.session || {},
  };

  const rules = opts.rules?.length ? opts.rules : defaultRules();
  const out = [];
  for (const rule of rules) {
    try {
      if (!rule.when(ctx)) continue;
      const action = typeof rule.action === 'function' ? rule.action(ctx) : rule.action;
      if (action?.id) out.push({
        requires_model: false,
        safe: true,
        priority: 50,
        ...action,
      });
    } catch {
      // ignore broken rules
    }
  }

  out.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  // de-dupe by id
  const seen = new Set();
  const next_actions = [];
  for (const a of out) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    next_actions.push(a);
  }
  return { next_actions };
}

function defaultRules() {
  return [
    {
      when: (ctx) => ctx.capability === 'brand.scan' && (ctx.result.conflicts?.length || 0) > 0,
      action: (ctx) => ({
        id: 'brand.inspect.conflicts',
        label: 'Inspect token conflicts',
        reason: `${ctx.result.conflicts.length} probable conflicts discovered`,
        command: 'agentsam brand inspect conflicts',
        capability: 'brand.inspect',
        priority: 90,
      }),
    },
    {
      when: (ctx) => ctx.capability === 'brand.scan' && ctx.result.complete !== false,
      action: {
        id: 'brand.plan',
        label: 'Generate a brand normalization plan',
        reason: 'Scan complete — plan preserve/normalize/migrate steps',
        command: 'agentsam plan brand',
        capability: 'brand.plan',
        priority: 80,
      },
    },
    {
      when: (ctx) => ctx.capability === 'brand.scan',
      action: {
        id: 'brand.resolve',
        label: 'Resolve semantic color roles',
        reason: 'Cluster near-duplicate colors into inferred roles',
        command: 'agentsam brand resolve',
        capability: 'brand.resolve',
        priority: 75,
      },
    },
    {
      when: (ctx) => ctx.capability === 'brand.plan',
      action: {
        id: 'brand.apply.preview',
        label: 'Review apply steps (dry-run)',
        reason: 'Mutations require explicit approval',
        command: 'agentsam brand apply --dry-run',
        capability: 'brand.apply',
        priority: 70,
        safe: true,
      },
    },
    {
      when: (ctx) => ctx.capability === 'repository.snapshot',
      action: {
        id: 'brand.scan',
        label: 'Scan brand evidence',
        reason: 'Repository authority ready — discover visual language',
        command: 'agentsam brand scan',
        capability: 'brand.scan',
        priority: 85,
      },
    },
    {
      when: (ctx) => ctx.capability === 'brand.scan' || ctx.capability === 'repository.snapshot',
      action: {
        id: 'inspect.repository',
        label: 'Inspect repository snapshot',
        reason: 'Review classified files and trust boundary',
        command: 'agentsam inspect',
        capability: 'repository.snapshot',
        priority: 40,
      },
    },
  ];
}

/**
 * Deterministic intent router for free-text without a model.
 */
export function routeDeterministicIntent(text, session = {}) {
  const q = String(text || '').trim().toLowerCase();
  if (!q) return null;

  if (/^(status|where am i)\b/.test(q) || q === 'status') {
    return { intent: 'status', command: 'agentsam status' };
  }
  if (/what (should|can) i do next|what next|^next\b|suggest/.test(q)) {
    return { intent: 'next', use_progression: true };
  }
  if (/show (me )?(the )?brand|brand status|what.*(brand|colors)/.test(q)) {
    return { intent: 'show-brand', command: 'agentsam brand' };
  }
  if (/show (me )?(the )?plan|what.*(plan)/.test(q)) {
    return { intent: 'show-plan', command: 'agentsam plan brand' };
  }
  if (/what (did you )?find|show findings|inconsisten/.test(q)) {
    return { intent: 'show-findings', command: 'agentsam brand inspect conflicts' };
  }
  if (/^help\b|\?$/.test(q)) {
    return { intent: 'help', command: 'agentsam help' };
  }
  if (/continue|keep going/.test(q)) {
    return { intent: 'continue', use_progression: true };
  }
  if (session.last_capability && /explain|why/.test(q)) {
    return { intent: 'explain-last', command: null };
  }
  return null;
}
