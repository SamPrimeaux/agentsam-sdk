import type { AgentArtifact } from '@inneranimalmedia/agentsam-contracts';

export function ArtifactCard({ artifact, className, onOpen }: { artifact: AgentArtifact; className?: string; onOpen?: (artifact: AgentArtifact) => void }) {
  return (
    <button type="button" className={className} data-artifact-kind={artifact.kind} onClick={() => onOpen?.(artifact)}>
      <span>{artifact.title ?? artifact.kind}</span>
    </button>
  );
}
