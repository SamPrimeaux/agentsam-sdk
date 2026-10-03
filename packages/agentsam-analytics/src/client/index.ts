import type {
  AgentSamAnalyticsRange,
  AgentSamAnalyticsReadModels,
  AgentSamAnalyticsSection,
} from "../contracts";

export async function fetchAgentSamAnalytics<T extends AgentSamAnalyticsSection>(
  section: T,
  range: AgentSamAnalyticsRange,
  options: {
    baseUrl?: string;
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<AgentSamAnalyticsReadModels[T]> {
  const {
    baseUrl = "",
    signal,
    fetchImpl = fetch,
  } = options;

  const relative = `/api/analytics/${section}?range=${encodeURIComponent(range)}`;
  const url = baseUrl ? `${baseUrl.replace(/\/$/, "")}${relative}` : relative;

  const response = await fetchImpl(url, {
    credentials: "include",
    headers: { accept: "application/json" },
    signal,
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : `analytics ${section} failed (${response.status})`,
    );
  }

  return body as AgentSamAnalyticsReadModels[T];
}
