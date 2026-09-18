import React from 'react';

let roboticsWorkspacePromise:
  | ReturnType<typeof importRoboticsWorkspace>
  | null = null;

function importRoboticsWorkspace() {
  return import('./RoboticsWorkspace');
}

function loadRoboticsWorkspace() {
  roboticsWorkspacePromise ??= importRoboticsWorkspace();
  return roboticsWorkspacePromise;
}

/**
 * Preload only after explicit user intent (hover/focus). The default CAD shell
 * does not import MuJoCo, robotics rendering, or embodied-reasoning code.
 */
export function preloadRoboticsWorkspace() {
  return loadRoboticsWorkspace().then(() => undefined);
}

export const LazyRoboticsWorkspace = React.lazy(async () => {
  const module = await loadRoboticsWorkspace();
  return { default: module.RoboticsWorkspace };
});
