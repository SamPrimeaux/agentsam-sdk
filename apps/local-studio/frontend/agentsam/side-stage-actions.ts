/**
 * SideStage owns these actionable tabs. The + menu and composer @ project
 * these same records, rather than maintaining separate widget lists.
 */
export const SIDE_STAGE_ACTIONS = [
  { id: 'goal', tab: 'goal', label: 'Edit goal', icon: 'target', description: 'Edit this work goal' },
  { id: 'coworker', tab: 'chat', label: 'Co-worker', icon: 'users', description: 'Open a co-worker conversation' },
  { id: 'browser', tab: 'browser', label: 'Browser', icon: 'globe', description: 'Focus the browser' },
  { id: 'files', tab: 'files', label: 'Files', icon: 'file-code', description: 'Open files' },
  { id: 'artifacts', tab: 'artifacts', label: 'Artifacts', icon: 'box', description: 'Open generated artifacts' },
  { id: 'ship', tab: 'deploy', label: 'Ship', icon: 'upload', description: 'Open deployment tools' },
  { id: 'cad', tab: 'app', label: 'CAD Creator', icon: 'layers', description: 'Open the CAD workspace' },
  { id: 'database', tab: 'database', label: 'Database', icon: 'database', description: 'Open the database editor' },
  { id: 'cli', tab: 'terminal', label: 'CLI', icon: 'square-terminal', description: 'Open the terminal' },
] as const;

export function sideStageComposerWidgets() {
  return SIDE_STAGE_ACTIONS.map(item => ({
    id: item.id,
    label: item.label,
    mention: '@' + item.id,
    description: item.description,
    icon: item.icon,
    ready: true,
    status: 'available',
    action: { type: 'open-side-stage' as const, tab: item.tab },
  }));
}
