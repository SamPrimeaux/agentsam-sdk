import { describe, it, expect } from 'vitest';
import { buildSelectionContext, proposeWallHeight } from './selection';
import { CAD_WORKSPACES } from '../agentsam-preview-bridge';
describe('cad selection + proposal', () => {
  it('builds real selection context in inches', () => {
    const s = buildSelectionContext({ workspace:'model', projectId:'p1', revision:4, objectId:'wall-04', objectType:'wall', label:'Exterior wall' });
    expect(s).toMatchObject({ source:'cad-creator', revision:4, object:{id:'wall-04',units:'in'} });
  });
  it('proposal is revision-guarded design_apply_operation, not auto-apply', () => {
    const s = buildSelectionContext({ workspace:'model', projectId:'p1', revision:4, objectId:'wall-04', objectType:'wall', label:'Exterior wall' });
    const pr = proposeWallHeight(s, 96, 120);
    expect(pr.tool).toBe('design_apply_operation');
    expect(pr.args).toMatchObject({ expected_revision:4, operation:{type:'update_wall',wallId:'wall-04',updates:{height3D:120}} });
    expect(pr.summary).toContain('96 in → 120 in');
  });
  it('workspaces stay the canonical five', () => { expect([...CAD_WORKSPACES]).toEqual(['plan','model','parametric','robotics','render']); });
});
