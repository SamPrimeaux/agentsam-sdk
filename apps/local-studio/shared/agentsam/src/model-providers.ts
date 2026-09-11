export type ModelProviderId = "grok" | "openai" | "gemini" | "workers-ai" | "ollama";

export type ModelProvider = {
  id: ModelProviderId;
  label: string;
  runtime: "edge-api" | "workers-ai" | "local-execos";
  credential?: "XAI_API_KEY" | "OPENAI_API_KEY" | "GEMINI_API_KEY";
  binding?: "AGENTSAM_WAI" | "EXECOS";
  local?: boolean;
};

export const MODEL_PROVIDERS: readonly ModelProvider[] = Object.freeze([
  {
    id: "grok",
    label: "Grok",
    runtime: "edge-api",
    credential: "XAI_API_KEY",
  },
  {
    id: "openai",
    label: "OpenAI",
    runtime: "edge-api",
    credential: "OPENAI_API_KEY",
  },
  {
    id: "gemini",
    label: "Gemini",
    runtime: "edge-api",
    credential: "GEMINI_API_KEY",
  },
  {
    id: "workers-ai",
    label: "Workers AI",
    runtime: "workers-ai",
    binding: "AGENTSAM_WAI",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    runtime: "local-execos",
    binding: "EXECOS",
    local: true,
  },
]);

export const MODEL_PROVIDER_IDS = new Set(MODEL_PROVIDERS.map((provider) => provider.id));

export function getModelProvider(id: string | undefined | null): ModelProvider | null {
  return MODEL_PROVIDERS.find((provider) => provider.id === id) ?? null;
}
