import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = fs.readFileSync(new URL('../../app/CadCreatorApp.tsx', import.meta.url), 'utf8');
const toolbarSource = fs.readFileSync(new URL('../../components/EngineeringWorkbench.tsx', import.meta.url), 'utf8');
const loaderSource = fs.readFileSync(new URL('./lazy.tsx', import.meta.url), 'utf8');
const mujocoSource = fs.readFileSync(new URL('../../lib/robotics/simulation/mujoco-provider.ts', import.meta.url), 'utf8');

describe('robotics workspace loading boundary', () => {
  it('keeps MuJoCo and the robotics workspace out of the base App import graph', () => {
    expect(appSource).not.toContain("from './workspaces/robotics/RoboticsWorkspace'");
    expect(appSource).not.toContain("from '../workspaces/robotics/RoboticsWorkspace'");
    expect(appSource).not.toContain("from './lib/robotics/simulation/mujoco-provider'");
    expect(appSource).not.toContain("from '../lib/robotics/simulation/mujoco-provider'");
    expect(appSource).not.toContain('new MujocoSimulationProvider(');
    expect(appSource).toContain('LazyRoboticsWorkspace');
  });

  it('loads robotics only on explicit workspace selection and splits MuJoCo runtime', () => {
    expect(loaderSource).toContain("import('./RoboticsWorkspace')");
    expect(appSource).toContain('preloadRoboticsWorkspace()');
    expect(toolbarSource).not.toContain('onMouseEnter={()=>void preloadRoboticsWorkspace()');
    expect(toolbarSource).not.toContain('onFocus={()=>void preloadRoboticsWorkspace()');
    expect(mujocoSource).toContain("import('mujoco-js')");
    expect(mujocoSource).not.toContain("import loadMujoco from 'mujoco-js'");
  });
});
