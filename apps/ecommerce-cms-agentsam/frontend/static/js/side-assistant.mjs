export function renderAssistantHeader(state) {
  return {
    title: "AgentSam",
    actions: ["New chat", state.expanded ? "Collapse" : "Expand"],
    chip: state.selection || "",
    placeholder: state.selection ? "Ask about " + state.selection : "Ask about this page",
  };
}

export function presentAgentsamProposal(proposal) {
  return {
    kind: "action-card",
    title: proposal.title || "Apply change",
    createsPlaceholder: true,
  };
}

export function renderProvenanceCard(provenance, open) {
  return {
    title: "AI generated",
    open: Boolean(open),
    prompt: provenance.prompt || "",
    provenance,
  };
}
