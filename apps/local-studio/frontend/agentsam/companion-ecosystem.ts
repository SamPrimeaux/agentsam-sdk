export type CompanionHabitat = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  companionIds: string[];
  status: 'established' | 'expansion' | 'planned';
  accessMode: 'included' | 'collectible';
  collectionKey: string;
};

export const COMPANION_HABITATS: CompanionHabitat[] = [
  {
    id: 'founding-family', name: 'Founding Family', subtitle: 'The original InnerAnimal crew',
    description: 'The established companions that anchor the InnerAnimal identity and the first AgentSam experience.',
    companionIds: ['geaux', 'meaux', 'coder', 'architect', 'engineer', 'py', 'bella'], status: 'established', accessMode: 'included', collectionKey: 'inneranimal.habitat.founding-family',
  },
  {
    id: 'bayou-gulf', name: 'Bayou & Gulf', subtitle: 'Rooted in brand heritage',
    description: 'A Gulf Coast habitat for leadership, creative collaboration, data movement, debugging, security, and dependable execution.',
    companionIds: ['geaux', 'meaux', 'bella', 'pelican', 'crawfish', 'gator'], status: 'expansion', accessMode: 'collectible', collectionKey: 'inneranimal.habitat.bayou-gulf',
  },
  {
    id: 'deep-canopy', name: 'Deep Canopy', subtitle: 'Creative & strategy',
    description: 'A living creative department for visual systems, brand voice, storytelling, and rapid experimentation.',
    companionIds: ['chameleon', 'lyrebird', 'tree-frog'], status: 'planned', accessMode: 'collectible', collectionKey: 'inneranimal.habitat.deep-canopy',
  },
  {
    id: 'night-shift', name: 'Night Shift', subtitle: 'Automation & background jobs',
    description: 'The overnight crew for orchestration, network diagnostics, scheduled work, QA, and resilient operations.',
    companionIds: ['architect', 'bat', 'badger'], status: 'planned', accessMode: 'collectible', collectionKey: 'inneranimal.habitat.night-shift',
  },
  {
    id: 'field-operations', name: 'Field Operations', subtitle: 'Approved character expansion',
    description: 'The four approved field companions: navigation, durable building, precision diagnostics, and forward momentum.',
    companionIds: ['roux', 'bruneaux', 'nyra', 'toro'], status: 'expansion', accessMode: 'collectible', collectionKey: 'inneranimal.habitat.field-operations',
  },
];


export const COMPANION_COSTUME_PACKS = [
  {
    id: 'primetechpy', name: 'PrimeTechPy', companionId: 'py', version: '1.0.0',
    packType: 'add-on asset pack', assetStatus: 'reference-sheet-awaiting-ingest',
    description: 'A scientist and creative-tooling expansion for the existing Py identity: same Python companion, ten distinct uniforms and animation directions.',
    costumeDirections: [
      { id: 'lab-coat-idle', name: 'Lab Coat Idle', focus: 'Scientific exploration', visualEnhancement: 'White lab coat, amber safety goggles, compact flask holster, and a small IA patch.', signatureMotion: 'A calm breath, a quick instrument check, and a confident look up.', states: ['idle', 'breathe', 'look', 'blink'] },
      { id: 'data-diver', name: 'Data Diver', focus: 'Data inspection and analysis', visualEnhancement: 'Teal data visor, compact air tank, and floating chart-bubble details.', signatureMotion: 'Dives into a data stream and surfaces with a useful insight.', states: ['idle', 'scan', 'dive', 'pop'] },
      { id: 'code-swimmer', name: 'Code Swimmer', focus: 'Writing and refactoring code', visualEnhancement: 'Developer headphones, a dark field laptop, and flowing syntax ribbons.', signatureMotion: 'Swims through a current of code, edits a line, and ships the fix.', states: ['type', 'think', 'code', 'ship'] },
      { id: 'circuit-scout', name: 'Circuit Scout', focus: 'Tracing systems and connections', visualEnhancement: 'Compact scanner backpack, headlamp, and a glowing microchip badge.', signatureMotion: 'Sweeps a circuit path and lights up the next connection.', states: ['scout', 'scan', 'alert', 'look'] },
      { id: 'debug-detective', name: 'Debug Detective', focus: 'Reproducing and resolving defects', visualEnhancement: 'Small detective cap, magnifier, and a compact clue notebook.', signatureMotion: 'Finds a clue, magnifies the defect, and marks the resolution.', states: ['search', 'inspect', 'clue', 'resolve'] },
      { id: 'research-presenter', name: 'Research Presenter', focus: 'Explaining and presenting findings', visualEnhancement: 'Portable presentation board, stacked research books, and a pointer.', signatureMotion: 'Presents a chart and highlights the finding that matters.', states: ['present', 'explain', 'discuss', 'highlight'] },
      { id: 'sketch-coder', name: 'Sketch Coder', focus: 'Wireframes and creative prototypes', visualEnhancement: 'Knit cap, stylus, sketch tablet, and a small blueprint notebook.', signatureMotion: 'Sketches a quick line that transforms into a working prototype.', states: ['sketch', 'draw', 'proto', 'code'] },
      { id: 'success-spark', name: 'Success Spark', focus: 'Celebrating completed work', visualEnhancement: 'Bright lime spark details, a check badge, and a celebratory accessory.', signatureMotion: 'A bright sparkle burst, a happy nod, and a compact victory pose.', states: ['success', 'celebrate', 'complete', 'cheer'] },
      { id: 'thoughtful-coil', name: 'Thoughtful Coil', focus: 'Planning and reflective work', visualEnhancement: 'Soft field scarf, pocket notebook, and a subtle thought marker.', signatureMotion: 'A gentle coil, a deliberate pause, then a small resolved nod.', states: ['think', 'pause', 'focus', 'reflect'] },
      { id: 'ocean-of-syntax', name: 'Ocean of Syntax', focus: 'Immersive code and syntax flow', visualEnhancement: 'Deep-blue syntax current, luminous code fragments, and a flowing circular wave.', signatureMotion: 'Glides through an ocean of syntax and brings a clean pattern to the surface.', states: ['flow', 'syntax', 'loop', 'create'] },
    ],
  },
] as const;

export const COMPANION_DUO_DYNAMICS = [
  {
    id: 'geaux-bella-handoff',
    fromId: 'geaux',
    toId: 'bella',
    title: 'Vision to execution',
    description: 'Geaux frames the direction, gives a calm nod, and Bella bounds forward to retrieve the next practical step.',
    trigger: 'strategy-to-execution',
    sequence: ['geaux-thinking', 'geaux-success', 'bella-working', 'bella-tail-wag'],
  },
] as const;

export type CompanionQuizOption = { id: string; label: string; description: string; companionId: string };
export type CompanionQuizQuestion = { id: string; title: string; prompt: string; options: CompanionQuizOption[] };

export const COMPANION_QUIZ_QUESTIONS: CompanionQuizQuestion[] = [
  {
    id: 'work-style', title: 'What kind of work gives you energy?', prompt: 'Choose the kind of work you naturally gravitate toward.',
    options: [
      { id: 'vision', label: 'Big-picture building', description: 'Set direction, see the whole system, and make the hard calls.', companionId: 'geaux' },
      { id: 'architecture', label: 'Systems architecture', description: 'Design the structure, dependencies, and long-term shape of a system.', companionId: 'architect' },
      { id: 'creative', label: 'Creative exploration', description: 'Connect ideas, find references, and shape something new.', companionId: 'meaux' },
      { id: 'debug', label: 'Solving tricky problems', description: 'Investigate details and make complicated things work.', companionId: 'coder' },
      { id: 'build', label: 'Building and implementing', description: 'Prototype, connect tools, and turn plans into working systems.', companionId: 'engineer' },
      { id: 'automate', label: 'Automation and data', description: 'Find patterns, reduce repetitive work, and make systems flow.', companionId: 'py' },
      { id: 'steady', label: 'Steady progress with a partner', description: 'Keep momentum, celebrate progress, and make the work feel lighter.', companionId: 'bella' },
    ],
  },
  {
    id: 'problem-style', title: 'When a problem gets complicated, what do you do first?', prompt: 'There is no wrong answer; this just helps find your working style.',
    options: [
      { id: 'map', label: 'Map the bigger picture', description: 'Clarify the goal, dependencies, and the best route forward.', companionId: 'geaux' },
      { id: 'structure', label: 'Design the system first', description: 'Lay out the architecture and relationships before building.', companionId: 'architect' },
      { id: 'explore', label: 'Explore a few possibilities', description: 'Gather inspiration and test different directions.', companionId: 'meaux' },
      { id: 'isolate', label: 'Isolate the issue', description: 'Reproduce it, inspect the evidence, and narrow the cause.', companionId: 'coder' },
      { id: 'prototype', label: 'Build a quick proof', description: 'Make a small version and learn by trying it.', companionId: 'engineer' },
      { id: 'automate-first', label: 'Look for a repeatable pattern', description: 'Automate the steps and make the process reliable.', companionId: 'py' },
      { id: 'persist', label: 'Take it one step at a time', description: 'Stay present, steady, and encouraging until it is done.', companionId: 'bella' },
    ],
  },
  {
    id: 'notice', title: 'What would you most like a companion to notice?', prompt: 'Think about the signals you would want surfaced without asking.',
    options: [
      { id: 'milestones', label: 'Direction and milestones', description: 'When the work is aligned and meaningful progress is happening.', companionId: 'geaux' },
      { id: 'dependencies', label: 'Dependencies and structure', description: 'Where the architecture is fragile or a system needs a clearer shape.', companionId: 'architect' },
      { id: 'ideas', label: 'Fresh ideas and opportunities', description: 'Useful references, creative connections, and new angles.', companionId: 'meaux' },
      { id: 'bugs', label: 'Errors and edge cases', description: 'Subtle defects, regressions, and unexpected behavior.', companionId: 'coder' },
      { id: 'systems', label: 'Gaps in the build', description: 'Missing connections, weak handoffs, or unfinished implementation.', companionId: 'engineer' },
      { id: 'repetition', label: 'Repeated tasks and patterns', description: 'Work that can be streamlined, scheduled, or automated.', companionId: 'py' },
      { id: 'wellbeing', label: 'Progress and moments to pause', description: 'When it is time to celebrate, reset, or keep going gently.', companionId: 'bella' },
    ],
  },
  {
    id: 'presence', title: 'What kind of presence feels right?', prompt: 'Choose the personality you would enjoy seeing around your workspace.',
    options: [
      { id: 'grounded', label: 'Grounded leadership', description: 'Calm, deliberate, resilient, and quietly confident.', companionId: 'geaux' },
      { id: 'strategic', label: 'Quiet strategic observer', description: 'Observant, thoughtful, and always looking at the whole system.', companionId: 'architect' },
      { id: 'curious', label: 'Curious collaboration', description: 'Inventive, expressive, and full of thoughtful questions.', companionId: 'meaux' },
      { id: 'focused', label: 'Focused problem solving', description: 'Alert, precise, and pleased when the pieces click.', companionId: 'coder' },
      { id: 'practical', label: 'Practical builder energy', description: 'Resourceful, hands-on, and persistent.', companionId: 'engineer' },
      { id: 'quiet', label: 'Quiet automation partner', description: 'Observant, fluid, and consistent in the background.', companionId: 'py' },
      { id: 'warm', label: 'Warm everyday companionship', description: 'Loyal, encouraging, playful, and reassuring.', companionId: 'bella' },
    ],
  },
];

export type CompanionQuizAnswers = Record<string, string>;

export function recommendCompanionFromQuiz(answers: CompanionQuizAnswers): string {
  const scores = new Map<string, number>();
  for (const question of COMPANION_QUIZ_QUESTIONS) {
    const option = question.options.find((item) => item.id === answers[question.id]);
    if (option) scores.set(option.companionId, (scores.get(option.companionId) || 0) + 1);
  }
  const priority = ['geaux', 'architect', 'meaux', 'coder', 'engineer', 'py', 'bella'];
  return [...priority].sort((a, b) => (scores.get(b) || 0) - (scores.get(a) || 0) || priority.indexOf(a) - priority.indexOf(b))[0] || 'geaux';
}

export const COMPANION_MILESTONE_UNLOCKS = [
  {
    id: 'coder-pr-50-celebration', companionId: 'coder', title: 'Milestone celebration',
    milestone: '50 merged pull requests', metric: 'github.pull_request.merged', threshold: 50,
    animationId: 'celebration-backflip', status: 'artwork-queued',
  },
  {
    id: 'py-night-shift-coffee', companionId: 'py', title: 'Night-shift coffee break',
    milestone: '25 successful overnight runs', metric: 'automation.overnight_run.success', threshold: 25,
    animationId: 'coffee-mug-idle', status: 'artwork-queued',
  },
] as const;

export const COMPANION_COMMISSIONING = {
  id: 'agency-brand-mascot', name: 'Custom brand companions', tier: 'Agency / B2B',
  description: 'A commissioned mascot identity built on the InnerAnimal companion rig and delivered as reusable platform assets.',
  deliverables: ['Brand-aligned character profile', 'Icon, avatar and portrait exports', '10 runtime states', 'Frame atlases and transparent animation frames', 'APNG runtime package and manifest', 'Usage and licensing notes'],
} as const;
