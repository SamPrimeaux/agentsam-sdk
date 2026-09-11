/**
 * Identity is established outside the workbench. These contracts only carry the
 * authenticated principal into product authorization and runtime adapters.
 */
export interface AgentPrincipal {
  accountId: string;
  authUserId: string;
  displayName?: string;
  email?: string;
  claims?: Record<string, unknown>;
}

export interface AgentIdentityProvider {
  getPrincipal(): AgentPrincipal | null | Promise<AgentPrincipal | null>;
  subscribe?(onChange: (principal: AgentPrincipal | null) => void): () => void;
}
