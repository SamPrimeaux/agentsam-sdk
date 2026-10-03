function normalizeProvider(value) {
  return value == null ? null : String(value).trim().toLowerCase();
}

function normalizeTarget(target = {}, index = 0) {
  return Object.freeze({
    ...target,
    provider: normalizeProvider(target.provider),
    profileId: target.profileId ? String(target.profileId) : null,
    priority: Number.isFinite(Number(target.priority))
      ? Number(target.priority)
      : index,
    enabled: target.enabled !== false,
  });
}

export function normalizeProductConcept(input = {}) {
  if (!input.id) throw new TypeError("product concept id is required");
  const targets = (input.targets || []).map(normalizeTarget);
  return Object.freeze({
    ...input,
    id: String(input.id),
    label: input.label ? String(input.label) : String(input.id),
    category: input.category ? String(input.category) : null,
    targets: Object.freeze(targets),
  });
}

export function createProductConceptRegistry(initial = []) {
  const concepts = new Map();

  function register(input, { replace = false } = {}) {
    const concept = normalizeProductConcept(input);
    if (!replace && concepts.has(concept.id)) {
      throw new Error(`Product concept already registered: ${concept.id}`);
    }
    concepts.set(concept.id, concept);
    return concept;
  }

  function get(id) {
    return concepts.get(String(id)) || null;
  }

  function list() {
    return [...concepts.values()];
  }

  for (const concept of initial) register(concept);

  return Object.freeze({ register, get, list });
}

export function resolveProductConceptTarget(
  conceptInput,
  {
    profileRegistry,
    availableProviders = [],
    preferredProvider = null,
  } = {},
) {
  const concept = normalizeProductConcept(conceptInput);
  if (!profileRegistry?.get) {
    throw new TypeError("profileRegistry is required");
  }

  const available = new Set(
    availableProviders.map(normalizeProvider).filter(Boolean),
  );
  const preferred = normalizeProvider(preferredProvider);

  const ranked = concept.targets
    .filter((target) => target.enabled)
    .map((target) => {
      const profile = target.profileId
        ? profileRegistry.get(target.profileId)
        : null;
      const providerAvailable =
        available.size === 0 || available.has(target.provider);
      const preferredBoost =
        preferred && target.provider === preferred ? -1000 : 0;
      return {
        target,
        profile,
        providerAvailable,
        rank: target.priority + preferredBoost,
      };
    })
    .filter((entry) => entry.profile && entry.providerAvailable)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        String(a.target.provider).localeCompare(String(b.target.provider)),
    );

  const selected = ranked[0] || null;
  return Object.freeze({
    conceptId: concept.id,
    selected: selected
      ? Object.freeze({
          provider: selected.target.provider,
          profileId: selected.target.profileId,
          profile: selected.profile,
          adapter: selected.target.adapter || null,
          metadata: selected.target.metadata || null,
        })
      : null,
    candidates: Object.freeze(
      ranked.map((entry) =>
        Object.freeze({
          provider: entry.target.provider,
          profileId: entry.target.profileId,
          priority: entry.target.priority,
        }),
      ),
    ),
  });
}
