export const COMPANION_STATE_IDS = [
  'idle', 'working', 'thinking', 'attention', 'success', 'signature', 'waiting', 'error', 'resting', 'blinking',
] as const;

/** Core states remain suggested defaults, while character-specific states are open slugs. */
export type CompanionState = string;

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

export type CompanionAnimation = {
  id: string;
  label: string;
  description: string;
  src: string | null;
  fps: number;
  frames: number;
  loop: boolean;
  kind: 'apng' | 'gif' | 'spritesheet' | 'frames' | 'static';
};

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
  stateAssets: Record<CompanionState, string>;
  animations?: CompanionAnimation[];
  brandName?: string;
  commissioningMode?: 'personal' | 'agency';
};

export type CompanionOnboardingResult = {
  version: '1';
  completedAt: string;
  recommendedId: string;
  answers: Record<string, string>;
};

export type CompanionSettings = {
  activeId: string;
  secondaryId: string | null;
  desktopBuddyEnabled: boolean;
  onboarding: CompanionOnboardingResult | null;
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

export type CompanionArtworkStatus = 'runtime-ready' | 'generated-awaiting-ingest' | 'brief-only' | 'custom';

export type CompanionProfile = {
  id: string;
  name: string;
  animal: string;
  role: string;
  description: string;
  builtIn: boolean;
  status: 'production-review-candidate' | 'planned' | 'custom';
  selectable: boolean;
  artworkStatus: CompanionArtworkStatus;
  habitatIds: string[];
  capabilities: string[];
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
  visualNotes?: string;
  sourceArtwork?: string[];
  galleryStates?: CompanionGalleryState[];
  custom?: CustomCompanion;
};

export const DEFAULT_COMPANION_SETTINGS: CompanionSettings = {
  activeId: 'geaux',
  secondaryId: null,
  desktopBuddyEnabled: false,
  onboarding: null,
  customCompanions: [],
};

const runtimeBase = '/brand/inneranimal-companions/v1';

type BuiltInCompanionOptions = {
  version?: string;
  releasePackage?: string;
  visualApproval?: 'pending' | 'approved';
  stateFiles?: Partial<Record<CompanionState, string>>;
  personality?: string[];
  signatureAction?: string;
  visualIdentity?: CompanionVisualIdentity;
  visualNotes?: string;
  habitatIds?: string[];
  capabilities?: string[];
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
    status: 'production-review-candidate', selectable: true, artworkStatus: 'runtime-ready',
    habitatIds: options.habitatIds || ['founding-family'], capabilities: options.capabilities || [],
    avatarUrl: `${base}/avatars/${id}-avatar-128.png`,
    portraitUrl: `${base}/avatars/${id}-portrait-256.png`,
    states,
    sourcePackage,
    ...(options.version ? { version: options.version } : {}),
    ...(options.releasePackage ? { releasePackage: options.releasePackage } : {}),
    visualApproval: options.visualApproval || 'pending',
    ...(options.personality ? { personality: options.personality } : {}),
    ...(options.signatureAction ? { signatureAction: options.signatureAction } : {}),
    ...(options.visualIdentity ? { visualIdentity: options.visualIdentity } : {}),
    ...(options.visualNotes ? { visualNotes: options.visualNotes } : {}),
    ...(options.galleryStates ? { galleryStates: options.galleryStates.map(({ asset, ...state }) => ({ ...state, src: `${base}/animations/${asset}.png` })) } : {}),
  };
}

function planned(
  id: string,
  name: string,
  animal: string,
  role: string,
  description: string,
  habitatIds: string[],
  capabilities: string[],
  visualNotes: string,
  signatureAction: string,
  artworkStatus: Extract<CompanionArtworkStatus, 'brief-only' | 'generated-awaiting-ingest'> = 'brief-only',
  sourceArtwork?: string[],
  personality: string[] = ['curious', 'capable', 'approachable'],
  visualApproval: 'pending' | 'approved' = 'pending',
): CompanionProfile {
  return {
    id, name, animal, role, description, builtIn: true, status: 'planned', selectable: false,
    artworkStatus, habitatIds, capabilities, avatarUrl: null, portraitUrl: null, states: {},
    version: '0.1.0', visualApproval, personality, visualNotes, signatureAction,
    ...(sourceArtwork ? { sourceArtwork } : {}),
  };
}

/** Runtime projections of the eleven runtime characters plus the planned habitat expansion. */
export const INNERANIMAL_COMPANIONS: CompanionProfile[] = [
  builtIn('geaux', 'Geaux', 'Silverback gorilla', 'Founder · leadership & resilience',
    'The Original. Founder, leadership and resilience; grounded strength, deliberate review and the drive to keep going.', 'InnerAnimal-Geaux-v0.1.0.zip', {
      habitatIds: ['founding-family', 'bayou-gulf'], capabilities: ['leadership', 'strategy', 'resilience', 'review'],
    }),
  builtIn('meaux', 'Meaux', 'Raccoon', 'Creative collaborator · ideas & storytelling',
    'The creative coworker. Curious, inventive and generous with ideas; turns possibilities into something you can hold.', 'InnerAnimal-Meaux-v0.1.0.zip', {
      habitatIds: ['founding-family', 'bayou-gulf'], capabilities: ['ideation', 'creative-research', 'storytelling', 'prototyping'],
    }),
  builtIn('coder', 'Coder', 'Fox', 'Software engineering · debugging & problem solving',
    'A focused problem solver. Quick to notice a detail, patient with a difficult bug, delighted when the pieces click.', 'InnerAnimal-Coder-v0.1.0.zip', {
      habitatIds: ['founding-family'], capabilities: ['coding', 'debugging', 'refactoring', 'code-review'],
    }),
  builtIn('architect', 'Architect', 'Great horned owl', 'Systems thinking · structure & composition',
    'The spatial thinker. Observant and deliberate; studies proportion, tests the composition and sees the whole.', 'InnerAnimal-Architect-v0.1.0.zip', {
      habitatIds: ['founding-family', 'night-shift'], capabilities: ['architecture', 'systems-design', 'planning', 'orchestration'],
    }),
  builtIn('engineer', 'Engineer', 'Beaver', 'Practical building · tools & implementation',
    'The practical inventor. Measures carefully, tests the connection and keeps adjusting until the idea works.', 'InnerAnimal-Engineer-v0.1.0.zip', {
      habitatIds: ['founding-family'], capabilities: ['implementation', 'prototyping', 'integration', 'construction'],
    }),
  builtIn('py', 'Py', 'Python snake', 'Automation · scripting & data',
    'The automation companion. Fluid, attentive and quietly persistent; follows a pattern and uncoils the next possibility.', 'InnerAnimal-Py-v0.1.0.zip', {
      habitatIds: ['founding-family'], capabilities: ['python', 'automation', 'machine-learning', 'data-tooling'],
    }),
  builtIn('bella', 'Bella', 'Chocolate Labrador Retriever', 'Everyday companion · encouragement & presence',
    'A gentle, steady companion with a warm presence. Bella brings curiosity, encouragement, and a little joy to the moments in between.',
    'InnerAnimal-Bella-v1.0.0.zip', {
      version: '1.1.0', releasePackage: 'InnerAnimal-Bella-v1.1.0.zip', habitatIds: ['founding-family', 'bayou-gulf'],
      stateFiles: {
        idle: 'idle', working: 'working', thinking: 'thinking', attention: 'attentive', success: 'success',
        signature: 'tail-wag', waiting: 'waiting', error: 'alert-error', resting: 'resting', blinking: 'blink',
      },
      personality: ['gentle', 'loyal', 'curious', 'patient', 'playful', 'comforting'],
      capabilities: ['encouragement', 'voice-presence', 'status-companion', 'handoff-support'],
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
  planned('pelican', 'Pelican', 'Brown pelican', 'Data transport · pipelines & storage',
    'The payload carrier. Moves large datasets and media safely through pipelines, keeping transfers visible and organized.',
    ['bayou-gulf'], ['data-pipelines', 'payload-routing', 'storage', 'media-transfer'],
    'A Gulf Coast brown pelican with a clean field-utility harness and a reinforced data pouch; friendly, capable, and unmistakably coastal.',
    'A pouch-load swoop that gathers a payload and delivers it to the right destination.'),
  planned('crawfish', 'Crawfish', 'Louisiana crawfish', 'Debugging · bug triage & repair',
    'The bug catcher. Finds small defects, isolates the cause, and pinches troublesome bugs out of the codebase.',
    ['bayou-gulf'], ['debugging', 'issue-triage', 'repair', 'regression-hunting'],
    'A bright Louisiana crawfish with expressive claws, a compact utility belt, and a small inspection lens; playful but precise.',
    'A quick double-pinch that catches a bug and flicks it into a tiny evidence jar.'),
  planned('gator', 'Gator', 'American alligator', 'Security · perimeter monitoring & protection',
    'The quiet guardian. Watches access boundaries, notices unusual activity, and protects the workspace without creating noise.',
    ['bayou-gulf'], ['security', 'access-monitoring', 'threat-detection', 'policy-guardrails'],
    'A deep-olive alligator with a sturdy security vest, shield-shaped IA insignia, and warm amber eyes; reassuring rather than aggressive.',
    'A low, steady perimeter sweep followed by a calm protective tail curl.'),
  planned('chameleon', 'Chameleon', 'Veiled chameleon', 'Brand & design · adaptive visual systems',
    'The visual adapter. Explores palettes, theme tokens, CSS systems, and responsive design variations while keeping a brand coherent.',
    ['deep-canopy'], ['brand-design', 'color-systems', 'theme-tokens', 'css-adaptation'],
    'A friendly veiled chameleon with a subtle crest and a modular color-shifting pattern; polished, flat-clay accents with controlled gradients.',
    'A slow palette-shift from one coordinated brand color family to another.'),
  planned('lyrebird', 'Lyrebird', 'Superb lyrebird', 'Copywriting & voice · tone and narrative',
    'The voice specialist. Studies a brand’s language and produces consistent copy, narration, and voice direction across channels.',
    ['deep-canopy'], ['copywriting', 'brand-voice', 'narration', 'content-editing'],
    'An elegant lyrebird with a refined fan tail, small field notebook, and a few sound-wave motifs; editorial and expressive.',
    'A fan-tail flourish that shifts through a few distinct voice-note gestures.'),
  planned('tree-frog', 'Tree Frog', 'Green tree frog', 'Rapid prototyping · experiments & iteration',
    'The rapid prototyper. Leaps between ideas, builds quick proofs, and turns early concepts into something testable.',
    ['deep-canopy'], ['rapid-prototyping', 'experimentation', 'wireframing', 'iteration'],
    'A bright green tree frog with rounded, friendly proportions, a tiny sketch kit, and springy feet; playful and highly readable at small sizes.',
    'A compact leap from one idea marker to the next, landing on a working prototype.'),
  planned('bat', 'Bat', 'Free-tailed bat', 'Network diagnostics · sonar & connectivity',
    'The signal scout. Uses sonar-like sweeps to map routes, spot latency, and notice network interruptions during overnight operations.',
    ['night-shift'], ['network-diagnostics', 'latency-analysis', 'connectivity', 'route-mapping'],
    'A small free-tailed bat with a dark technical flight jacket, soft teal sonar accents, and a compact diagnostic headset; alert, not spooky.',
    'A pair of sonar pulses that map a route and resolve into a clean signal.'),
  planned('badger', 'Badger', 'American badger', 'QA & stress testing · relentless verification',
    'The relentless tester. Repeats checks, probes edge cases, and keeps pressure on a build until it is dependable.',
    ['night-shift'], ['quality-assurance', 'stress-testing', 'test-automation', 'regression-testing'],
    'A sturdy American badger with a practical testing vest, reinforced gloves, and a compact test rig; determined and dependable.',
    'A focused inspection loop that checks, stamps, and confirms a build.'),
  builtIn('roux', "Roux", "Wolf", "Field guidance · scouting & navigation",
    "The pathfinder. Reads the terrain, spots useful routes, and keeps complex work moving in the right direction.", 'InnerAnimal-Field-Operations-v1.0.0.zip', {
      version: '1.0.0', visualApproval: 'approved', habitatIds: ['field-operations'], capabilities: ["scouting", "navigation", "research", "coordination"], personality: ["loyal", "observant", "steady", "resourceful"], signatureAction: "A proud guidance howl framed by a soft green arc.", visualNotes: "Gray-and-cream wolf with amber eyes, brass goggles, olive IA field scarf, hiking harness, rolled bedroll, and compass medallion.",
    }),
  builtIn('bruneaux', "Bruneaux", "Bear", "Forge guardian · systems building & resilience",
    "The forge guardian. Carries the heavy work, builds durable systems, and stays steady when a project needs endurance.", 'InnerAnimal-Field-Operations-v1.0.0.zip', {
      version: '1.0.0', visualApproval: 'approved', habitatIds: ['field-operations'], capabilities: ["systems-building", "infrastructure", "resilience", "implementation"], personality: ["dependable", "patient", "strong", "protective"], signatureAction: "A warm forge-ring gesture that signals a durable build is ready.", visualNotes: "A powerful brown bear with brass goggles, olive IA scarf, heavy utility harness, lantern canister, and anvil-like shoulder emblem.",
    }),
  builtIn('nyra', "Nyra", "Panther", "Precision · stealth diagnostics & focus",
    "The precision scout. Moves quietly through complex systems, catches subtle anomalies, and keeps attention on the critical detail.", 'InnerAnimal-Field-Operations-v1.0.0.zip', {
      version: '1.0.0', visualApproval: 'approved', habitatIds: ['field-operations'], capabilities: ["precision", "diagnostics", "anomaly-detection", "focused-research"], personality: ["focused", "agile", "discerning", "calm"], signatureAction: "A shadow-leap with a clean green energy arc.", visualNotes: "Sleek black panther with luminous yellow-green eyes, bronze goggles, dark IA scarf, utility harness, and a compass medallion.",
    }),
  builtIn('toro', "Toro", "Bull", "Momentum · operations & execution",
    "The momentum keeper. Turns decisions into forward motion, carries operational load, and helps teams finish what they start.", 'InnerAnimal-Field-Operations-v1.0.0.zip', {
      version: '1.0.0', visualApproval: 'approved', habitatIds: ['field-operations'], capabilities: ["operations", "execution", "delivery", "momentum"], personality: ["determined", "reliable", "confident", "persistent"], signatureAction: "A grounded momentum surge that ends in a confident braced stance.", visualNotes: "Muscular brown bull with cream horns, brass goggles, olive IA scarf, heavy field backpack, and a strong chest medallion.",
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
      status: 'custom', selectable: true, artworkStatus: 'custom', habitatIds: [], capabilities: [],
      avatarUrl: image,
      portraitUrl: image,
      states: custom.stateAssets || {},
      custom,
    };
  }
  return INNERANIMAL_COMPANIONS[0];
}

export function companionStateAsset(companion: CompanionProfile, state: CompanionState): string | null {
  if (companion.builtIn) return companion.states[state] || companion.states.idle || companion.avatarUrl || null;
  return companion.states[state] || companion.states.idle || companion.custom?.imageUrl || companion.avatarUrl || null;
}
