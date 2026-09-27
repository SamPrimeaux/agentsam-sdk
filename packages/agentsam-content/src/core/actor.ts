export interface ActorRef {
  type: "human" | "agent" | "import" | "system";
  /** User id, agent name ("agentsam"), import batch... */
  ref?: string;
}

export const SYSTEM_ACTOR: ActorRef = { type: "system" };
export const AGENTSAM_ACTOR: ActorRef = { type: "agent", ref: "agentsam" };
