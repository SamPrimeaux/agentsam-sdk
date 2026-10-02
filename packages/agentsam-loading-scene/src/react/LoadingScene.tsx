import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { LoadingSceneController } from "../core/controller.js";
import type { ScenePreset } from "../core/types.js";
import { HyperspaceRenderer } from "../renderer/canvas-renderer.js";
import { useLoadingScene } from "./useLoadingScene.js";

export interface LoadingSceneProps {
  controller: LoadingSceneController;
  preset: ScenePreset;
  /** Content revealed through the settling geometry on success. */
  children?: ReactNode;
  reducedMotion?: boolean | "auto";
  style?: CSSProperties;
  className?: string;
}

/**
 * Mounts the single persistent canvas. On success the scene does not
 * get dismissed — it settles: geometry decelerates, luminance drops,
 * the real content fades in through it, then the renderer suspends.
 */
export function LoadingScene({
  controller,
  preset,
  children,
  reducedMotion = "auto",
  style,
  className,
}: LoadingSceneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<HyperspaceRenderer | null>(null);
  const scene = useLoadingScene(controller);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const renderer = new HyperspaceRenderer(preset, { canvas, reducedMotion });
    rendererRef.current = renderer;
    const fit = () => renderer.setSize(host.clientWidth, host.clientHeight);
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(host);
    renderer.setScene(controller.getScene());
    return () => {
      ro?.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [preset, reducedMotion, controller]);

  useEffect(() => {
    rendererRef.current?.setScene(scene);
    if (scene.status === "success") {
      const settleMs = preset.transition.settleMs;
      const reveal = setTimeout(() => setRevealed(true), settleMs * 0.4);
      const suspend = setTimeout(() => rendererRef.current?.suspend(), settleMs + 600);
      return () => {
        clearTimeout(reveal);
        clearTimeout(suspend);
      };
    }
    if (scene.status === "running" || scene.status === "waiting") {
      setRevealed(false);
      rendererRef.current?.resume();
    }
    return undefined;
  }, [scene, preset]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ position: "relative", overflow: "hidden", background: preset.palette.canvas, ...style }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: revealed ? 0 : 1,
          transition: `opacity ${preset.transition.settleMs}ms ease`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          opacity: revealed ? 1 : 0,
          transition: `opacity ${preset.transition.settleMs}ms ease ${Math.round(preset.transition.settleMs * 0.25)}ms`,
          pointerEvents: revealed ? "auto" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
