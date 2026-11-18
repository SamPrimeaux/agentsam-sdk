import type { AnimationKeyframe, AnimationTrack, SceneAnimation } from './types.js';

function ease(value: number, name: AnimationKeyframe['easing'] = 'linear'): number {
  const t = Math.max(0, Math.min(1, value));
  if (name === 'sineInOut') return -(Math.cos(Math.PI * t) - 1) / 2;
  if (name === 'cubicInOut') return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  return t;
}

function interpolateValue(a: unknown, b: unknown, t: number): unknown {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) return a.map((value, index) => interpolateValue(value, b[index], t));
  return t < 1 ? a : b;
}

export function sampleAnimationTrack(track: AnimationTrack, time: number): unknown {
  const frames = track.keyframes;
  if (!frames.length) return undefined;
  if (time <= frames[0].time) return frames[0].value;
  if (time >= frames[frames.length - 1].time) return frames[frames.length - 1].value;
  let index = 0;
  while (index < frames.length - 1 && frames[index + 1].time < time) index += 1;
  const from = frames[index];
  const to = frames[index + 1];
  if (track.interpolation === 'step') return from.value;
  const span = to.time - from.time;
  const progress = span <= 0 ? 1 : ease((time - from.time) / span, to.easing ?? from.easing);
  return interpolateValue(from.value, to.value, progress);
}

export function normalizeAnimationTime(animation: SceneAnimation, time: number): number {
  if (!Number.isFinite(time)) throw new Error('iamscene_animation_time_invalid');
  if (animation.loop) return ((time % animation.duration) + animation.duration) % animation.duration;
  return Math.max(0, Math.min(animation.duration, time));
}

export interface SampleAnimationOptions {
  /** Set false for scroll scrubbing: a loop must hold its final frame at 100%. */
  wrap?: boolean;
}

export function sampleAnimation(
  animation: SceneAnimation,
  time: number,
  options: SampleAnimationOptions = {},
): Array<{ targetId: string; property: string; value: unknown }> {
  if (!Number.isFinite(time)) throw new Error('iamscene_animation_time_invalid');
  const localTime = options.wrap === false
    ? Math.max(0, Math.min(animation.duration, time))
    : normalizeAnimationTime(animation, time);
  return animation.tracks.map(track => ({
    targetId: track.targetId,
    property: track.property,
    value: sampleAnimationTrack(track, localTime),
  }));
}
