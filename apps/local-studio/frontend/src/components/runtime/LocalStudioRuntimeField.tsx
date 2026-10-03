import { useEffect, useRef } from "react";
import {
  HyperspaceRenderer,
  computationalHyperspace,
} from "@inneranimalmedia/agentsam-loading-scene";
import {
  LoadingSceneNarration,
  useLoadingScene,
} from "@inneranimalmedia/agentsam-loading-scene/react";
import { localStudioRuntimeVisuals } from "@/lib/runtime-visuals/local-studio-runtime";

export function LocalStudioRuntimeField({ blocking }: { blocking: boolean }) {
  const controller = localStudioRuntimeVisuals.controller;
  const scene = useLoadingScene(controller);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<HyperspaceRenderer | null>(null);

  useEffect(() => {
    if (blocking) localStudioRuntimeVisuals.startWorkspaceBoot();
    else localStudioRuntimeVisuals.completeWorkspaceBoot();
  }, [blocking]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const renderer = new HyperspaceRenderer(computationalHyperspace, {
      canvas,
      reducedMotion: "auto",
    });
    rendererRef.current = renderer;

    const fit = () => renderer.setSize(host.clientWidth, host.clientHeight);
    fit();
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    observer?.observe(host);
    renderer.setScene(controller.getScene());

    return () => {
      observer?.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [controller]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setScene(scene);
    if (scene.status === "running" || scene.status === "waiting" || scene.status === "error") {
      renderer.resume();
      return;
    }

    const timeout = window.setTimeout(
      () => renderer.suspend(),
      computationalHyperspace.transition.settleMs + 300,
    );
    return () => window.clearTimeout(timeout);
  }, [scene]);

  const active =
    blocking ||
    scene.status === "running" ||
    scene.status === "waiting" ||
    scene.status === "error";

  return (
    <div
      ref={hostRef}
      data-agentsam-runtime-field
      aria-hidden={active ? undefined : true}
      className={[
        "absolute inset-0 overflow-hidden transition-opacity duration-500",
        blocking ? "z-40 pointer-events-auto" : "z-20 pointer-events-none",
        active ? "opacity-100" : "opacity-0",
      ].join(" ")}
      style={{
        background: blocking ? computationalHyperspace.palette.canvas : "transparent",
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        style={{ opacity: blocking ? 1 : 0.34 }}
      />
      {active ? (
        <LoadingSceneStatus
          controller={controller}
          preset={computationalHyperspace}
          style={{
            position: "absolute",
            left: blocking ? "50%" : 18,
            top: blocking ? "50%" : "auto",
            bottom: blocking ? "auto" : 18,
            transform: blocking ? "translate(-50%, -50%)" : undefined,
            alignItems: blocking ? "center" : "flex-start",
            textAlign: blocking ? "center" : "left",
            pointerEvents: "none",
          }}
        />
      ) : null}
    </div>
  );
}
