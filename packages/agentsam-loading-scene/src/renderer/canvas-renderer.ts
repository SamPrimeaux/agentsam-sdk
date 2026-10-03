import type { ScenePreset, SceneState, VisualIntent } from "../core/types.js";
import { TransitionEngine } from "../core/transition-engine.js";
import { createWorld, stepWorld, type World } from "./world.js";
import {
  drawHyperspaceBackground,
  drawHyperspaceStudy,
} from "./studies.js";
import {
  studyForScene,
  type HyperspaceStudyId,
} from "./study-selection.js";

export interface CanvasLike {
  width: number;
  height: number;
  getContext(id: "2d"): CanvasRenderingContext2D | null;
}

export interface RendererDeps {
  canvas: CanvasLike;
  raf?: (cb: FrameRequestCallback) => number;
  caf?: (id: number) => void;
  now?: () => number;
  devicePixelRatio?: number;
  /** returns unsubscribe; defaults to document visibilitychange when available */
  onVisibility?: (cb: (hidden: boolean) => void) => () => void;
  reducedMotion?: boolean | "auto";
  random?: () => number;
  /** Force one study for galleries/previews. "auto" follows runtime semantics. */
  study?: HyperspaceStudyId | "auto";
  /** Cross-fade time when runtime semantics move between the six studies. */
  studyTransitionMs?: number;
}

/**
 * One canvas, one RAF, one persistent runtime world.
 *
 * Runtime semantics select one of six full-frame Computational Hyperspace
 * studies. Study changes cross-fade inside the same canvas; the controller,
 * world, RAF and geometry allocations are never replaced.
 */
export class HyperspaceRenderer {
  readonly world: World;

  private preset: ScenePreset;
  private deps: Required<Pick<RendererDeps, "canvas" | "raf" | "caf" | "now">> &
    Pick<RendererDeps, "onVisibility">;
  private engine: TransitionEngine;
  private ctx: CanvasRenderingContext2D | null;
  private rafId: number | null = null;
  private lastFrame = 0;
  private disposed = false;
  private suspended = false;
  private hidden = false;
  private scene: SceneState | null = null;
  private dpr: number;
  private width: number;
  private height: number;
  private reduced: boolean;
  private offVisibility: (() => void) | null = null;
  private seed: number;
  private studyOverride: HyperspaceStudyId | "auto";
  private activeStudy: HyperspaceStudyId = "runway";
  private previousStudy: HyperspaceStudyId | null = null;
  private studyTransitionStarted = 0;
  private studyTransitionMs: number;

  constructor(preset: ScenePreset, deps: RendererDeps) {
    this.preset = preset;

    const g = globalThis as unknown as {
      requestAnimationFrame?: (cb: FrameRequestCallback) => number;
      cancelAnimationFrame?: (id: number) => void;
      devicePixelRatio?: number;
      matchMedia?: (query: string) => { matches: boolean };
      document?: Document;
    };

    this.deps = {
      canvas: deps.canvas,
      raf:
        deps.raf ??
        g.requestAnimationFrame?.bind(globalThis) ??
        ((cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number),
      caf:
        deps.caf ??
        g.cancelAnimationFrame?.bind(globalThis) ??
        ((id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>)),
      now: deps.now ?? (() => performance.now()),
      onVisibility: deps.onVisibility,
    };

    this.dpr = Math.min(deps.devicePixelRatio ?? g.devicePixelRatio ?? 1, 1.75);
    this.width = Math.max(1, deps.canvas.width / this.dpr);
    this.height = Math.max(1, deps.canvas.height / this.dpr);
    this.reduced =
      deps.reducedMotion === true ||
      (deps.reducedMotion !== false &&
        (g.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false));

    this.engine = new TransitionEngine(preset.transition.easing);
    const random = deps.random ?? Math.random;
    this.world = createWorld(preset, random);
    this.seed = random() * 1000;
    this.ctx = deps.canvas.getContext("2d");
    this.studyOverride = deps.study ?? "auto";
    this.studyTransitionMs =
      deps.studyTransitionMs ?? Math.max(560, Math.round(preset.transition.settleMs * 0.78));

    const visibilitySource =
      deps.onVisibility ??
      (g.document
        ? (cb: (hidden: boolean) => void) => {
            const doc = g.document!;
            const handler = () => cb(doc.visibilityState === "hidden");
            doc.addEventListener("visibilitychange", handler);
            return () => doc.removeEventListener("visibilitychange", handler);
          }
        : undefined);

    if (visibilitySource) {
      this.offVisibility = visibilitySource((hidden) => {
        this.hidden = hidden;
        if (hidden) this.stopLoop();
        else this.startLoop();
      });
    }
  }

  get running(): boolean {
    return this.rafId !== null;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  get currentStudy(): HyperspaceStudyId {
    return this.activeStudy;
  }

  setSize(cssWidth: number, cssHeight: number): void {
    this.width = Math.max(1, cssWidth);
    this.height = Math.max(1, cssHeight);
    this.deps.canvas.width = Math.max(1, Math.round(this.width * this.dpr));
    this.deps.canvas.height = Math.max(1, Math.round(this.height * this.dpr));
    this.ctx?.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** Pin one study for previews or return to semantic-driven selection with "auto". */
  setStudy(study: HyperspaceStudyId | "auto"): void {
    this.studyOverride = study;
    if (this.scene) {
      this.transitionToStudy(this.resolveStudy(this.scene));
    }
    this.startLoop();
  }

  setScene(scene: SceneState): void {
    this.scene = scene;

    let intent: VisualIntent = scene.intent;
    if (this.reduced) {
      intent = {
        ...intent,
        signalActivity: Math.min(
          intent.signalActivity,
          this.preset.reducedMotion.signalActivity,
        ),
        forwardMotion: Math.min(
          intent.forwardMotion,
          this.preset.reducedMotion.forwardMotion,
        ),
      };
    }

    this.engine.setTarget(intent);
    this.transitionToStudy(this.resolveStudy(scene));
    this.startLoop();
  }

  suspend(): void {
    this.suspended = true;
    this.stopLoop();
  }

  resume(): void {
    if (this.disposed) return;
    this.suspended = false;
    this.startLoop();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLoop();
    this.offVisibility?.();
    this.offVisibility = null;
  }

  private resolveStudy(scene: SceneState): HyperspaceStudyId {
    return this.studyOverride === "auto"
      ? studyForScene(scene)
      : this.studyOverride;
  }

  private transitionToStudy(next: HyperspaceStudyId): void {
    if (next === this.activeStudy) return;
    this.previousStudy = this.activeStudy;
    this.activeStudy = next;
    this.studyTransitionStarted = this.deps.now();
  }

  private startLoop(): void {
    if (
      this.disposed ||
      this.suspended ||
      this.hidden ||
      this.rafId !== null ||
      !this.scene
    ) {
      return;
    }

    this.lastFrame = this.deps.now();
    this.rafId = this.deps.raf((now) => this.frame(now));
  }

  private stopLoop(): void {
    if (this.rafId === null) return;
    this.deps.caf(this.rafId);
    this.rafId = null;
  }

  private frame(now: number): void {
    this.rafId = null;
    if (this.disposed || this.suspended || this.hidden || !this.scene) return;

    const dt = Math.max(0, Math.min(100, now - this.lastFrame || 16.7));
    this.lastFrame = now;

    const intent = this.engine.step(dt);
    stepWorld(this.world, intent, dt / 1000, this.scene.status === "success");

    this.draw(now, intent);
    this.rafId = this.deps.raf((time) => this.frame(time));
  }

  private draw(now: number, intent: VisualIntent): void {
    const ctx = this.ctx;
    const scene = this.scene;
    if (!ctx || !scene) return;

    const width = this.width;
    const height = this.height;
    drawHyperspaceBackground(
      ctx,
      width,
      height,
      this.preset,
      Math.max(0.24, intent.luminance),
    );

    const input = {
      ctx,
      width,
      height,
      time: now,
      seed: this.seed,
      preset: this.preset,
      scene,
      intent,
      reducedMotion: this.reduced,
    };

    if (this.previousStudy) {
      const elapsed = Math.max(0, now - this.studyTransitionStarted);
      const raw = Math.min(1, elapsed / this.studyTransitionMs);
      const mix = raw * raw * (3 - 2 * raw);

      drawHyperspaceStudy(this.previousStudy, input, 1 - mix);
      drawHyperspaceStudy(this.activeStudy, input, mix);

      if (raw >= 1) {
        this.previousStudy = null;
      }
    } else {
      drawHyperspaceStudy(this.activeStudy, input, 1);
    }
  }
}
