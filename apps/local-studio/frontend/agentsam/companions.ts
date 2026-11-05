export const COMPANION_STATE_IDS = [
  'idle', 'working', 'thinking', 'attention', 'success', 'signature', 'waiting', 'error', 'resting', 'blinking',
] as const;

export type CompanionState = typeof COMPANION_STATE_IDS[number];

export const COMPANION_STATE_LABELS: Array<{ id: CompanionState; label: string; description: string }> = [
  { id: 'idle', label: 'Idle', description: 'At rest and ready for the next task.' },
  { id: 'working', label: 'Working', description: 'Focused while AgentSam is running.' },
  { id: 'thinking', label: 'Thinking', description: 'Considering the next move.' },
  { id: 'attention', label: 'Attention', description: 'Looking for your direction.' },
  { id: 'success', label: 'Success', description: 'A completed task or milestone.' },
  { id: 'signature', label: 'Signature', description: 'The character’s distinctive gesture.' },
  { id: 'waiting', label: 'Waiting', description: 'Holding while a tool or process responds.' },
  { id: 'error', label: 'Error', description: 'A problem needs review.' },
  { id: 'resting', label: 'Resting', description: 'Taking a quiet pause.' },
  { id: 'blinking', label: 'Blinking', description: 'A small idle expression.' },
];

export type CustomCompanion = {
  id: string;
  name: string;
  animal: string;
  role: string;
  description: string;
  personality: string;
  visualNotes: string;
  signatureAction: string;
  imageUrl: string | null;
  stateAssets: Partial<Record<CompanionState, string>>;
};

export type CompanionSettings = {
  activeId: string;
  customCompanions: CustomCompanion[];
};

export type CompanionProfile = {
  id: string;
  name: string;
  animal: string;
  role: string;
  description: string;
  builtIn: boolean;
  status: 'production-review-candidate' | 'custom';
  avatarUrl: string | null;
  portraitUrl: string | null;
  states: Partial<Record<CompanionState, string>>;
  sourcePackage?: string;
  visualApproval?: 'pending' | 'approved';
  custom?: CustomCompanion;
};

export const DEFAULT_COMPANION_SETTINGS: CompanionSettings = {
  activeId: 'geaux',
  customCompanions: [],
};

const runtimeBase = '/brand/inneranimal-companions/v1';

function builtIn(
  id: string,
  name: string,
  animal: string,
  role: string,
  description: string,
  sourcePackage: string,
): CompanionProfile {
  const base = `${runtimeBase}/${id}`;
  const states = Object.fromEntries(COMPANION_STATE_IDS.map((state) => [
    state,
    `${base}/animations/${id}-${state}.png`,
  ])) as Record<CompanionState, string>;
  return {
    id, name, animal, role, description, builtIn: true,
    status: 'production-review-candidate',
    avatarUrl: `${base}/avatars/${id}-avatar-128.png`,
    portraitUrl: `${base}/avatars/${id}-portrait-256.png`,
    states,
    sourcePackage,
    visualApproval: 'pending',
  };
}

/** Runtime projections of the original six InnerAnimal v0.1.0 packages. */
export const INNERANIMAL_COMPANIONS: CompanionProfile[] = [
  builtIn('geaux', 'Geaux', 'Silverback gorilla', 'Founder · leadership & resilience',
    'The Original. Founder, leadership and resilience; grounded strength, deliberate review and the drive to keep going.', 'InnerAnimal-Geaux-v0.1.0.zip'),
  builtIn('meaux', 'Meaux', 'Raccoon', 'Creative collaborator · ideas & storytelling',
    'The creative coworker. Curious, inventive and generous with ideas; turns possibilities into something you can hold.', 'InnerAnimal-Meaux-v0.1.0.zip'),
  builtIn('coder', 'Coder', 'Fox', 'Software engineering · debugging & problem solving',
    'A focused problem solver. Quick to notice a detail, patient with a difficult bug, delighted when the pieces click.', 'InnerAnimal-Coder-v0.1.0.zip'),
  builtIn('architect', 'Architect', 'Great horned owl', 'Systems thinking · structure & composition',
    'The spatial thinker. Observant and deliberate; studies proportion, tests the composition and sees the whole.', 'InnerAnimal-Architect-v0.1.0.zip'),
  builtIn('engineer', 'Engineer', 'Beaver', 'Practical building · tools & implementation',
    'The practical inventor. Measures carefully, tests the connection and keeps adjusting until the idea works.', 'InnerAnimal-Engineer-v0.1.0.zip'),
  builtIn('py', 'Py', 'Python snake', 'Automation · scripting & data',
    'The automation companion. Fluid, attentive and quietly persistent; follows a pattern and uncoils the next possibility.', 'InnerAnimal-Py-v0.1.0.zip'),
];

export function resolveCompanion(id: string | undefined, customCompanions: CustomCompanion[] = []): CompanionProfile {
  const builtInProfile = INNERANIMAL_COMPANIONS.find((item) => item.id === id);
  if (builtInProfile) return builtInProfile;
  const custom = customCompanions.find((item) => item.id === id);
  if (custom) {
    const image = custom.imageUrl || null;
    return {
      id: custom.id,
      name: custom.name,
      animal: custom.animal,
      role: custom.role,
      description: custom.description,
      builtIn: false,
      status: 'custom',
      avatarUrl: image,
      portraitUrl: image,
      states: custom.stateAssets || {},
      custom,
    };
  }
  return INNERANIMAL_COMPANIONS[0];
}

export function companionStateAsset(companion: CompanionProfile, state: CompanionState): string | null {
  if (companion.builtIn) return companion.states[state] || companion.states.idle || companion.avatarUrl;
  return companion.states[state] || companion.states.idle || companion.custom?.imageUrl || companion.avatarUrl;
}
