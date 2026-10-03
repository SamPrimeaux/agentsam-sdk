import { validateManufacturingProfile } from "./profile.js";

function text(value) {
  return value == null ? "" : String(value).trim().toLowerCase();
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function equalsAny(expected, actual) {
  const target = text(actual);
  return asArray(expected).some((value) => text(value) === target);
}

function scoreProfile(profile, context = {}) {
  const match = profile.match || {};
  let score = 0;

  if (match.manufacturer != null) {
    if (!equalsAny(match.manufacturer, context.manufacturer)) return -1;
    score += 20;
  }
  if (match.process != null) {
    if (!equalsAny(match.process, context.process)) return -1;
    score += 20;
  }
  if (match.locationName != null) {
    if (!equalsAny(match.locationName, context.locationName)) return -1;
    score += 8;
  }
  if (match.productType != null) {
    if (!equalsAny(match.productType, context.productType)) return -1;
    score += 6;
  }

  const width = Number(context.printWidthIn || 0);
  const height = Number(context.printHeightIn || 0);

  if (match.minWidthIn != null) {
    if (!width || width < Number(match.minWidthIn)) return -1;
    score += 3;
  }
  if (match.maxWidthIn != null) {
    if (!width || width > Number(match.maxWidthIn)) return -1;
    score += 3;
  }
  if (match.minHeightIn != null) {
    if (!height || height < Number(match.minHeightIn)) return -1;
    score += 3;
  }
  if (match.maxHeightIn != null) {
    if (!height || height > Number(match.maxHeightIn)) return -1;
    score += 3;
  }

  return score;
}

export function createManufacturingProfileRegistry(initialProfiles = []) {
  const profiles = new Map();

  function register(input, { replace = false } = {}) {
    const result = validateManufacturingProfile(input);
    if (!result.ok) {
      throw new TypeError(`Invalid manufacturing profile: ${result.errors.join("; ")}`);
    }
    if (!replace && profiles.has(result.profile.id)) {
      throw new Error(`Manufacturing profile already registered: ${result.profile.id}`);
    }
    profiles.set(result.profile.id, result.profile);
    return result.profile;
  }

  function get(id) {
    return profiles.get(String(id)) || null;
  }

  function list(filter = {}) {
    return [...profiles.values()].filter((profile) => {
      if (filter.manufacturer && profile.manufacturer !== text(filter.manufacturer)) return false;
      if (filter.process && profile.process !== text(filter.process)) return false;
      return true;
    });
  }

  function select(context = {}) {
    return (
      list()
        .map((profile) => ({ profile, score: scoreProfile(profile, context) }))
        .filter((entry) => entry.score >= 0)
        .sort((a, b) => b.score - a.score || a.profile.id.localeCompare(b.profile.id))[0]?.profile || null
    );
  }

  function unregister(id) {
    return profiles.delete(String(id));
  }

  for (const profile of initialProfiles) register(profile);

  return Object.freeze({ register, get, list, select, unregister });
}
