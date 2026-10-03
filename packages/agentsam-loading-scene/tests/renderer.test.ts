import { describe, expect, it, vi } from "vitest";
import { HyperspaceRenderer, type CanvasLike } from "../src/renderer/canvas-renderer.js";
import { LoadingSceneController } from "../src/core/controller.js";
import { computationalHyperspace } from "../src/presets/computational-hyperspace.js";

/** Minimal 2D context stub — every method the renderer touches is a no-op spy. */
function makeStubCanvas(): { canvas: CanvasLike; ctx: Record<string, unknown> } {
  const gradient = { addColorStop: vi.fn() };
  const ctx: Record<string, unknown> = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    createLinearGradient: vi.fn(() => gradient),
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
  };
  const canvas: CanvasLike = {
    width: 800,
    height: 600,
    getContext: () => ctx as unknown as CanvasRenderingContext2D,
  };
  return { canvas, ctx };
}

function makeFakeFrameLoop() {
  let nextId = 1;
  const pending = new Map<number, FrameRequestCallback>();
  let time = 0;
  return {
    raf: (cb: FrameRequestCallback) => {
      const id = nextId++;
      pending.set(id, cb);
      return id;
    },
    caf: (id: number) => {
      pending.delete(id);
    },
    now: () => time,
    flush(frames: number, dt = 16.7) {
      for (let i = 0; i < frames; i++) {
        time += dt;
        const cbs = [...pending.values()];
        pending.clear();
        for (const cb of cbs) cb(time);
      }
    },
    get pendingCount() {
      return pending.size;
    },
  };
}

function makeRenderer(opts: { reducedMotion?: boolean } = {}) {
  const { canvas, ctx } = makeStubCanvas();
  const loop = makeFakeFrameLoop();
  let visCb: ((hidden: boolean) => void) | null = null;
  const offVisibility = vi.fn();
  const renderer = new HyperspaceRenderer(computationalHyperspace, {
    canvas,
    raf: loop.raf,
    caf: loop.caf,
    now: loop.now,
    devicePixelRatio: 2,
    reducedMotion: opts.reducedMotion ?? false,
    random: () => 0.42,
    onVisibility: (cb) => {
      visCb = cb;
      return offVisibility;
    },
  });
  return { renderer, canvas, ctx, loop, getVisCb: () => visCb, offVisibility };
}

function runningScene(controller: LoadingSceneController) {
  controller.start({ operationId: "op", semantic: "tool_execution", label: "Working" });
  return controller.getScene();
}

describe("renderer lifecycle", () => {
  it("starts one RAF loop and draws frames", () => {
    const { renderer, ctx, loop } = makeRenderer();
    const controller = new LoadingSceneController(computationalHyperspace);
    renderer.setScene(runningScene(controller));
    expect(renderer.running).toBe(true);
    loop.flush(5);
    expect((ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    renderer.dispose();
  });

  it("dispose cancels the RAF and unhooks visibility", () => {
    const { renderer, loop, offVisibility } = makeRenderer();
    const controller = new LoadingSceneController(computationalHyperspace);
    renderer.setScene(runningScene(controller));
    loop.flush(2);
    renderer.dispose();
    expect(renderer.isDisposed).toBe(true);
    loop.flush(3);
    expect(loop.pendingCount).toBe(0);
    expect(offVisibility).toHaveBeenCalled();
  });

  it("pauses when hidden and resumes when visible", () => {
    const { renderer, ctx, loop, getVisCb } = makeRenderer();
    const controller = new LoadingSceneController(computationalHyperspace);
    renderer.setScene(runningScene(controller));
    loop.flush(2);
    getVisCb()!(true);
    loop.flush(1);
    expect(loop.pendingCount).toBe(0); // no frames scheduled while hidden
    const callsWhileHidden = (ctx.stroke as ReturnType<typeof vi.fn>).mock.calls.length;
    loop.flush(5);
    expect((ctx.stroke as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsWhileHidden);
    getVisCb()!(false);
    expect(renderer.running).toBe(true);
    renderer.dispose();
  });

  it("reduced motion clamps signal activity and forward motion targets", () => {
    const { renderer, loop } = makeRenderer({ reducedMotion: true });
    const controller = new LoadingSceneController(computationalHyperspace);
    controller.start({ operationId: "op", semantic: "deployment" });
    renderer.setScene(controller.getScene());
    loop.flush(400); // converge
    expect(renderer.world.travel).toBeLessThan(1.5); // nearly still vs full-motion run
    renderer.dispose();
  });

  it("suspend after settle stops the loop without destroying the world", () => {
    const { renderer, loop } = makeRenderer();
    const controller = new LoadingSceneController(computationalHyperspace);
    renderer.setScene(runningScene(controller));
    loop.flush(10);
    const rays = renderer.world.rays;
    renderer.suspend();
    expect(renderer.running).toBe(false);
    expect(renderer.world.rays).toBe(rays);
    renderer.resume();
    expect(renderer.running).toBe(true);
    renderer.dispose();
  });
});

describe("conservation of geometry (critical)", () => {
  it("rapid semantic sequence NEVER rebuilds the persistent world", () => {
    const { renderer, loop } = makeRenderer();
    const nowRef = { t: 0 };
    const controller = new LoadingSceneController(computationalHyperspace, { now: () => nowRef.t });

    const world = renderer.world;
    const rays = world.rays;
    const signals = world.signals;
    const layers = world.layers;
    const topology = world.topology;

    const sequence = ["reading", "thinking", "tool_execution", "tool_execution", "verification"] as const;
    let i = 0;
    for (const semantic of sequence) {
      nowRef.t += 40;
      controller.start({ operationId: `op-${i++}`, semantic, label: semantic });
      renderer.setScene(controller.getScene());
      loop.flush(3);
    }
    for (let j = 0; j < sequence.length; j++) {
      nowRef.t += 40;
      controller.complete(`op-${j}`);
      renderer.setScene(controller.getScene());
      loop.flush(3);
    }
    // success settle
    nowRef.t += 100;
    expect(controller.getScene().status).toBe("success");
    renderer.setScene(controller.getScene());
    loop.flush(30);

    // identity, not equality: same arrays, same world — nothing was rebuilt
    expect(renderer.world).toBe(world);
    expect(renderer.world.rays).toBe(rays);
    expect(renderer.world.signals).toBe(signals);
    expect(renderer.world.layers).toBe(layers);
    expect(renderer.world.topology).toBe(topology);
    expect(renderer.world.rays.length).toBe(computationalHyperspace.geometry.pathCount);
    renderer.dispose();
  });
});
