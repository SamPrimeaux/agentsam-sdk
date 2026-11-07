import type { ReactNode } from 'react';

export type IDEFileSourceId = 'local' | 'github' | 'r2' | 'drive' | 'container' | 'docker';
export type IDEFileSource = {
  id: IDEFileSourceId;
  label: string;
  state: 'connected' | 'disconnected' | 'connecting' | 'sample';
  detail?: string;
};

const ICONS: Record<IDEFileSourceId, string> = {
  local: new URL('./icons/local.svg', import.meta.url).href,
  github: new URL('./icons/github.svg', import.meta.url).href,
  r2: new URL('./icons/r2.svg', import.meta.url).href,
  drive: new URL('./icons/googledrive.svg', import.meta.url).href,
  container: new URL('./icons/container.svg', import.meta.url).href,
  docker: new URL('./icons/docker.svg', import.meta.url).href,
};

export function WorkspaceSourceRail({sources, sourceId, onSelect, trailing}: {
  sources: IDEFileSource[];
  sourceId: IDEFileSourceId;
  onSelect?: (source: IDEFileSourceId) => void;
  trailing?: ReactNode;
}) {
  return <div className="asi-source-rail" aria-label="Workspace filesystem sources">
    {sources.map(source => <button key={source.id} type="button"
      title={source.label + ': ' + (source.detail || source.state)}
      aria-label={source.label + ' (' + source.state + ')'}
      aria-pressed={sourceId === source.id}
      data-source={source.id} data-state={source.state}
      onClick={() => onSelect?.(source.id)}>
      <img alt="" aria-hidden="true" src={ICONS[source.id]} />
    </button>)}
    {trailing}
  </div>;
}
