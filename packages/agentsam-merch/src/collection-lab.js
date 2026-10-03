export const COLLECTION_CANDIDATE_STATE = Object.freeze({
  CONCEPT: "concept",
  APPROVED_ART: "approved-art",
  PRODUCTION_READY: "production-ready",
  SAMPLE_ORDERED: "sample-ordered",
  SAMPLE_APPROVED: "sample-approved",
  PUBLISHED: "published",
  RETIRED: "retired",
});

const transitions = Object.freeze({
  "concept": ["approved-art", "retired"],
  "approved-art": ["production-ready", "concept", "retired"],
  "production-ready": ["sample-ordered", "approved-art", "retired"],
  "sample-ordered": ["sample-approved", "production-ready", "retired"],
  "sample-approved": ["published", "production-ready", "retired"],
  "published": ["retired"],
  "retired": [],
});

export function canTransitionCollectionCandidate(from, to) {
  return (transitions[from] || []).includes(to);
}

export function createCollectionCandidate(input = {}) {
  if (!input.id) throw new TypeError("candidate id is required");
  if (!input.designId) throw new TypeError("candidate designId is required");

  return Object.freeze({
    id: String(input.id),
    designId: String(input.designId),
    collectionPath: Object.freeze([...(input.collectionPath || [])]),
    state: input.state || COLLECTION_CANDIDATE_STATE.CONCEPT,
    products: Object.freeze([...(input.products || [])]),
    approvals: Object.freeze({
      artwork: Boolean(input.approvals?.artwork),
      wording: Boolean(input.approvals?.wording),
      palette: Boolean(input.approvals?.palette),
      visualIdentity: Boolean(input.approvals?.visualIdentity),
    }),
    metadata: Object.freeze({ ...(input.metadata || {}) }),
  });
}

export function transitionCollectionCandidate(candidate, nextState) {
  if (!canTransitionCollectionCandidate(candidate.state, nextState)) {
    throw new Error(`Invalid collection candidate transition: ${candidate.state} -> ${nextState}`);
  }
  return Object.freeze({ ...candidate, state: nextState });
}

export function approvalsComplete(candidate) {
  const approvals = candidate.approvals || {};
  return Boolean(
    approvals.artwork &&
      approvals.wording &&
      approvals.palette &&
      approvals.visualIdentity
  );
}
