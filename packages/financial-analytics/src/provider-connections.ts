import type { FinancialCapability } from "./index.js";

export type FinancialProviderStatus = "available" | "connected" | "action_required" | "unavailable";

/** A host-supplied entry from its authenticated provider discovery endpoint. */
export type FinancialConnectionProvider = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  status: FinancialProviderStatus;
  statusDetail?: string;
  capabilities?: FinancialCapability[];
  /** Human-readable permissions the user is asked to approve at the provider. */
  permissions?: string[];
};

/** Created by the host server, never in the browser using provider secrets. */
export type FinancialAuthorizationHandoff = { authorizationUrl: string };

/** Reject unsafe or malformed provider handoff URLs before browser navigation. */
export function validateFinancialAuthorizationUrl(
  input: string,
  base?: string,
): string {
  const parsed = new URL(input, base);
  if (parsed.protocol !== "https:") {
    const localDevelopment = parsed.protocol === "http:"
      && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]");
    if (!localDevelopment) throw new Error("The provider returned an insecure authorization URL.");
  }
  if (parsed.username || parsed.password) throw new Error("The authorization URL cannot contain credentials.");
  if (!parsed.hostname) throw new Error("The authorization URL is missing its host.");
  return parsed.toString();
}
