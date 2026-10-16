import { describe, expect, it } from 'vitest';
import { PRIMARY_WORKSPACES, primaryWorkspaceFor } from './workspaceRegistry';

describe('CAD primary experience taxonomy', () => {
  it('has only Plan, Explore, Robotics as primary destinations', () => {
    expect(PRIMARY_WORKSPACES.map(x => x.id)).toEqual(['plan', 'model', 'robotics']);
    expect(PRIMARY_WORKSPACES.map(x => x.shortName)).toEqual(['Plan', 'Explore', 'Robotics']);
    expect(PRIMARY_WORKSPACES.every(x => x.isPrimary)).toBe(true);
  });
  it('preserves legacy deep-link names as Explore tools, not phantom primary workspaces', () => {
    expect(primaryWorkspaceFor('parametric')).toBe('model');
    expect(primaryWorkspaceFor('render')).toBe('model');
    expect(primaryWorkspaceFor('model')).toBe('model');
    expect(primaryWorkspaceFor('robotics')).toBe('robotics');
    expect(primaryWorkspaceFor('plan')).toBe('plan');
  });
});
