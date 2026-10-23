import { describe, expect, it } from 'vitest';
import { TEMPLATES } from './templates';
import { cloneProjectForPublicUser, createPublicExampleProject, isTrustedLocalCadHost, resolveCadAccessMode } from './project-access';

describe('CAD project access boundaries', () => {
  it('permits owner mode only for an explicit loopback request', () => {
    expect(resolveCadAccessMode('owner', '127.0.0.1')).toBe('owner');
    expect(resolveCadAccessMode('owner', 'localhost')).toBe('owner');
    expect(resolveCadAccessMode('owner', '[::1]')).toBe('owner');
    expect(resolveCadAccessMode('owner', 'cad.inneranimalmedia.com')).toBe('public-demo');
    expect(resolveCadAccessMode(null, 'localhost')).toBe('public-demo');
    expect(isTrustedLocalCadHost('cad.inneranimalmedia.com')).toBe(false);
  });

  it('creates a separate example project without mutating the catalog template', () => {
    const template = TEMPLATES.modern_villa;
    const originalId = template.id;
    const originalWallCount = template.walls.length;
    const example = createPublicExampleProject();
    expect(example.id).not.toBe(originalId);
    expect(example.id).toMatch(/^demo_/);
    expect(example.name).toBe('Example Home');
    expect(example.walls).toHaveLength(originalWallCount);
    example.walls.pop();
    expect(template.walls).toHaveLength(originalWallCount);
    expect(template.id).toBe(originalId);
  });

  it('clones a published DreamHouse example into a user-owned demo identity', () => {
    const published = { ...TEMPLATES.modern_villa, id: 'dreamhouse-v1-wip', name: 'DreamHouse V1.1' };
    const userCopy = cloneProjectForPublicUser(published, 'DreamHouse · Personal Example');
    expect(userCopy.id).not.toBe('dreamhouse-v1-wip');
    expect(userCopy.id).toMatch(/^demo_/);
    expect(userCopy.name).toBe('DreamHouse · Personal Example');
    expect(published.id).toBe('dreamhouse-v1-wip');
  });
});
