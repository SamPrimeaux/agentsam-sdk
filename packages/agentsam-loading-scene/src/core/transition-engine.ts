import { INTENT_KEYS, type VisualIntent, ZERO_INTENT } from "./types.js";

/**
 * current += (target - current) * easing — per frame, per key.
 * States set targets; the world only ever interpolates. No hard cuts.
 */
export class TransitionEngine {
  current: VisualIntent = { ...ZERO_INTENT };
  private target: VisualIntent = { ...ZERO_INTENT };
  private easing: number;

  constructor(easing = 0.045) {
    this.easing = easing;
  }

  setTarget(intent: VisualIntent): void {
    this.target = intent;
  }

  setEasing(e: number): void {
    this.easing = e;
  }

  /** dt in ms; easing normalized to a 16.7ms frame. */
  step(dt = 16.7): VisualIntent {
    const k = 1 - Math.pow(1 - this.easing, dt / 16.7);
    for (const key of INTENT_KEYS) {
      this.current[key] += (this.target[key] - this.current[key]) * k;
    }
    return this.current;
  }

  /** Largest remaining distance to target — used for settle detection. */
  distance(): number {
    let max = 0;
    for (const key of INTENT_KEYS) {
      const d = Math.abs(this.target[key] - this.current[key]);
      if (d > max) max = d;
    }
    return max;
  }
}
