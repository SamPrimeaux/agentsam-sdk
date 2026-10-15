/** Tiny, dependency-free Plan operation identifiers; safe during CLI bootstrap. */
export const PLAN_READ_OPERATIONS = Object.freeze(['plan.list', 'plan.show', 'plan.next', 'planning.goap']);
export const PLAN_WRITE_OPERATIONS = Object.freeze([
  'plan.create', 'plan.step.add', 'plan.step.status', 'plan.step.evidence',
  'plan.step.accept', 'plan.step.depends', 'plan.status',
]);
