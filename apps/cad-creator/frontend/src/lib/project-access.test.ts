import { describe, expect, it } from 'vitest';
import { createEmptyCadProject } from './create-empty-project';
import { cloneProjectForPublicUser, createPublicExampleProject, isTrustedLocalCadHost, resolveCadAccessMode } from './project-access';

describe('CAD project access boundaries', () => {
  it('permits owner mode only for an explicit loopback request', () => {
    expect(resolveCadAccessMode('owner', '127.0.0.1')).toBe('owner');
    expect(resolveCadAccessMode('owner', 'localhost')).toBe('owner');
    expect(resolveCadAccessMode('owner', '[::1]')).toBe('owner');
    expect(resolveCadAccessMode('owner', 'cad.inneranimalmedia.com')).toBe('public-demo');
    expect(resolveCadAccessMode('project', 'agentsam.inneranimalmedia.com')).toBe('hosted-project');
    expect(resolveCadAccessMode(null, 'localhost')).toBe('public-demo');
    expect(isTrustedLocalCadHost('cad.inneranimalmedia.com')).toBe(false);
  });

  it('creates a separate example project without mutating the catalog template', () => {
    const source = createEmptyCadProject();
    source.id = 'registered-source';
    source.name = 'Source project';
    source.walls.push({ id: 'wall-source', x1: 0, y1: 0, x2: 120, y2: 0, thickness: 6, height3D: 96, material: 'wood_panel' });
    const originalWallCount = source.walls.length;
    const example = createPublicExampleProject();
    expect(example.id).not.toBe(source.id);
    expect(example.id).toMatch(/^demo_/);
    expect(example.name).toBe('Untitled CAD project');
    expect(example.walls).toHaveLength(0);
    const copy = cloneProjectForPublicUser(source, 'Independent copy');
    copy.walls.pop();
    expect(source.walls).toHaveLength(originalWallCount);
    expect(source.id).toBe('registered-source');
  });

  it('clones a published DreamHouse example into a user-owned demo identity', () => {
    const published = { ...createEmptyCadProject(), id: 'dreamhouse-v1-wip', name: 'DreamHouse V1.1' };
    const userCopy = cloneProjectForPublicUser(published, 'DreamHouse · Personal Example');
    expect(userCopy.id).not.toBe('dreamhouse-v1-wip');
    expect(userCopy.id).toMatch(/^demo_/);
    expect(userCopy.name).toBe('DreamHouse · Personal Example');
    expect(published.id).toBe('dreamhouse-v1-wip');
  });
});
