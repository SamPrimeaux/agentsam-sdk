export function routeIntent({ message = '', agent = 'orchestrator', lane = 'fullstack' }) {
  const text = String(message).toLowerCase();

  if (/delete|drop table|destroy|wipe|purge|production/.test(text)) {
    return {
      agent,
      lane,
      intent: 'high_risk_action',
      requires_approval: true,
      next_steps: ['Summarize intended change', 'Request explicit approval', 'Run only after approval'],
    };
  }

  if (/page|cms|publish|section|hero|content/.test(text)) {
    return {
      agent: 'cms',
      lane: 'cms',
      intent: 'cms_build',
      requires_approval: false,
      next_steps: ['Create page outline', 'Attach visual assets', 'Prepare draft for preview'],
    };
  }

  if (/database|sql|query|migration|schema|supabase|d1/.test(text)) {
    return {
      agent: 'data',
      lane: 'data',
      intent: 'data_task',
      requires_approval: false,
      next_steps: ['Inspect schema', 'Draft safe query or migration', 'Return reviewable plan'],
    };
  }

  if (/design|3d|cad|media|video|image|creative/.test(text)) {
    return {
      agent: 'creative',
      lane: 'creative',
      intent: 'creative_task',
      requires_approval: false,
      next_steps: ['Create production brief', 'Identify assets needed', 'Prepare generation or build steps'],
    };
  }

  return {
    agent,
    lane,
    intent: 'general_build',
    requires_approval: false,
    next_steps: ['Understand goal', 'Plan the work', 'Route to the right specialist'],
  };
}
