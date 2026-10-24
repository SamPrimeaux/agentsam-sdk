import { useState } from 'react';

export type AgentSamPetState = 'idle' | 'working';

const PET_IMAGES: Record<AgentSamPetState, string> = {
  idle: '/brand/agentsam-gorilla/v1/pet/animated/head-idle.gif',
  working: '/brand/agentsam-gorilla/v1/pet/animated/ledge-working.gif',
};
const PET_STILL: Record<AgentSamPetState, string> = {
  idle: '/brand/agentsam-gorilla/v1/pet/ledge/ledge-idle.svg',
  working: '/brand/agentsam-gorilla/v1/pet/ledge/ledge-working.svg',
};

/** One reusable PET affordance in the shared shell: activate the current agent,
 * never create a second chat instance or redirect away from the active document. */
export function AgentSamPetTrigger({ state, onActivate, avatarUrl }: { state: AgentSamPetState; onActivate: () => void; avatarUrl?: string | null }) {
  const [fallback, setFallback] = useState(false);
  return <button
    type="button"
    className="as-nav-button agentsam-pet-trigger"
    data-agent-state={state}
    data-agent-entry="shared"
    title={state === 'working' ? 'AgentSam is working · Open assistant' : 'Ask AgentSam'}
    aria-label={state === 'working' ? 'AgentSam is working. Open assistant.' : 'Open AgentSam assistant'}
    onClick={onActivate}
  >
    <picture>
      <source media="(prefers-reduced-motion: reduce)" srcSet={PET_STILL[state]} />
      <img src={fallback ? PET_STILL[state] : (avatarUrl || PET_IMAGES[state])} alt="" draggable={false}
        onError={() => setFallback(true)} />
    </picture>
    <span className="agentsam-pet-status" aria-hidden="true" />
    <span className="agentsam-pet-helper" aria-hidden="true">Ask AgentSam</span>
  </button>;
}
