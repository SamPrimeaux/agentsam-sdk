import type { CadSelectionContext } from '../agentsam-preview-bridge';
export type { CadSelectionContext };
export function buildSelectionContext(args: { workspace: string; projectId: string; revision: number; objectId: string; objectType: string; label: string }): CadSelectionContext {
  if (!args.objectId) throw new Error('selection_requires_real_object_id');
  return { source: 'cad-creator', workspace: args.workspace, project_id: args.projectId, revision: args.revision, object: { id: args.objectId, type: args.objectType, label: args.label, units: 'in' } };
}
/** Proposal only — applying requires explicit approval + canonical design_apply_operation with expected_revision. */
export function proposeWallHeight(sel: CadSelectionContext, currentIn: number, nextIn: number) {
  if (sel.object.type !== 'wall') throw new Error('proposal_requires_wall_selection');
  if (!(nextIn > 0)) throw new Error('invalid_height');
  return {
    summary: `${sel.object.label} (${sel.object.id}): height ${currentIn} in → ${nextIn} in.`,
    tool: 'design_apply_operation' as const,
    args: { project_id: sel.project_id, expected_revision: sel.revision, operation: { type: 'update_wall', wallId: sel.object.id, updates: { height3D: nextIn } } },
  };
}

/** UI project versions are not database revisions. Unverified selections never grant edit authority. */
export function verifiedSelectionRevision(projectId: string, verified: { projectId: string; revision: number } | null): number | null {
  if (!verified || verified.projectId !== projectId || !Number.isSafeInteger(verified.revision) || verified.revision < 1) return null;
  return verified.revision;
}
