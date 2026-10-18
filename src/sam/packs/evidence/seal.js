const VIDEO_OK = new Set(['h264', 'avc1', 'vp8', 'vp9', 'av1']);
const AUDIO_OK = new Set(['aac', 'opus', 'vorbis', 'mp3']);

/** Browser-decodable video: Chrome cannot decode MPEG-4 Part 2, and a failed decode is never "verified". */
export function isBrowserDecodable(info) {
  if (info?.decoded === false) return false;
  const video = String(info?.video?.codec ?? '').toLowerCase();
  if (!VIDEO_OK.has(video)) return false;
  const audio = info?.audio?.codec;
  return audio == null || AUDIO_OK.has(String(audio).toLowerCase());
}

/**
 * Status is computed from the tree, never written by hand.
 * failed: nothing captured, or a declared check reported failure.
 * degraded: anything declared is missing, unreported or unverified.
 * verified: every declared state captured, every check passed, no open reasons.
 */
export function computeStatus({ assets, missing, checks, reasons }) {
  if (assets.length === 0) return 'failed';
  if (checks.some((check) => check.status === 'failed')) return 'failed';
  if (missing.length > 0 || reasons.length > 0 || checks.some((check) => check.status !== 'passed')) return 'degraded';
  return 'verified';
}

/**
 * Files in a run that the pack did not write (no sidecar) are drift: someone dropped them in by hand.
 * Infrastructure files are exempt. Keys are relative to the run root.
 */
export function findNoncanonical(keys) {
  const set = new Set(keys);
  return keys.filter((key) => {
    if (key.endsWith('.evidence.json') || key.endsWith('.beats.json') || key.endsWith('/capture-errors.json')) return false;
    return !set.has(`${key}.evidence.json`);
  }).sort();
}

const two = (n) => String(n).padStart(2, '0');
export function formatSrtTime(ms) {
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  return `${two(hours)}:${two(minutes)}:${two(seconds)},${String(total % 1000).padStart(3, '0')}`;
}

/** Beat labels with a timestamp become subtitle-style markers. Returns null if none are timed. */
export function renderSrt(beats) {
  const timed = beats.filter((beat) => Number.isFinite(beat.atMs)).sort((a, b) => a.atMs - b.atMs);
  if (timed.length === 0) return null;
  return timed.map((beat, index) => {
    const end = Math.max(timed[index + 1]?.atMs ?? beat.atMs + 2000, beat.atMs + 500);
    return `${index + 1}\n${formatSrtTime(beat.atMs)} --> ${formatSrtTime(end)}\n${beat.label ?? beat.state}\n`;
  }).join('\n');
}
