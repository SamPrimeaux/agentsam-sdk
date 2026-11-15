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

export type CompanionGalleryState = {
  id: string;
  label: string;
  description: string;
  src: string;
  frames?: number;
  fps?: number;
  loop?: boolean;
};

export type CompanionVisualIdentity = {
  coat: string;
  eyes: string;
  markings: string;
  style: string;
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
  releasePackage?: string;
  version?: string;
  visualApproval?: 'pending' | 'approved';
  personality?: string[];
  signatureAction?: string;
  visualIdentity?: CompanionVisualIdentity;
  galleryStates?: CompanionGalleryState[];
  custom?: CustomCompanion;
};

export const DEFAULT_COMPANION_SETTINGS: CompanionSettings = {
  activeId: 'geaux',
  customCompanions: [],
};

const runtimeBase = '/brand/inneranimal-companions/v1';

type BuiltInCompanionOptions = {
  version?: string;
  releasePackage?: string;
  stateFiles?: Partial<Record<CompanionState, string>>;
  personality?: string[];
  signatureAction?: string;
  visualIdentity?: CompanionVisualIdentity;
  galleryStates?: Array<Omit<CompanionGalleryState, 'src'> & { asset: string; frames?: number; fps?: number; loop?: boolean }>;
};

function builtIn(
  id: string,
  name: string,
  animal: string,
  role: string,
  description: string,
  sourcePackage: string,
  options: BuiltInCompanionOptions = {},
): CompanionProfile {
  const base = `${runtimeBase}/${id}`;
  const states = Object.fromEntries(COMPANION_STATE_IDS.map((state) => [
    state,
    `${base}/animations/${id}-${options.stateFiles?.[state] || state}.png`,
  ])) as Record<CompanionState, string>;
  return {
    id, name, animal, role, description, builtIn: true,
    status: 'production-review-candidate',
    avatarUrl: `${base}/avatars/${id}-avatar-128.png`,
    portraitUrl: `${base}/avatars/${id}-portrait-256.png`,
    states,
    sourcePackage,
    ...(options.version ? { version: options.version } : {}),
    ...(options.releasePackage ? { releasePackage: options.releasePackage } : {}),
    visualApproval: 'pending',
    ...(options.personality ? { personality: options.personality } : {}),
    ...(options.signatureAction ? { signatureAction: options.signatureAction } : {}),
    ...(options.visualIdentity ? { visualIdentity: options.visualIdentity } : {}),
    ...(options.galleryStates ? { galleryStates: options.galleryStates.map(({ asset, ...state }) => ({ ...state, src: `${base}/animations/${asset}.png` })) } : {}),
  };
}

/** Runtime projections of the six founding characters plus Bella. */
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
  builtIn('bella', 'Bella', 'Chocolate Labrador Retriever', 'Everyday companion · encouragement & presence',
    'A gentle, steady companion with a warm presence. Bella brings curiosity, encouragement, and a little joy to the moments in between.',
    'InnerAnimal-Bella-v1.0.0.zip', {
      version: '1.1.0',
      releasePackage: 'InnerAnimal-Bella-v1.1.0.zip',
      stateFiles: {
        idle: 'idle', working: 'working', thinking: 'thinking', attention: 'attentive', success: 'success',
        signature: 'tail-wag', waiting: 'waiting', error: 'alert-error', resting: 'resting', blinking: 'blink',
      },
      personality: ['gentle', 'loyal', 'curious', 'patient', 'playful', 'comforting'],
      signatureAction: 'A happy, unhurried tail wag.',
      visualIdentity: {
        coat: 'Rich chocolate brown', eyes: 'Warm amber',
        markings: 'Soft cream chest blaze and a lightly silvered muzzle',
        style: 'Warm, detailed, expressive 3D storybook realism',
      },
      galleryStates: [
        { id: 'idle', label: 'Idle', description: 'Default, calm presence', asset: 'bella-idle', frames: 8, fps: 6, loop: true },
        { id: 'attentive', label: 'Attentive', description: 'Focused and ready', asset: 'bella-attentive', frames: 8, fps: 6, loop: true },
        { id: 'blink', label: 'Blink', description: 'Natural, relaxed blink pose', asset: 'bella-blink', frames: 8, fps: 6, loop: true },
        { id: 'curious', label: 'Curious', description: 'Observant and interested', asset: 'bella-curious', frames: 8, fps: 6, loop: true },
        { id: 'head-tilt', label: 'Head Tilt', description: 'Wondering, intrigued', asset: 'bella-head-tilt', frames: 8, fps: 6, loop: true },
        { id: 'asking', label: 'Asking', description: 'Seeking input or guidance', asset: 'bella-asking', frames: 8, fps: 6, loop: true },
        { id: 'thinking', label: 'Thinking', description: 'Considering, problem solving', asset: 'bella-thinking', frames: 8, fps: 6, loop: true },
        { id: 'waiting', label: 'Waiting', description: 'Processing, in progress', asset: 'bella-waiting', frames: 8, fps: 6, loop: true },
        { id: 'voice-headset', label: 'Voice / Headset', description: 'Listening in voice chat', asset: 'bella-voice-headset', frames: 8, fps: 6, loop: true },
        { id: 'working', label: 'Working', description: 'Focused on a task', asset: 'bella-working', frames: 8, fps: 6, loop: true },
        { id: 'tail-wag', label: 'Tail Wag', description: 'Happy, engaged progress', asset: 'bella-tail-wag', frames: 8, fps: 6, loop: true },
        { id: 'success', label: 'Success', description: 'Task complete, happy', asset: 'bella-success', frames: 8, fps: 6, loop: false },
        { id: 'welcome', label: 'Welcome', description: 'Friendly greeting', asset: 'bella-welcome', frames: 8, fps: 6, loop: false },
        { id: 'alert-error', label: 'Alert / Error', description: 'Needs attention', asset: 'bella-alert-error', frames: 8, fps: 6, loop: true },
        { id: 'resting', label: 'Resting', description: 'Relaxed, taking a break', asset: 'bella-resting', frames: 8, fps: 6, loop: true },
        { id: 'sleeping', label: 'Sleeping', description: 'Deep rest, offline', asset: 'bella-sleeping', frames: 8, fps: 6, loop: true },
      ],
    }),
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
