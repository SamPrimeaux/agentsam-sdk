import type { SceneState, ScenePreset, VisualIntent } from "../core/types.js";
import { TransitionEngine } from "../core/transition-engine.js";
import { createWorld, stepWorld, type World } from "./world.js";
import { alongRay, makeViewport, type Viewport } from "./projection.js";

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
}

/**
 * One canvas, one RAF, one persistent world. The renderer only ever
 * receives SceneState — it has no idea providers or tools exist.
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
  private viewport: Viewport;
  private reduced: boolean;
  private offVisibility: (() => void) | null = null;
  private scratch = { x: 0, y: 0 };
  private scratch2 = { x: 0, y: 0 };

  constructor(preset: ScenePreset, deps: RendererDeps) {
    this.preset = preset;
    const g = globalThis as unknown as {
      requestAnimationFrame?: (cb: FrameRequestCallback) => number;
      cancelAnimationFrame?: (id: number) => void;
      devicePixelRatio?: number;
      matchMedia?: (q: string) => { matches: boolean };
      document?: Document;
    };
    this.deps = {
      canvas: deps.canvas,
      raf: deps.raf ?? g.requestAnimationFrame?.bind(globalThis) ?? ((cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number),
      caf: deps.caf ?? g.cancelAnimationFrame?.bind(globalThis) ?? ((id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>)),
      now: deps.now ?? (() => performance.now()),
      onVisibility: deps.onVisibility,
    };
    this.dpr = Math.min(deps.devicePixelRatio ?? g.devicePixelRatio ?? 1, 1.75);
    this.reduced =
      deps.reducedMotion === true ||
      (deps.reducedMotion !== false &&
        (g.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false));

    this.engine = new TransitionEngine(preset.transition.easing);
    this.world = createWorld(preset, deps.random ?? Math.random);
    this.ctx = deps.canvas.getContext("2d");
    this.viewport = makeViewport(deps.canvas.width / this.dpr, deps.canvas.height / this.dpr);

    const visSource =
      deps.onVisibility ??
      (g.document
        ? (cb: (hidden: boolean) => void) => {
            const doc = g.document!;
            const handler = () => cb(doc.visibilityState === "hidden");
            doc.addEventListener("visibilitychange", handler);
            return () => doc.removeEventListener("visibilitychange", handler);
          }
        : undefined);
    if (visSource) {
      this.offVisibility = visSource((hidden) => {
        this.hidden = hidden;
        if (hidden) this.stopLoop();
        else this.startLoop();
      });
    }
  }

  setSize(cssWidth: number, cssHeight: number): void {
    this.deps.canvas.width = Math.max(1, Math.round(cssWidth * this.dpr));
    this.deps.canvas.height = Math.max(1, Math.round(cssHeight * this.dpr));
    this.viewport = makeViewport(cssWidth, cssHeight);
  }

  setScene(scene: SceneState): void {
    this.scene = scene;
    let intent = scene.intent;
    if (this.reduced) {
      intent = {
        ...intent,
        signalActivity: Math.min(intent.signalActivity, this.preset.reducedMotion.signalActivity),
        forwardMotion: Math.min(intent.forwardMotion, this.preset.reducedMotion.forwardMotion),
        branching: intent.branching * 0.4,
      };
    }
    this.engine.setTarget(intent);
    if (!this.suspended) this.startLoop();
  }

  /** Settle-and-reveal: stop the loop after arrival; world stays intact. */
  suspend(): void {
    this.suspended = true;
    this.stopLoop();
  }

  resume(): void {
    this.suspended = false;
    if (!this.hidden) this.startLoop();
  }

  get running(): boolean {
    return this.rafId !== null;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLoop();
    this.offVisibility?.();
    this.offVisibility = null;
  }

  /** Advance one frame manually (tests, pre-render). dt in ms. */
  tick(dt: number): void {
    const intent = this.engine.step(dt);
    const settling = this.scene?.status === "success";
    stepWorld(this.world, intent, dt / 1000, !!settling);
    this.draw(intent);
  }

  private startLoop(): void {
    if (this.rafId !== null || this.disposed || this.hidden || this.suspended) return;
    this.lastFrame = this.deps.now();
    const frame = () => {
      if (this.disposed || this.hidden || this.suspended) {
        this.rafId = null;
        return;
      }
      const now = this.deps.now();
      const dt = Math.min(64, now - this.lastFrame);
      this.lastFrame = now;
      this.tick(dt);
      this.rafId = this.deps.raf(frame);
    };
    this.rafId = this.deps.raf(frame);
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      this.deps.caf(this.rafId);
      this.rafId = null;
    }
  }

  // ─── drawing ───────────────────────────────────────────────────────────

  private draw(intent: VisualIntent): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const vp = this.viewport;
    const w = vp.width;
    const h = vp.height;
    const world = this.world;
    const pal = this.preset.palette;
    const lum = intent.luminance * (1 - world.settle * 0.55);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = pal.canvas;
    ctx.fillRect(0, 0, w, h);

    // faint deep-field gradient — barely there
    const grad = ctx.createRadialGradient(vp.vpX, vp.vpY, 0, vp.vpX, vp.vpY, Math.max(w, h) * 0.7);
    grad.addColorStop(0, `rgba(10, 10, 16, ${0.5 * lum + 0.08})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    this.drawDepthLayers(ctx, intent, lum);
    this.drawRays(ctx, intent, lum);
    this.drawTopology(ctx, intent, lum);
    this.drawSignals(ctx, lum);
    this.drawGeneration(ctx, intent, lum);
  }

  private drawRays(ctx: CanvasRenderingContext2D, intent: VisualIntent, lum: number): void {
    const vp = this.viewport;
    const world = this.world;
    const pal = this.preset.palette;
    for (let i = 0; i < world.rays.length; i++) {
      const ray = world.rays[i]!;
      // lower hemisphere denser: skip a share of upward rays
      const upward = Math.sin(ray.angle) < -0.25;
      if (upward && ray.jitter > 0.3) continue;

      const alpha = (0.05 + 0.3 * lum) * ray.weight;
      ctx.strokeStyle = ray.accent >= 0 ? pal.accents[ray.accent]! : pal.line;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      alongRay(vp, ray.angle, 0.02, this.scratch);
      ctx.moveTo(this.scratch.x, this.scratch.y);

      if (ray.fractured) {
        // localized fracture: break + lateral displacement, rest of world calm
        alongRay(vp, ray.angle, ray.fractureT, this.scratch);
        ctx.lineTo(this.scratch.x, this.scratch.y);
        ctx.stroke();
        ctx.strokeStyle = pal.warning;
        ctx.globalAlpha = alpha * 1.6;
        ctx.beginPath();
        alongRay(vp, ray.angle + 0.035, ray.fractureT + 0.06, this.scratch);
        ctx.moveTo(this.scratch.x, this.scratch.y);
        alongRay(vp, ray.angle + 0.02, 1.1, this.scratch);
        ctx.lineTo(this.scratch.x, this.scratch.y);
        ctx.stroke();
      } else {
        alongRay(vp, ray.angle, 1.1, this.scratch);
        ctx.lineTo(this.scratch.x, this.scratch.y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawDepthLayers(ctx: CanvasRenderingContext2D, intent: VisualIntent, lum: number): void {
    const vp = this.viewport;
    const world = this.world;
    const pal = this.preset.palette;
    const travel = world.travel;
    for (const layer of world.layers) {
      // concentric depth lines travel toward the viewer
      const t = ((layer.depth + travel * 0.22) % 1 + 1) % 1;
      const alpha = (0.04 + 0.16 * lum) * (0.3 + t * 0.7);
      ctx.strokeStyle = pal.line;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 0.5;
      const rx = t * t * vp.width * 0.85;
      const ry = t * t * vp.height * 0.6 * (1 - layer.lift * 0.5);
      const lift = layer.lift * vp.height * 0.08 * t;
      ctx.beginPath();
      // lower arc only — upper field stays empty
      ctx.ellipse(vp.vpX, vp.vpY - lift, Math.max(0.5, rx), Math.max(0.5, ry), 0, Math.PI * 0.08, Math.PI * 0.92);
      ctx.stroke();
      if (layer.lift > 0.4) {
        // lifted layers read as faint planes
        ctx.globalAlpha = alpha * 0.4 * layer.lift;
        ctx.beginPath();
        ctx.ellipse(vp.vpX, vp.vpY - lift * 1.6, Math.max(0.5, rx * 0.96), Math.max(0.5, ry * 0.85), 0, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawTopology(ctx: CanvasRenderingContext2D, intent: VisualIntent, lum: number): void {
    const strength = Math.max(intent.structure, intent.verification);
    if (strength < 0.08) return;
    const vp = this.viewport;
    const world = this.world;
    const pal = this.preset.palette;
    const scale = Math.min(vp.width, vp.height);
    ctx.globalAlpha = 0.1 + 0.35 * strength * lum;
    ctx.strokeStyle = pal.accents[4]!;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < world.topology.length; i++) {
      const n = world.topology[i]!;
      const wob = Math.sin(world.time * 0.4 + n.phase) * 0.01;
      const x = vp.vpX + Math.cos(n.angle) * (n.radius + wob) * scale * 0.5;
      const y = vp.vpY + Math.sin(n.angle) * (n.radius + wob) * scale * 0.33 + scale * 0.04;
      for (const j of n.links) {
        const m = world.topology[j]!;
        const mx = vp.vpX + Math.cos(m.angle) * m.radius * scale * 0.5;
        const my = vp.vpY + Math.sin(m.angle) * m.radius * scale * 0.33 + scale * 0.04;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(mx, my);
        ctx.stroke();
      }
      if (intent.verification > 0.3) {
        ctx.fillStyle = pal.accents[1]!;
        const pulse = 0.5 + 0.5 * Math.sin(world.time * 1.2 + n.phase);
        ctx.globalAlpha = (0.1 + 0.3 * intent.verification * pulse) * lum * 2;
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.1 + 0.35 * strength * lum;
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawSignals(ctx: CanvasRenderingContext2D, lum: number): void {
    const vp = this.viewport;
    const world = this.world;
    const pal = this.preset.palette;
    for (const s of world.signals) {
      if (s.alive < 0.03) continue;
      const ray = world.rays[s.ray]!;
      alongRay(vp, ray.angle, s.t, this.scratch);
      alongRay(vp, ray.angle, Math.max(0, s.t - 0.05), this.scratch2);
      ctx.strokeStyle = pal.accents[s.accent]!;
      ctx.globalAlpha = s.alive * (0.25 + 0.5 * lum) * (0.3 + s.t * 0.7);
      ctx.lineWidth = s.size * (0.4 + s.t);
      ctx.beginPath();
      ctx.moveTo(this.scratch2.x, this.scratch2.y);
      ctx.lineTo(this.scratch.x, this.scratch.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawGeneration(ctx: CanvasRenderingContext2D, intent: VisualIntent, lum: number): void {
    const g = this.world.generation;
    if (g.stage < 0.08) return;
    const vp = this.viewport;
    const pal = this.preset.palette;
    const ray = this.world.rays[g.ray]!;
    alongRay(vp, ray.angle, g.t, this.scratch);
    const cx = this.scratch.x;
    const cy = this.scratch.y;
    const size = Math.min(vp.width, vp.height) * 0.09;

    // stage 0→1: a line extends
    const lineP = Math.min(1, g.stage);
    ctx.strokeStyle = pal.accents[2]!;
    ctx.globalAlpha = (0.2 + 0.5 * lum) * lineP;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(cx - size * lineP, cy);
    ctx.lineTo(cx + size * lineP, cy);
    ctx.stroke();

    // stage 1→2: line bends into a bounded contour
    const contourP = Math.max(0, Math.min(1, g.stage - 1));
    if (contourP > 0.02) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, size, size * 0.66 * contourP, 0, 0, Math.PI * 2);
      ctx.globalAlpha = (0.15 + 0.4 * lum) * contourP;
      ctx.stroke();
    }

    // stage 2→3: contour fills into a faint plane
    const planeP = Math.max(0, Math.min(1, g.stage - 2));
    if (planeP > 0.02) {
      ctx.fillStyle = pal.accents[2]!;
      ctx.globalAlpha = 0.05 * planeP * lum * 3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, size, size * 0.66, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // stage 3→4: resolved plane sends a signal back to the main flow
    const resolveP = Math.max(0, Math.min(1, g.stage - 3));
    if (resolveP > 0.02) {
      ctx.strokeStyle = pal.accents[0]!;
      ctx.globalAlpha = 0.3 * resolveP * lum * 2;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      alongRay(vp, ray.angle, Math.min(1, g.t + 0.3 * resolveP), this.scratch);
      ctx.lineTo(this.scratch.x, this.scratch.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
