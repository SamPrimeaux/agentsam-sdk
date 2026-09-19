import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = fs.readFileSync(new URL('../../app/CadCreatorApp.tsx', import.meta.url), 'utf8');
const shellSource = fs.readFileSync(new URL('../../app/CadCreatorShell.tsx', import.meta.url), 'utf8');
const loaderSource = fs.readFileSync(new URL('./lazy.tsx', import.meta.url), 'utf8');

describe('robotics workspace loading boundary', () => {
  it('keeps MuJoCo and the robotics workspace out of the base App import graph', () => {
    expect(appSource).not.toContain("from './workspaces/robotics/RoboticsWorkspace'");
    expect(appSource).not.toContain("from '../workspaces/robotics/RoboticsWorkspace'");
    expect(appSource).not.toContain("from './lib/robotics/simulation/mujoco-provider'");
    expect(appSource).not.toContain("from '../lib/robotics/simulation/mujoco-provider'");
    expect(appSource).not.toContain('new MujocoSimulationProvider(');
    expect(appSource).toContain('LazyRoboticsWorkspace');
  });

  it('loads the workspace through a dynamic import and preloads only on user intent', () => {
    expect(loaderSource).toContain("import('./RoboticsWorkspace')");
    expect(shellSource).toContain('preloadRoboticsWorkspace()');
    expect(shellSource).toContain('onMouseEnter');
    expect(shellSource).toContain('onFocus');
  });
});
