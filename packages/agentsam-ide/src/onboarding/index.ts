/**
 * First-login AgentSam setup — one prompt at a time (never a wall of text).
 */

export type OnboardingStepId =
  | 'welcome'
  | 'confirm_account'
  | 'choose_workspace'
  | 'install_agentsamd'
  | 'health_check'
  | 'language_packs'
  | 'connect_github_optional'
  | 'ready';

export type OnboardingStep = {
  id: OnboardingStepId;
  prompt: string;
  /** Expected user action hint shown after the prompt. */
  expect: string;
  optional?: boolean;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    prompt: 'Welcome to AgentSam Local Studio. Press Enter to set up your machine (one step at a time).',
    expect: 'Enter',
  },
  {
    id: 'confirm_account',
    prompt: 'Confirm you are signed in with AgentSam (IAM_CLIENT_ID=iam_agentsam_sdk_web). Type yes to continue.',
    expect: 'yes',
  },
  {
    id: 'choose_workspace',
    prompt: 'Choose a workspace folder (default ~/AgentSam). Paste a path or press Enter for the default.',
    expect: 'path or Enter',
  },
  {
    id: 'install_agentsamd',
    prompt: 'Install the local runtime? Run: agentsam runtime install --yes  — then type done.',
    expect: 'done',
  },
  {
    id: 'health_check',
    prompt: 'Checking agentsamd health on 127.0.0.1:18765… Type retry if it failed, or ok when healthy.',
    expect: 'ok | retry',
  },
  {
    id: 'language_packs',
    prompt: 'CORE languages (TS/JS/JSON/HTML/CSS) are ready. Install Go, Rust, or Python packs now? (skip / go / rust / python)',
    expect: 'skip | go | rust | python',
    optional: true,
  },
  {
    id: 'connect_github_optional',
    prompt: 'Connect GitHub for repository automation? (separate from Sign in). Type skip or connect.',
    expect: 'skip | connect',
    optional: true,
  },
  {
    id: 'ready',
    prompt: 'You are ready. Try ls, open a file in Files, or type help. Setup complete.',
    expect: 'Enter',
  },
];

export type OnboardingState = {
  schema: 'agentsam.onboarding.v1';
  stepIndex: number;
  completedAt: string | null;
  workspacePath: string | null;
  stepsCompleted: OnboardingStepId[];
};

export function createOnboardingState(): OnboardingState {
  return {
    schema: 'agentsam.onboarding.v1',
    stepIndex: 0,
    completedAt: null,
    workspacePath: null,
    stepsCompleted: [],
  };
}

export function currentStep(state: OnboardingState): OnboardingStep | null {
  if (state.completedAt) return null;
  return ONBOARDING_STEPS[state.stepIndex] ?? null;
}

export function advanceOnboarding(
  state: OnboardingState,
  reply: string,
  opts: { workspaceDefault?: string; healthOk?: boolean } = {},
): { state: OnboardingState; message: string } {
  const step = currentStep(state);
  if (!step) {
    return { state, message: 'Setup already complete. Type agentsam setup to run again.' };
  }

  const raw = String(reply || '').trim().toLowerCase();
  const next = { ...state, stepsCompleted: [...state.stepsCompleted] };

  switch (step.id) {
    case 'welcome':
      next.stepIndex += 1;
      next.stepsCompleted.push(step.id);
      break;
    case 'confirm_account':
      if (raw !== 'yes' && raw !== 'y') {
        return { state, message: 'Type yes when you are signed in with AgentSam.' };
      }
      next.stepIndex += 1;
      next.stepsCompleted.push(step.id);
      break;
    case 'choose_workspace': {
      const path = raw || opts.workspaceDefault || '~/AgentSam';
      next.workspacePath = path;
      next.stepIndex += 1;
      next.stepsCompleted.push(step.id);
      break;
    }
    case 'install_agentsamd':
      if (raw !== 'done') {
        return { state, message: 'After agentsam runtime install --yes, type done.' };
      }
      next.stepIndex += 1;
      next.stepsCompleted.push(step.id);
      break;
    case 'health_check':
      if (raw === 'retry') {
        return { state, message: step.prompt };
      }
      if (raw !== 'ok' && opts.healthOk !== true) {
        return { state, message: 'Health not confirmed. Fix agentsamd, then type ok (or retry).' };
      }
      next.stepIndex += 1;
      next.stepsCompleted.push(step.id);
      break;
    case 'language_packs':
      next.stepIndex += 1;
      next.stepsCompleted.push(step.id);
      break;
    case 'connect_github_optional':
      next.stepIndex += 1;
      next.stepsCompleted.push(step.id);
      break;
    case 'ready':
      next.completedAt = new Date().toISOString();
      next.stepsCompleted.push(step.id);
      break;
    default:
      break;
  }

  const following = currentStep(next);
  return {
    state: next,
    message: following ? following.prompt : 'Setup complete.',
  };
}

export function resetOnboarding(): OnboardingState {
  return createOnboardingState();
}
