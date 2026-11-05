import { useState } from 'react';
import { useActiveCompanion } from './CompanionContext';
import { companionStateAsset } from './companions';

export type AgentSamPetState = 'idle' | 'working';

const FALLBACK_IMAGES: Record<AgentSamPetState, string> = {
  idle: '/brand/agentsam-gorilla/v1/pet/animated/head-idle.gif',
  working: '/brand/agentsam-gorilla/v1/pet/animated/ledge-working.gif',
};

/** Shared shell affordance follows the account-selected InnerAnimal companion. */
export function AgentSamPetTrigger({ state, onActivate }: {
  state: AgentSamPetState;
  onActivate: () => void;
}) {
  const companion = useActiveCompanion();
  const [fallback, setFallback] = useState(false);
  const animated = companionStateAsset(companion, state);
  const still = companion.avatarUrl || (companion.builtIn ? FALLBACK_IMAGES.idle : null);
  const image = fallback ? still : animated || still;
  return <button
    type="button"
    className="as-nav-button agentsam-pet-trigger"
    data-agent-state={state}
    data-agent-entry="shared"
    data-companion-id={companion.id}
    title={`${companion.name} · ${state === 'working' ? 'working with AgentSam' : 'ready to work'}`}
    aria-label={`${companion.name}, ${state === 'working' ? 'working' : 'ready'}. Open AgentSam assistant.`}
    onClick={onActivate}
  >
    {image ? <picture>
      <source media="(prefers-reduced-motion: reduce)" srcSet={still || image} />
      <img src={image} alt="" draggable={false} onError={() => setFallback(true)} />
    </picture> : <span className="agentsam-pet-initial" aria-hidden="true">{companion.name.slice(0, 1).toUpperCase()}</span>}
    <span className="agentsam-pet-status" aria-hidden="true" />
  </button>;
}
