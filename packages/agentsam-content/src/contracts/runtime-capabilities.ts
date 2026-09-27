/**
 * Snapshot of what this host's ContentRuntime can actually do.
 * UI must derive tabs/actions from this — never hardcode R2|Images|Drive.
 */

import type { CapabilityDescriptor, ContentCapabilityId } from "./capabilities.js";
import type { LocalRuntimeAvailability } from "./local-host.js";
import type { ContentKnowledgeCapabilities } from "./knowledge.js";

export interface RuntimeProviderCapability {
  id: string;
  capabilities: ContentCapabilityId[];
  kinds?: string[];
  /** Legacy ContentProvider names still registered. */
  legacy?: boolean;
}

export interface ContentRuntimeCapabilities {
  accountId: string;
  providers: RuntimeProviderCapability[];
  capabilities: CapabilityDescriptor[];
  brand: {
    resolver: boolean;
  };
  knowledge: ContentKnowledgeCapabilities;
  local: {
    availability: LocalRuntimeAvailability;
    watchSupported: boolean;
    processSupported: boolean;
  };
  permissions: {
    /** True when host left the non-production allowAll policy in place. */
    allowAll: boolean;
  };
}

export function hasRuntimeCapability(
  caps: ContentRuntimeCapabilities,
  id: ContentCapabilityId,
): boolean {
  return caps.capabilities.some((c) => c.id === id && c.status !== "unavailable");
}
