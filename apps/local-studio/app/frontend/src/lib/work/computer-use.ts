/**
 * Provider-agnostic computer-use + managed-environment contract.
 * Google Antigravity / Gemini computer_use is one adapter.
 * The Worker never hosts a model. Keys stay in vault / local secrets.
 */

export type ComputerSurface = "browser" | "mobile" | "desktop" | "sandbox";

export type ComputerProvider =
  | "google-antigravity"
  | "google-gemini-computer-use"
  | "openai-computer-use"
  | "anthropic-computer-use"
  | "local-playwright"
  | "agentsam-tunnel";

export type EnvSource =
  | { type: "repository"; source: string; target: string }
  | { type: "gcs"; source: string; target: string }
  | { type: "inline"; content: string; target: string };

export type EnvNetwork =
  | "disabled"
  | { allowlist: Array<{ domain: string; transform?: Record<string, string> }> };

export type ManagedEnvironmentRequest =
  | "remote"
  | string
  | {
      type: "remote";
      environment_id?: string;
      sources?: EnvSource[];
      network?: EnvNetwork;
    };

export type ComputerSession = {
  id: string;
  provider: ComputerProvider;
  surface: ComputerSurface;
  environmentId?: string;
  previousInteractionId?: string;
  status: "idle" | "provisioning" | "active" | "needs-confirm" | "offline" | "error";
  note?: string;
  createdAt: number;
};

export const COMPUTER_PROVIDERS: Array<{
  id: ComputerProvider;
  label: string;
  hint: string;
  defaultSurface: ComputerSurface;
}> = [
  {
    id: "google-antigravity",
    label: "Google Antigravity",
    hint: "Managed Linux sandbox · persist env_id",
    defaultSurface: "sandbox",
  },
  {
    id: "google-gemini-computer-use",
    label: "Gemini Computer Use",
    hint: "Browser / mobile / desktop screenshot loop",
    defaultSurface: "browser",
  },
  {
    id: "openai-computer-use",
    label: "OpenAI Computer Use",
    hint: "CUA loop · client executes actions",
    defaultSurface: "browser",
  },
  {
    id: "anthropic-computer-use",
    label: "Anthropic Computer Use",
    hint: "Claude computer tool · client executes",
    defaultSurface: "desktop",
  },
  {
    id: "local-playwright",
    label: "Local Playwright",
    hint: "This machine · Chromium via iMac tunnel",
    defaultSurface: "browser",
  },
  {
    id: "agentsam-tunnel",
    label: "AgentSam desk",
    hint: "agentsam_terminal_local + existing tunnel",
    defaultSurface: "desktop",
  },
];

export function googleCreateInteractionSketch(input: string, env: ManagedEnvironmentRequest) {
  return {
    agent: "antigravity-preview-05-2026",
    input,
    environment: env,
  };
}

export function googleComputerUseSketch(prompt: string, surface: ComputerSurface) {
  return {
    model: "gemini-3.8-flash",
    input: prompt,
    tools: [
      {
        type: "computer_use",
        environment: surface === "sandbox" ? "browser" : surface,
        enable_prompt_injection_detection: true,
      },
    ],
  };
}
